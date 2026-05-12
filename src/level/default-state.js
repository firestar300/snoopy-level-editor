import { GRID_HEIGHT, GRID_WIDTH, MUSIC_TRACKS, clearMusicForStageBgm } from './constants.js';

const emptyRow = () => '0'.repeat(GRID_WIDTH);

export const createEmptyTiles = () => Array.from({ length: GRID_HEIGHT }, emptyRow);

export const createInitialState = () => ({
  name: 'Custom level',
  music: MUSIC_TRACKS[0],
  clearMusic: clearMusicForStageBgm(MUSIC_TRACKS[0]),
  startPosition: { x: 4, y: 4 },
  tiles: createEmptyTiles(),
  entities: [],
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
   * Tile indices for hidden power-up effect (pushable embed or breakable bonus); written as `destinationX` / `destinationY` on the entity.
   */
  blockBrushHiddenPowerupDestination: { destinationX: 4, destinationY: 4 },
  /** Next grid click sets blockBrushHiddenPowerupDestination and clears. */
  blockBrushPickingHiddenPowerupExit: false,
  /**
   * Hidden bonus on breakable tile (`3`): none, invincible, speed, or timer (`powerType: 'time'`).
   */
  blockBreakableBonus: 'none',
  /** Index in `entities` for the right-panel inspector (e.g. primary entity on the selected tile in Select mode). */
  selectedEntityIndex: null,
  /** Select mode: selected cell is player start and no entity is shown in the inspector. */
  inspectPlayerStart: false,
});
