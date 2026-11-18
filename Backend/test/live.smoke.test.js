import { describe, it, expect } from 'vitest';
import { analyzeMediaUrl } from '../src/services/extractorEngine.js';

/**
 * OPT-IN integration smoke test against the real public internet.
 * Default `npm test` is fully offline/fixture-based; run this only when you
 * deliberately want to verify live extractors: `LIVE=1 npm run test:live`.
 */
const LIVE = process.env.LIVE === '1';

describe.skipIf(!LIVE)('LIVE extractor smoke suite (network required)', () => {
  it('resolves a direct public MP4 file', async () => {
    const result = await analyzeMediaUrl({
      rawUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    });
    expect(result?.streams?.videoAudio?.length).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('reports DRM-protected services honestly instead of bypassing them', async () => {
    await expect(
      analyzeMediaUrl({ rawUrl: 'https://www.netflix.com/watch/80057281' })
    ).rejects.toMatchObject({ code: 'DRM_PROTECTED' });
  }, 30000);
});
