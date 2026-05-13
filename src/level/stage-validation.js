import {
  GRID_HEIGHT,
  GRID_WIDTH,
  MUSIC_TRACKS,
  TELEPORT_TILE_A,
  TELEPORT_TILE_MAX_PER_STAGE,
  countTileCharOccurrences,
  normalizeMusicPair,
} from './constants.js';

/** Legacy tile `5` (second teleporter type in older levels); not allowed in new exports. */
const TELEPORT_TILE_LEGACY_B = '5';

const cellAt = (tiles, x, y) => {
  const row = tiles[y];
  if (row == null) return '0';
  return String(row)[x] ?? '0';
};

const normalizeTiles = (tilesIn) => {
  const tiles = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = String(tilesIn[y] || '').replace(/[^0-9A-E]/g, '0');
    tiles.push(row.padEnd(GRID_WIDTH, '0').slice(0, GRID_WIDTH));
  }
  return tiles;
};

/**
 * Validate a level slice for multi-stage export / "Add stage" gating.
 * @param {object} slice
 * @returns {{ valid: boolean, errors: string[] }}
 */
export const validateLevelSlice = (slice) => {
  const errors = [];
  const tiles = normalizeTiles(slice.tiles || []);

  const sx = slice.startPosition?.x;
  const sy = slice.startPosition?.y;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) errors.push('Player start: invalid coordinates');
  else {
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);
    if (ix < 0 || ix >= GRID_WIDTH || iy < 0 || iy >= GRID_HEIGHT)
      errors.push('Player start: out of bounds');
    else if (cellAt(tiles, ix, iy) !== '0') errors.push('Player start: must be on an empty tile');
  }

  const teleportCount = countTileCharOccurrences(tiles, TELEPORT_TILE_A);
  if (teleportCount > TELEPORT_TILE_MAX_PER_STAGE)
    errors.push(`Teleporter: at most ${TELEPORT_TILE_MAX_PER_STAGE} tiles per stage`);
  if (teleportCount === 1) errors.push('Teleporter: need exactly 0 or 2 tiles (incomplete pair)');
  if (countTileCharOccurrences(tiles, TELEPORT_TILE_LEGACY_B) > 0)
    errors.push('Teleporter (tile 5): no longer supported; use two tiles 4 for a pair');

  const pair = normalizeMusicPair(slice.music ?? MUSIC_TRACKS[0]);
  if (!MUSIC_TRACKS.includes(pair.music)) errors.push('Music: unknown track');

  const entities = Array.isArray(slice.entities) ? slice.entities : [];
  const seenCells = new Map();
  const toolbarCounts = { woodstock: 0, ball: 0, spike: 0 };

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!e || typeof e !== 'object') {
      errors.push(`Entity ${i + 1}: invalid`);
      continue;
    }
    const x = e.x;
    const y = e.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      errors.push(`Entity ${i + 1}: invalid position`);
      continue;
    }
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= GRID_WIDTH || iy < 0 || iy >= GRID_HEIGHT) {
      errors.push(`Entity ${i + 1}: position out of bounds`);
      continue;
    }

    if (!e.hidden) {
      const k = `${ix},${iy}`;
      if (seenCells.has(k)) errors.push(`Entity ${i + 1}: overlaps another entity at (${ix + 1},${iy + 1})`);
      else seenCells.set(k, e.type);
    }

    const t = e.type;
    if (t === 'woodstock' || t === 'ball' || t === 'spike') {
      if (!e.hidden) toolbarCounts[t] = (toolbarCounts[t] || 0) + 1;
    }

    if (t === 'ball') {
      const vx = e.vx;
      const vy = e.vy;
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) errors.push(`Ball ${i + 1}: missing vx / vy`);
    }
  }

  if (toolbarCounts.woodstock !== 4)
    errors.push(`Woodstock: need exactly 4 (found ${toolbarCounts.woodstock})`);
  if (toolbarCounts.ball < 1 || toolbarCounts.ball > 2)
    errors.push(`Ball: need 1 or 2 (found ${toolbarCounts.ball})`);
  if (toolbarCounts.spike > 1)
    errors.push(`Spike: need 0 or 1 (found ${toolbarCounts.spike})`);

  return { valid: errors.length === 0, errors };
};
