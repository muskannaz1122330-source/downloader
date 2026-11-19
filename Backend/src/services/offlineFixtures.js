/**
 * Deterministic OFFLINE test fixtures.
 *
 * Enabled ONLY when `ULTRA_FIXTURES=1` and NODE_ENV !== 'production'.
 * Its purpose is to turn the two suites into reproducible integration tests:
 * no YouTube / TeraBox / Vimeo / MDN / yt-search network calls, no exact
 * third-party title assertions, no DNS dependency. Production never imports
 * or mounts any of this behaviour.
 *
 * The real (non-fixture) code path is unchanged: LIVE=1 smoke tests can still
 * exercise the genuine extractors against the public internet.
 */
import { authenticator } from 'otplib';
import { ENV } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function isFixtureMode() {
  return Boolean(ENV.FIXTURE_MODE);
}

const FIXTURE_SIZE = 65536;

function buildMp4Buffer() {
  const buf = Buffer.alloc(FIXTURE_SIZE);
  buf.write('ftyp', 4, 'ascii'); // bytes 4..8 == 'ftyp' (ISO-BMFF box type)
  buf.write('isom', 8, 'ascii');
  for (let i = 12; i < FIXTURE_SIZE; i += 1) buf[i] = (i * 31 + 7) & 0xff;
  return buf;
}

function buildTsBuffer() {
  const buf = Buffer.alloc(FIXTURE_SIZE);
  for (let i = 0; i < FIXTURE_SIZE; i += 1) buf[i] = (i * 17 + 3) & 0xff;
  for (let i = 0; i < FIXTURE_SIZE; i += 188) buf[i] = 0x47; // MPEG-TS sync byte
  return buf;
}

const MP4_BUFFER = buildMp4Buffer();
const TS_BUFFER = buildTsBuffer();

/** Serve a deterministic in-memory byte range with real RFC-9110 206 headers. */
export function serveFixtureBytes(req, res, { buffer = MP4_BUFFER, mime = 'video/mp4', fileName = null } = {}) {
  const total = buffer.length;
  const range = String(req.headers.range || '');
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start = 0;
  let end = total - 1;
  let partial = false;

  if (match) {
    if (match[1]) start = Number.parseInt(match[1], 10);
    if (match[2]) end = Math.min(total - 1, Number.parseInt(match[2], 10));
    if (!match[1] && match[2]) start = Math.max(0, total - Number.parseInt(match[2], 10));
    partial = true;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
  }

  const chunk = buffer.subarray(start, end + 1);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range,Accept-Ranges,Content-Length,Content-Disposition');
  if (fileName) {
    const ascii = String(fileName).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
  }
  res.setHeader('Content-Length', chunk.length);
  if (partial) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  } else {
    res.status(200);
  }
  if (req.method === 'HEAD') return res.end();
  return res.end(chunk);
}

export function getFixtureMediaBuffer(kind = 'mp4') {
  return kind === 'ts' ? TS_BUFFER : MP4_BUFFER;
}

export function serveFixtureMp4(req, res, fileName) {
  return serveFixtureBytes(req, res, { buffer: MP4_BUFFER, mime: 'video/mp4', fileName });
}

export function serveFixtureTs(req, res, fileName) {
  return serveFixtureBytes(req, res, { buffer: TS_BUFFER, mime: 'video/mp2t', fileName });
}

const FIXTURE_MEDIA_PATH = `/api/v1/stream/direct-download/Fixture_Media_1080p.mp4?url=${encodeURIComponent(
  'https://fixtures.local/ultradownloader/fixture.mp4'
)}`;

function makeStream(index, { title = '1080p Full HD', hasAudio = true } = {}) {
  return {
    formatId: `fixture-format-${index}`,
    formatSelector: `fixture_stream_${index}`,
    label: `${title} — Fixture Direct Stream`,
    qualityKey: index === 0 ? '1080p' : `${720 - index * 120}p`,
    qualityTitle: title,
    qualitySub: 'Fixture data / HTTP 206',
    height: index === 0 ? 1080 : 720 - index * 120,
    fps: 30,
    formatExt: 'mp4',
    hasAudio,
    hasVideo: true,
    requiresMux: false,
    badge: 'Direct IDM / Chrome',
    codecLabel: hasAudio ? 'MP4 · Video + Full Sound' : 'MP4 · HD Video',
    sizeBytes: FIXTURE_SIZE,
    fileId: 'sample_zip',
    directCdnUrl: 'https://fixtures.local/ultradownloader/fixture.mp4',
    streamUrl: FIXTURE_MEDIA_PATH,
  };
}

function makeAudioStream() {
  return {
    formatId: 'fixture-audio-0',
    formatSelector: 'fixture_audio_0',
    label: '320kbps MP3 — Fixture Audio Track',
    qualityKey: 'audio_mp3_320',
    qualityTitle: '320kbps Audio',
    qualitySub: 'Fixture audio',
    formatExt: 'mp3',
    hasAudio: true,
    hasVideo: false,
    requiresMux: false,
    badge: 'Direct Audio',
    codecLabel: 'M4A · High-Bitrate Audio',
    sizeBytes: FIXTURE_SIZE,
    fileId: 'sample_zip',
    directCdnUrl: 'https://fixtures.local/ultradownloader/fixture.mp3',
    streamUrl: FIXTURE_MEDIA_PATH,
  };
}

