/**
 * Resolves a file from Vite `public/` for img src, CSS url(), Image(), Audio(), etc.
 * Uses `import.meta.env.BASE_URL` so paths work on GitHub Pages project sites.
 *
 * @param {string} path - e.g. `sprites/blocks.png` or `/sprites/blocks.png`
 * @returns {string}
 */
export const publicAssetUrl = (path) => {
  const base = import.meta.env.BASE_URL || '/';
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${normalized}`;
};
