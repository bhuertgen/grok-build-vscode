/**
 * Where this build of the extension is distributed, and whether the built-in
 * GitHub Releases update check should run.
 *
 * Store builds (VS Code Marketplace / Open VSX) are updated by the editor itself,
 * so they must never nag users to download a VSIX from GitHub. The publish
 * workflow packages the store VSIX with `GROK_BUILD_DISTRIBUTION=store`; esbuild
 * inlines that value as `__GROK_BUILD_DISTRIBUTION__` (see esbuild.mjs). Local
 * and GitHub-release builds default to `vsix` and keep the check.
 *
 * Pure module (no `vscode` import) so it can be unit-tested.
 */

declare const __GROK_BUILD_DISTRIBUTION__: string | undefined;

export type Distribution = 'store' | 'vsix';

/** Normalizes a raw build flag. Anything other than a store value means a manual VSIX. */
export function normalizeDistribution(raw: unknown): Distribution {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'store' || v === 'marketplace' || v === 'open-vsx' || v === 'openvsx'
    ? 'store'
    : 'vsix';
}

/** Distribution baked in at build time (`vsix` when the flag was not set). */
export const BUILD_DISTRIBUTION: Distribution = normalizeDistribution(
  typeof __GROK_BUILD_DISTRIBUTION__ !== 'undefined'
    ? __GROK_BUILD_DISTRIBUTION__
    : undefined
);

export interface UpdateCheckDecision {
  check: boolean;
  reason: 'vsix' | 'store-build' | 'gallery-install' | 'disabled-by-setting';
}

/**
 * Decide whether to query GitHub Releases for a newer VSIX.
 *
 * - `distribution === 'store'` (build flag) → skip.
 * - `galleryInstall` (VS Code reports the install came from a gallery, e.g.
 *   `packageJSON.__metadata.source === 'gallery'`) → skip; defense in depth when
 *   a store VSIX was built without the flag.
 * - `settingEnabled === false` (`grokBuild.checkExtensionUpdates`) → skip.
 * - otherwise (manual VSIX install) → check.
 */
export function decideExtensionUpdateCheck(opts: {
  distribution: Distribution;
  galleryInstall?: boolean;
  settingEnabled?: boolean;
}): UpdateCheckDecision {
  if (opts.distribution === 'store') {
    return { check: false, reason: 'store-build' };
  }
  if (opts.galleryInstall) {
    return { check: false, reason: 'gallery-install' };
  }
  if (opts.settingEnabled === false) {
    return { check: false, reason: 'disabled-by-setting' };
  }
  return { check: true, reason: 'vsix' };
}

/** True when VS Code's install metadata says the extension came from a gallery (Marketplace / Open VSX). */
export function isGalleryInstall(packageJSON: unknown): boolean {
  const meta = (packageJSON as { __metadata?: { source?: unknown } } | undefined)
    ?.__metadata;
  return typeof meta?.source === 'string' && meta.source.toLowerCase() === 'gallery';
}
