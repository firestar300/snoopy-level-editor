/** Grid size — must match the game CONFIG. */
export const GRID_WIDTH = 9;
export const GRID_HEIGHT = 8;

/** Wall + pushables (single toolbar brush; variants in the sidebar panel). */
export const BLOCK_BRUSH_VARIANTS = [
  { value: '1', label: 'Wall (non-pushable)' },
  { value: '2', label: 'Pushable — all directions' },
  { value: 'A', label: 'Pushable — push ↑' },
  { value: 'B', label: 'Pushable — push ↓' },
  { value: 'C', label: 'Pushable — push ←' },
  { value: 'D', label: 'Pushable — push →' },
];

export const isBlockBrushChar = (c) => BLOCK_BRUSH_VARIANTS.some((o) => o.value === c);

/** Pushable block letters (2, A–D): can carry a hidden portal or power-up in the game JSON. */
export const isEmbeddablePushableBlockChar = (c) => isBlockBrushChar(c) && c !== '1';

/** Breakable destructible tile (`3`); may hide a power-up in the block (game JSON). */
export const BREAKABLE_TILE_CHAR = '3';
export const isBreakableTileChar = (c) => c === BREAKABLE_TILE_CHAR;

/** Full tile metadata for grid rendering (not only toolbar). */
const TILE_META_LIST = [
  { char: '0', label: 'Empty', sheet: null },
  { char: '1', label: 'Wall', sheet: { sx: 96, sy: 0 } },
  { char: '2', label: 'All directions', sheet: { sx: 96, sy: 0 } },
  { char: '3', label: 'Breakable', sheet: { sx: 112, sy: 0 } },
  { char: '4', label: 'Teleporter A', sheet: { sx: 80, sy: 16 } },
  { char: '5', label: 'Teleporter B', sheet: { sx: 80, sy: 16 } },
  { char: '6', label: 'Arrow up', sheet: { sx: 16, sy: 16 } },
  { char: '7', label: 'Arrow right', sheet: { sx: 48, sy: 16 } },
  { char: '8', label: 'Arrow down', sheet: { sx: 32, sy: 16 } },
  { char: '9', label: 'Arrow left', sheet: { sx: 64, sy: 16 } },
  { char: 'A', label: 'Push ↑', sheet: { sx: 96, sy: 0 } },
  { char: 'B', label: 'Push ↓', sheet: { sx: 96, sy: 0 } },
  { char: 'C', label: 'Push ←', sheet: { sx: 96, sy: 0 } },
  { char: 'D', label: 'Push →', sheet: { sx: 96, sy: 0 } },
  { char: 'E', label: 'Toggle block', sheet: 'toggle-passable' },
];

export const TILE_BY_CHAR = Object.fromEntries(TILE_META_LIST.map((t) => [t.char, t]));

/**
 * Tile toolbar: horizontal groups.
 * `kind: 'block'` = single button (always shows wall sprite); painting char comes from `blockVariant` state.
 */
export const TILE_TOOLBAR_GROUPS = [
  {
    id: 'blocks',
    label: 'Blocks',
    tiles: [
      { kind: 'block', label: 'Wall / pushable', sheet: { sx: 96, sy: 0 } },
      { char: '3', label: 'Breakable', sheet: { sx: 112, sy: 0 } },
      { char: 'E', label: 'Toggle block', sheet: 'toggle-passable' },
    ],
  },
  {
    id: 'teleport',
    label: 'Teleport',
    tiles: [
      { char: '4', label: 'Teleporter A', sheet: { sx: 80, sy: 16 } },
      { char: '5', label: 'Teleporter B', sheet: { sx: 80, sy: 16 } },
    ],
  },
  {
    id: 'arrows',
    label: 'Arrows',
    tiles: [
      { char: '6', label: 'Arrow up', sheet: { sx: 16, sy: 16 } },
      { char: '7', label: 'Arrow right', sheet: { sx: 48, sy: 16 } },
      { char: '8', label: 'Arrow down', sheet: { sx: 32, sy: 16 } },
      { char: '9', label: 'Arrow left', sheet: { sx: 64, sy: 16 } },
    ],
  },
];

