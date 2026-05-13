import { defineConfig } from 'vite';

/**
 * GitHub Pages: project site is served at https://<user>.github.io/<repo>/
 * User/organization site repo (<name>.github.io) is served at the domain root.
 */
const resolveBase = () => {
  const fromEnv = process.env.VITE_BASE?.trim();
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;

  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (!repo) return '/';
  if (/^[^.]+\.github\.io$/i.test(repo)) return '/';
  return `/${repo}/`;
};

// https://vite.dev/config/
export default defineConfig({
  base: resolveBase(),
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    port: 5174,
    open: true,
  },
});
