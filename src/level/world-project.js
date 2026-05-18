import { GRID_HEIGHT, GRID_WIDTH, MUSIC_TRACKS, normalizeMusicPair } from './constants.js';
import { buildLevelPayload, serializeLevel } from './serialize.js';
import {
  applyLevelSliceToState,
  createEmptyLevelSlice,
  deepCloneLevelSlice,
  extractLevelSliceFromState,
} from './level-slice.js';
import { validateLevelSlice } from './stage-validation.js';

export const WORLD_FORMAT = 'snoopy-world-v1';

export const DEFAULT_WORLD_NAME = 'Untitled world';

/** Normalize a single game-style level object into a level slice (no editor chrome). */
export const sliceFromLooseLevelJson = (data) => {
  const tilesIn = Array.isArray(data?.tiles) ? data.tiles : [];
  const tiles = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = String(tilesIn[y] || '').replace(/[^0-9A-E]/g, '0');
    tiles.push(row.padEnd(GRID_WIDTH, '0').slice(0, GRID_WIDTH));
  }
  const entities = Array.isArray(data?.entities) ? data.entities.map((e) => ({ ...e })) : [];
  const audio = normalizeMusicPair(data?.music ?? MUSIC_TRACKS[0]);
  return {
    name: data?.name ?? 'Imported',
    music: audio.music,
    clearMusic: audio.clearMusic,
    startPosition: {
      x: Math.min(GRID_WIDTH - 1, Math.max(0, data?.startPosition?.x ?? 4)),
      y: Math.min(GRID_HEIGHT - 1, Math.max(0, data?.startPosition?.y ?? 4)),
    },
    tiles,
    entities,
  };
};

/**
 * Copy the active editor level into `state.world.stages[activeStageIndex]`.
 * @param {object} state
 */
export const persistActiveWorldStage = (state) => {
  const w = state.world;
  if (!w?.stages?.length) return;
  const i = w.activeStageIndex;
  if (i < 0 || i >= w.stages.length) return;
  w.stages[i] = extractLevelSliceFromState(state);
};

/**
 * Persist, then load another stage index into the flat editor fields.
 * @param {object} state
 * @param {number} index
 */
export const loadWorldStageIndex = (state, index) => {
  persistActiveWorldStage(state);
  const w = state.world;
  if (!w?.stages?.length) return;
  const i = Math.max(0, Math.min(w.stages.length - 1, index));
  w.activeStageIndex = i;
  applyLevelSliceToState(state, w.stages[i]);
};

/**
 * Append a new empty stage and switch to it.
 * @param {object} state
 */
export const appendEmptyWorldStage = (state) => {
  persistActiveWorldStage(state);
  const nextNum = state.world.stages.length + 1;
  const neu = createEmptyLevelSlice(nextNum);
  state.world.stages.push(deepCloneLevelSlice(neu));
  state.world.activeStageIndex = state.world.stages.length - 1;
  applyLevelSliceToState(state, state.world.stages[state.world.activeStageIndex]);
};

/**
 * Remove a stage by index. At least one stage remains.
 * @param {object} state
 * @param {number} removeIdx
 * @returns {boolean}
 */
export const removeWorldStageAt = (state, removeIdx) => {
  persistActiveWorldStage(state);
  const w = state.world;
  if (!w?.stages || w.stages.length <= 1) return false;
  if (removeIdx < 0 || removeIdx >= w.stages.length) return false;
  w.stages.splice(removeIdx, 1);
  let next = w.activeStageIndex;
  if (removeIdx < w.activeStageIndex) next -= 1;
  else if (removeIdx === w.activeStageIndex) next = Math.min(removeIdx, w.stages.length - 1);
  w.activeStageIndex = Math.max(0, next);
  applyLevelSliceToState(state, w.stages[w.activeStageIndex]);
  return true;
};

/**
 * Target index in `stages` after dropping a card (before/after a hovered card).
 * @param {number} fromIdx
 * @param {number} overIdx
 * @param {boolean} insertAfter
 * @returns {number}
 */
export const computeWorldStageReorderTargetIndex = (fromIdx, overIdx, insertAfter) => {
  let target = insertAfter ? overIdx + 1 : overIdx;
  if (fromIdx < target) target -= 1;
  return target;
};

/**
 * Move a stage from one index to another and keep the active stage selection in sync.
 * @param {object} state
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {boolean}
 */
