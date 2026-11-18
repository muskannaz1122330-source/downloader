/**
 * Honest per-source health telemetry.
 *
 * The 222 entries in platformDefinitions.js are a CATALOGUE (UI/SEO/URL
 * classification), not 222 verified extractors. This module records REAL
 * analysis attempts (success, latency, failure code) and exposes them so the
 * admin UI can show `unverified` rather than a fabricated "222/222 working".
 *
 * State is in-memory and intentionally not persisted: a restart resets
 * verification evidence, which is the truthful behaviour.
 */
import { PLATFORM_DEFINITIONS } from '../data/platformDefinitions.js';

const MAX_SAMPLES = 100;

const DEDICATED_ADAPTERS = {
  youtube: { adapter: 'youtube_inner_tube', tier: 'T2_public_api' },
  youtube_shorts: { adapter: 'youtube_inner_tube', tier: 'T2_public_api' },
  youtube_music: { adapter: 'youtube_inner_tube', tier: 'T2_public_api' },
  terabox: { adapter: 'terabox_mirror_engine', tier: 'T2_public_api' },
  dailymotion: { adapter: 'dailymotion_metadata', tier: 'T2_public_api' },
  vimeo: { adapter: 'vimeo_player_config', tier: 'T2_public_api' },
  peertube: { adapter: 'peertube_api', tier: 'T2_public_api' },
  soundcloud: { adapter: 'soundcloud_api', tier: 'T2_public_api' },
};

const DRM_PLATFORMS = new Set([
  'netflix', 'disney_plus', 'prime_video', 'hulu', 'max', 'apple_tv_plus', 'peacock',
]);

const attempts = new Map();

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

export function recordSourceAttempt({
  platformId = 'unresolved',
  adapter = '',
  ok = false,
  durationMs = 0,
  failureCode = '',
}) {
  const id = String(platformId || 'unresolved');
  const rec = attempts.get(id) || {
    total: 0,
    succeeded: 0,
    samples: [],
    lastVerifiedAt: null,
    lastFailureReason: '',
    lastAdapter: '',
  };
  rec.total += 1;
  if (ok) {
    rec.succeeded += 1;
    rec.lastVerifiedAt = new Date().toISOString();
    rec.lastFailureReason = '';
  } else {
    rec.lastFailureReason = String(failureCode || 'UNKNOWN_ERROR');
  }
  rec.lastAdapter = adapter || rec.lastAdapter;
  rec.samples.push(Math.max(0, Number(durationMs) || 0));
  if (rec.samples.length > MAX_SAMPLES) rec.samples.shift();
  attempts.set(id, rec);
}

function statusFor(rec) {
  if (!rec || rec.total === 0) return 'unverified';
  const rate = rec.succeeded / rec.total;
  if (rate >= 0.8) return 'verified';
  if (rate >= 0.3) return 'degraded';
  return 'failing';
}

export function getSourcesHealth() {
  const sources = PLATFORM_DEFINITIONS.map((p) => {
    const dedicated = DEDICATED_ADAPTERS[p.id];
    const rec = attempts.get(p.id);
    const isDrm = DRM_PLATFORMS.has(p.id);
    return {
      sourceId: p.id,
      displayName: p.displayName,
      category: p.category,
      isAdult: Boolean(p.isAdult),
      adapter: dedicated?.adapter || (isDrm ? 'drm_blocked' : 'universal_deep_sniffer'),
      tier: isDrm ? 'T5_drm_blocked' : dedicated?.tier || 'T4_generic_fallback',
      status: isDrm ? 'blocked_drm' : statusFor(rec),
      attempts: rec?.total || 0,
      successRate: rec ? Number((rec.succeeded / rec.total).toFixed(3)) : null,
      p95Ms: rec ? percentile95(rec.samples) : null,
      lastVerifiedAt: rec?.lastVerifiedAt || null,
      lastFailureReason: rec?.lastFailureReason || '',
      lastAdapter: rec?.lastAdapter || '',
    };
  });

  const verified = sources.filter((s) => s.status === 'verified').length;
  return {
    generatedAt: new Date().toISOString(),
    catalogueSize: sources.length,
    dedicatedAdapterCount: Object.keys(DEDICATED_ADAPTERS).length,
    verifiedCount: verified,
    unverifiedCount: sources.filter((s) => s.status === 'unverified').length,
    blockedDrmCount: sources.filter((s) => s.status === 'blocked_drm').length,
    note:
      'A catalogue entry is not a verified extractor. Only sources with real ' +
      'successful analysis attempts are labelled verified; DRM services are never bypassed.',
    sources,
  };
}

export function resetSourceHealth() {
  attempts.clear();
}
