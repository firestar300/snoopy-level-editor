import { GRID_HEIGHT, GRID_WIDTH, MUSIC_TRACKS, clearMusicForStageBgm } from './constants.js';
import { createEmptyLevelSlice, deepCloneLevelSlice } from './level-slice.js';
import { DEFAULT_WORLD_NAME } from './world-project.js';

const emptyRow = () => '0'.repeat(GRID_WIDTH);

/** @deprecated Prefer `createEmptyLevelSlice` from `level-slice.js` for new code. */
export const createEmptyTiles = () => Array.from({ length: GRID_HEIGHT }, emptyRow);

export const createInitialState = () => {
  const L = createEmptyLevelSlice(1);
  return {
    name: L.name,
    music: L.music,
    clearMusic: L.clearMusic,
    startPosition: { ...L.startPosition },
    tiles: L.tiles.map((row) => row),
    entities: [],
    world: {
      name: DEFAULT_WORLD_NAME,
      activeStageIndex: 0,
      stages: [deepCloneLevelSlice(L)],
    },
    tool: { mode: 'tile', char: '1', tileEdit: 'add' },
    /** Selected grid cell in `tileEdit === 'select'` (any known level tile). */
    selectedTileCell: null,
    /** Pending drag in Select mode: tile move, entity move, or player-start move; optional `hoverX` / `hoverY`; `entityDragIndex` | `playerStartDrag`. */
    tileMoveDrag: null,
    /** Wall (1) or pushable variant (2, A–D); used with the single block toolbar button. */
    blockVariant: '1',
    /**
     * When painting embeddable pushable blocks: hidden entity kind for the brush.
     * `timer` → `powerType: 'time'`; `speed` → `powerType: 'speed'`; `powerup` → invincible.
     */
    blockBrushEmbed: 'none',
    /** Default portal exit (tile indices) for new hidden portals placed with the block brush. */
    blockBrushPortalDestination: { destinationX: 4, destinationY: 4 },
    /** Next grid click sets blockBrushPortalDestination and clears. */
    blockBrushPickingPortalExit: false,
    /**
     * Hidden bonus exit on directional pushables (A–D): one cell. Omni pushable (`2`) uses `blockBrushHiddenPowerupTargets`.
     * Serialized to JSON as identical `targets` entries per direction.
     */
    blockBrushHiddenBonusDestination: { destinationX: 4, destinationY: 4 },
    /** Next grid click sets blockBrushHiddenBonusDestination and clears. */
    blockBrushPickingHiddenBonusExit: false,
    /**
     * Per reveal direction (`up` / `down` / `left` / `right`): bonus exit tile `{ x, y }` (game JSON `targets`).
     * Pushable blocks use push direction; breakable blocks use Snoopy facing when breaking.
     */
    blockBrushHiddenPowerupTargets: {
      up: { x: 4, y: 4 },
      down: { x: 4, y: 4 },
      left: { x: 4, y: 4 },
      right: { x: 4, y: 4 },
    },
    /** Next grid click applies to all directions when null, else only this direction key. */
    blockBrushPickingHiddenPowerupExitDir: null,
    /** Next grid click updates `blockBrushHiddenPowerupTargets` then clears. */
    blockBrushPickingHiddenPowerupExit: false,
    /**
     * Hidden bonus on breakable tile (`3`): none, invincible, speed, or timer (`powerType: 'time'`).
     */
    blockBreakableBonus: 'none',
    /** Index in `entities` for the right-panel inspector (e.g. primary entity on the selected tile in Select mode). */
    selectedEntityIndex: null,
    /** Select mode: selected cell is player start and no entity is shown in the inspector. */
    inspectPlayerStart: false,
  };
};