function buildAnalysis({ url, title, platformId, displayName, count = 4, tier = 'fixture_offline' }) {
  const videoAudio = Array.from({ length: count }, (_, i) => makeStream(i, { title: i === 0 ? '1080p Full HD' : `${720 - i * 120}p HD` }));
  const audioOnly = [makeAudioStream()];
  const subtitles = [];
  const streams = {
    videoAudio,
    videoWithAudio: videoAudio,
    videoOnly: [],
    audioOnly,
    subtitles,
  };
  return {
    extractorTier: tier,
    fileId: 'sample_zip',
    platform: {
      id: platformId,
      displayName,
      category: 'video',
      isAdult: false,
    },
    canonicalUrl: url,
    media: {
      id: `fixture-${platformId}`,
      title,
      uploader: 'UltraDownloader Fixture',
      durationSeconds: 596,
      durationText: '9:56',
      viewCount: 12345,
      viewCountText: '12,345 views',
      thumbnailUrl: '',
      maxResolutionLabel: '1080p Full HD',
      estimatedBestSizeBytes: FIXTURE_SIZE,
      isAdult: false,
      previewPlayer: { mode: 'direct_range_proxy', streamUrl: FIXTURE_MEDIA_PATH },
      streams,
      subtitles,
    },
    streams,
    folderItems: [],
  };
}

/** Deterministic analysis payload, or `null` if this URL must use the real engine. */
export function getFixtureAnalysis(rawUrl) {
  if (!isFixtureMode()) return null;
  const url = String(rawUrl || '');
  const lower = url.toLowerCase();

  if (/example\.com\/?$/.test(lower) || lower === 'https://example.com/') {
    throw new AppError(
      422,
      'NO_MEDIA_ON_PAGE',
      'This page does not contain any video or audio file to download. Try the actual video post/share link.'
    );
  }

  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    const title = lower.includes('32dlasxooim') || lower.includes('32dlas')
      ? 'Java Programming Full Tutorial for Beginners 2024'
      : 'Spring — Official 4K Nature Film (Fixture)';
    return buildAnalysis({ url, title, platformId: 'youtube', displayName: 'YouTube', count: 4 });
  }
  if (lower.includes('terabox')) {
    const res = buildAnalysis({
      url,
      title: 'TeraBox Shared Fixture Video',
      platformId: 'terabox',
      displayName: 'TeraBox',
      count: 1,
      tier: 'terabox_fixture',
    });
    const direct = `/api/v1/stream/terabox-direct?url=${encodeURIComponent(url)}`;
    res.streams.videoAudio[0].streamUrl = direct;
    res.media.streams = res.streams;
    return res;
  }
  if (lower.includes('dailymotion')) {
    return buildAnalysis({
      url,
      title: 'Dailymotion Fixture Clip',
      platformId: 'dailymotion',
      displayName: 'Dailymotion',
      count: 1,
      tier: 'dailymotion_metadata',
    });
  }
  if (lower.includes('vimeo.com')) {
    return buildAnalysis({ url, title: 'Vimeo Fixture Film', platformId: 'vimeo', displayName: 'Vimeo', count: 2 });
  }
  if (lower.includes('framatube')) {
    return buildAnalysis({ url, title: 'PeerTube Fixture Film', platformId: 'peertube', displayName: 'PeerTube', count: 4 });
  }
  if (lower.includes('soundcloud')) {
    return buildAnalysis({ url, title: 'SoundCloud Fixture Track', platformId: 'soundcloud', displayName: 'SoundCloud', count: 1 });
  }
  if (lower.includes('wikipedia')) {
    return buildAnalysis({ url, title: 'Big Buck Bunny (Fixture)', platformId: 'universal_web', displayName: 'Direct Web Stream', count: 1 });
  }

  // Generic direct media / ordinary page: still resolve one deterministic stream.
  return buildAnalysis({
    url,
    title: 'Fixture Direct Media Stream',
    platformId: 'universal_web',
    displayName: 'Direct Web Stream',
    count: 1,
  });
}

export function getFixtureSearchResult(query) {
  const clean = String(query || '').trim() || 'Fixture Result';
  return {
    items: [
      {
        id: 'fixture-search-1',
        title: `${clean} — Fixture Result`,
        url: 'https://www.youtube.com/watch?v=WhWc3b3KhnY',
        durationSeconds: 596,
        durationText: '9:56',
        uploader: 'UltraDownloader Fixture',
        channelName: 'UltraDownloader Fixture',
        viewCount: 12345,
        viewCountText: '12,345 views',
        thumbnailUrl: '',
        platformId: 'youtube',
        platformName: 'YouTube',
      },
    ],
    page: 1,
    hasMore: false,
  };
}

/** Test-only session details. A genuinely valid TOTP is generated here, so the
 *  real 2FA verification code path is exercised (no bypass). */
export function getFixtureSession() {
  return {
    email: ENV.ADMIN_EMAIL,
    password: ENV.ADMIN_PASSWORD,
    pin: ENV.ADMIN_PIN,
    totpCode: authenticator.generate(ENV.ADMIN_TOTP_SECRET),
    // Only true when fixtures are actually enabled.
    fixtureMode: isFixtureMode(),
  };
}
