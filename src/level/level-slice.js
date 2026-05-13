import { GRID_HEIGHT, GRID_WIDTH, MUSIC_TRACKS, clearMusicForStageBgm } from './constants.js';

const emptyRow = () => '0'.repeat(GRID_WIDTH);
const createEmptyTiles = () => Array.from({ length: GRID_HEIGHT }, emptyRow);

/**
 * Plain level data shared by the active editor and `state.world.stages[]`.
 * @param {number} [levelNumber=1] 1-based index for the default display name (`Level N`).
 */
export const createEmptyLevelSlice = (levelNumber = 1) => ({
  name: `Level ${Math.max(1, Math.floor(levelNumber))}`,
  music: MUSIC_TRACKS[0],
  clearMusic: clearMusicForStageBgm(MUSIC_TRACKS[0]),
  startPosition: { x: 4, y: 4 },
  tiles: createEmptyTiles(),
  entities: [],
});

export const deepCloneLevelSlice = (slice) => ({
  name: slice.name,
  music: slice.music,
  clearMusic: slice.clearMusic,
  startPosition: { ...slice.startPosition },
  tiles: slice.tiles.map((row) => String(row).slice(0, GRID_WIDTH).padEnd(GRID_WIDTH, '0')),
  entities: slice.entities.map((e) => ({ ...e })),
});

/**
 * Copy level fields from editor `state` into a serializable slice (no editor chrome).
 * @param {object} state
 */
export const extractLevelSliceFromState = (state) => ({
  name: state.name,
  music: state.music,
  clearMusic: state.clearMusic,
  startPosition: { ...state.startPosition },
  tiles: state.tiles.map((row) => String(row).slice(0, GRID_WIDTH).padEnd(GRID_WIDTH, '0')),
  entities: state.entities.map((e) => ({ ...e })),
});

/**
 * Apply a slice onto editor `state` (mutates level fields only).
 * @param {object} state
 * @param {object} slice
 */
export const applyLevelSliceToState = (state, slice) => {
  state.name = slice.name;
  state.music = slice.music;
  state.clearMusic = slice.clearMusic;
  state.startPosition = { ...slice.startPosition };
  state.tiles = slice.tiles.map((row) => String(row).slice(0, GRID_WIDTH).padEnd(GRID_WIDTH, '0'));
  state.entities = slice.entities.map((e) => ({ ...e }));
};

export const levelSlicesEqual = (a, b) => {
  if (!a || !b) return false;
  if (a.name !== b.name || a.music !== b.music || a.clearMusic !== b.clearMusic) return false;
  if (a.startPosition?.x !== b.startPosition?.x || a.startPosition?.y !== b.startPosition?.y) return false;
  if (a.tiles.length !== b.tiles.length) return false;
  for (let y = 0; y < a.tiles.length; y++) if (a.tiles[y] !== b.tiles[y]) return false;
  if (a.entities.length !== b.entities.length) return false;
  for (let i = 0; i < a.entities.length; i++) {
    if (JSON.stringify(a.entities[i]) !== JSON.stringify(b.entities[i])) return false;
  }
  return true;
};