/** Background music keys used by the game (audio-manager). */
export const MUSIC_TRACKS = [
  'stage-bgm-2',
  'stage-bgm-3',
  'stage-bgm-4',
  'stage-bgm-5',
  'stage-bgm-6',
  'stage-bgm-7',
  'stage-bgm-8',
  'stage-bgm-9',
  'stage-bgm-10',
  'stage-bgm-11',
];

/** MP3 filenames in `public/music/` (same assets as snoopys-magic-show `public/music/`). */
export const STAGE_BGM_AUDIO_FILENAMES = [
  '02-BGM-02.mp3',
  '04-BGM-03.mp3',
  '06-BGM-04.mp3',
  '08-BGM-05.mp3',
  '10-BGM-06.mp3',
  '12-BGM-07.mp3',
  '14-BGM-08.mp3',
  '16-BGM-09.mp3',
  '18-BGM-10.mp3',
  '20-BGM-11.mp3',
];

/** User-facing label for a stage BGM track (`Theme 1` … `Theme 10`). */
export const stageBgmThemeLabel = (track) => {
  const i = MUSIC_TRACKS.indexOf(track);
  if (i === -1) return track;
  return `Theme ${i + 1}`;
};

/** Absolute URL for preview playback (Vite `public/music/`). */
export const urlForStageBgmPreview = (track) => {
  const i = MUSIC_TRACKS.indexOf(track);
  if (i === -1 || !STAGE_BGM_AUDIO_FILENAMES[i]) return '';
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null ? import.meta.env.BASE_URL : '/';
  return `${base}music/${STAGE_BGM_AUDIO_FILENAMES[i]}`;
};

export const CLEAR_MUSIC_TRACKS = [
  'stage-clear-1',
  'stage-clear-2',
  'stage-clear-3',
  'stage-clear-4',
  'stage-clear-5',
  'stage-clear-6',
  'stage-clear-7',
  'stage-clear-8',
  'stage-clear-9',
  'stage-clear-10',
];

/**
 * Clear jingle paired with a stage BGM (matches snoopys-magic-show `src/levels`):
 * `stage-bgm-N` → `stage-clear-(N-1)` for N = 2 … 11.
 */
export const clearMusicForStageBgm = (music) => {
  const m = /^stage-bgm-(\d+)$/.exec(music);
  if (!m) return CLEAR_MUSIC_TRACKS[0];
  const n = parseInt(m[1], 10);
  const idx = n - 2;
  if (idx >= 0 && idx < CLEAR_MUSIC_TRACKS.length) return CLEAR_MUSIC_TRACKS[idx];
  return CLEAR_MUSIC_TRACKS[0];
};

export const normalizeMusicPair = (music) => {
  const m = MUSIC_TRACKS.includes(music) ? music : MUSIC_TRACKS[0];
  return { music: m, clearMusic: clearMusicForStageBgm(m) };
};

/**
 * Entity toolbar: one group. Portal and power-up are placed via the block brush (hidden), not here.
 * `ENTITY_PALETTE` adds those kinds for grid glyphs / inspector metadata.
 */
export const ENTITY_TOOLBAR_GROUPS = [
  {
    id: 'entities',
    label: 'Entities',
    items: [
      { type: 'woodstock', label: 'Woodstock' },
      { type: 'spike', label: 'Spike' },
      { type: 'ball', label: 'Ball' },
    ],
  },
];

/** Max placed entities per toolbar type (non-hidden only). */
export const ENTITY_TOOLBAR_PLACEMENT_LIMITS = {
  woodstock: 4,
  ball: 2,
  spike: 1,
};

/** Teleporter A / B tile characters — at most one of each per level. */
export const TELEPORT_TILE_A = '4';
export const TELEPORT_TILE_B = '5';

export const countTileCharOccurrences = (tiles, ch) =>
  tiles.reduce((n, row) => n + [...String(row)].filter((c) => c === ch).length, 0);

/** All entity kinds with icon metadata (toolbar + grid + hidden portal / power-up). */
export const ENTITY_PALETTE = [
  ...ENTITY_TOOLBAR_GROUPS.flatMap((g) => g.items),
  { type: 'powerup', label: 'Power-up' },
  {
    type: 'portal',
    label: 'Portal',
    iconKind: 'blocks',
    sheet: { sx: 80, sy: 16 },
  },
];
