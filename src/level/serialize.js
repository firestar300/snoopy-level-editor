import { GRID_HEIGHT, GRID_WIDTH } from './constants.js';

/**
 * Build a level object matching game JSON (see snoopys-magic-show src/levels).
 * @param {object} state
 * @returns {object}
 */
export const buildLevelPayload = (state) => {
  const tiles = state.tiles.map((row) => row.slice(0, GRID_WIDTH).padEnd(GRID_WIDTH, '0'));

  const entities = state.entities.map((e) => {
    const copy = { ...e };
    if (copy.type === 'portal' && copy.hidden) {
      copy.hidden = true;
      copy.blockX = copy.blockX ?? copy.x;
      copy.blockY = copy.blockY ?? copy.y;
    }
    return copy;
  });

  return {
    id: -1,
    name: String(state.name || 'Untitled').trim() || 'Untitled',
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    music: state.music,
    clearMusic: state.clearMusic,
    startPosition: { ...state.startPosition },
    tiles,
    entities,
  };
};

export const serializeLevel = (state) => JSON.stringify(buildLevelPayload(state), null, 2);
