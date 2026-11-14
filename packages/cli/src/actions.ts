/**
 * Third-party GitHub Actions pinned to full commit SHAs (resolved from release tags with
 * `git ls-remote` on 2026-11-13). Used by `motionpr init --github` and mirrored in docs.
 */
export const PINNED_ACTIONS = {
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
  setupNode: "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0",
  uploadArtifact: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2",
  pnpmSetup: "pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1",
} as const;