export const reorderWorldStage = (state, fromIndex, toIndex) => {
  persistActiveWorldStage(state);
  const w = state.world;
  if (!w?.stages?.length) return false;
  const len = w.stages.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) return false;
  if (fromIndex === toIndex) return false;
  const [item] = w.stages.splice(fromIndex, 1);
  w.stages.splice(toIndex, 0, item);
  const active = w.activeStageIndex;
  let newActive = active;
  if (active === fromIndex) newActive = toIndex;
  else if (fromIndex < active && toIndex >= active) newActive = active - 1;
  else if (fromIndex > active && toIndex <= active) newActive = active + 1;
  w.activeStageIndex = newActive;
  applyLevelSliceToState(state, w.stages[w.activeStageIndex]);
  return true;
};

export const allWorldStagesValid = (state) => {
  persistActiveWorldStage(state);
  for (let i = 0; i < state.world.stages.length; i++) {
    const { valid } = validateLevelSlice(state.world.stages[i]);
    if (!valid) return false;
  }
  return true;
};

export const firstInvalidWorldStage = (state) => {
  persistActiveWorldStage(state);
  for (let i = 0; i < state.world.stages.length; i++) {
    const { valid, errors } = validateLevelSlice(state.world.stages[i]);
    if (!valid) return { index: i, errors };
  }
  return null;
};

export const serializeProjectForExport = (state) => {
  persistActiveWorldStage(state);
  const w = state.world;
  if (!w?.stages?.length) return serializeLevel(state);
  if (w.stages.length === 1) return serializeLevel(state);
  const stages = w.stages.map((slice) => {
    const tmp = { ...state, ...slice };
    return buildLevelPayload(tmp);
  });
  const payload = {
    format: WORLD_FORMAT,
    name: String(w.name || DEFAULT_WORLD_NAME).trim() || DEFAULT_WORLD_NAME,
    stages,
  };
  return JSON.stringify(payload, null, 2);
};

/**
 * If `data` is a multi-stage document, return a `world` object; otherwise `null`.
 * @param {object} data
 * @returns {{ world: { name: string, activeStageIndex: number, stages: object[] } } | null}
 */
/**
 * Stages contributed by one parsed JSON root (single level or multi-stage world).
 * @param {object} data
 * @returns {{ worldName: string | null, stages: object[] }}
 */
export const stagesFromImportDocument = (data) => {
  const worldDoc = parseWorldDocumentFromImportData(data);
  if (worldDoc) {
    return {
      worldName: worldDoc.world.name,
      stages: worldDoc.world.stages.map((s) => deepCloneLevelSlice(s)),
    };
  }
  if (data && typeof data === 'object' && Array.isArray(data.tiles)) {
    const slice = sliceFromLooseLevelJson(data);
    const levelName =
      typeof data.name === 'string' && data.name.trim() ? data.name.trim() : slice.name;
    return {
      worldName: levelName,
      stages: [deepCloneLevelSlice({ ...slice, name: levelName })],
    };
  }
  throw new Error('Unrecognized level or world JSON');
};

/**
 * Merge several imported documents into one world (stages appended in file order).
 * @param {{ fileName?: string, data: object }[]} documents
 * @returns {{ world: { name: string, activeStageIndex: number, stages: object[] } }}
 */
export const mergeImportDocumentsToWorld = (documents) => {
  if (!documents?.length) throw new Error('No files selected.');
  let worldName = null;
  const stages = [];
  const errors = [];
  for (const { fileName, data } of documents) {
    try {
      const chunk = stagesFromImportDocument(data);
      if (chunk.worldName && worldName == null) worldName = chunk.worldName;
      stages.push(...chunk.stages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(fileName ? `${fileName}: ${msg}` : msg);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  if (!stages.length) throw new Error('No levels found in the selected files.');
  return {
    world: {
      name: worldName || String(stages[0]?.name || '').trim() || DEFAULT_WORLD_NAME,
      activeStageIndex: 0,
      stages,
    },
  };
};

export const parseWorldDocumentFromImportData = (data) => {
  if (!data || typeof data !== 'object') return null;
  const hasRootTiles = Array.isArray(data.tiles);
  const isWorld =
    data.format === WORLD_FORMAT ||
    (Array.isArray(data.stages) &&
      data.stages.length > 0 &&
      typeof data.stages[0] === 'object' &&
      Array.isArray(data.stages[0].tiles) &&
      !hasRootTiles);
  if (!isWorld) return null;
  if (!Array.isArray(data.stages) || data.stages.length === 0) return null;

  const worldName =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : typeof data.worldName === 'string' && data.worldName.trim()
        ? data.worldName.trim()
        : DEFAULT_WORLD_NAME;
  const stages = data.stages.map((s) => sliceFromLooseLevelJson(s));
  return {
    world: {
      name: worldName,
      activeStageIndex: 0,
      stages,
    },
  };
};
