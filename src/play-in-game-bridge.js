/**
 * Passes world JSON from the level editor to snoopys-magic-show via localStorage (same origin).
 * Storage key must stay in sync with snoopys-magic-show `src/level/editor-launch-bridge.js`.
 *
 * Same-origin requirement: both apps must share the same scheme + host + port
 * (e.g. `https://<user>.github.io/<editor-repo>/` and `https://<user>.github.io/<game-repo>/`).
 * Cross-origin deployments need another transport (not implemented here).
 */
export const PLAY_WORLD_STORAGE_KEY = 'snoopy-level-editor-play-world-v1';

const normalizeBaseUrl = (url) => {
  const s = String(url).trim();
  if (!s) return '';
  return s.endsWith('/') ? s : `${s}/`;
};

/**
 * Base URL of the deployed game (trailing slash).
 * Override with `VITE_PLAY_GAME_URL` in `.env` for forks / other hosts.
 */
export const getPlayGameBaseUrl = () => {
  const fromEnv = import.meta.env?.VITE_PLAY_GAME_URL;
  if (fromEnv != null && String(fromEnv).trim())
    return normalizeBaseUrl(fromEnv);
  return 'https://firestar300.github.io/snoopys-magic-show/';
};

/**
 * @param {string} jsonString - Output of {@link serializeProjectForExport}
 */
export const queueWorldPayloadForGame = (jsonString) => {
  localStorage.setItem(PLAY_WORLD_STORAGE_KEY, jsonString);
};

export const openPlayGameInNewTab = () => {
  window.open(getPlayGameBaseUrl(), '_blank', 'noopener,noreferrer');
};
