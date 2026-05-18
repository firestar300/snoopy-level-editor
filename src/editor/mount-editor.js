import {
  BLOCK_BRUSH_VARIANTS,
  countTileCharOccurrences,
  ENTITY_PALETTE,
  ENTITY_TOOLBAR_GROUPS,
  ENTITY_TOOLBAR_PLACEMENT_LIMITS,
  GRID_HEIGHT,
  GRID_WIDTH,
  isBlockBrushChar,
  isBlockPushableToolbarShortcutChar,
  isBreakableTileChar,
  isEmbeddablePushableBlockChar,
  MUSIC_TRACKS,
  normalizeMusicPair,
  stageBgmThemeLabel,
  TELEPORT_TILE_A,
  TELEPORT_TILE_MAX_PER_STAGE,
  TILE_BY_CHAR,
  TILE_TOOLBAR_GROUPS,
  urlForStageBgmPreview,
} from '../level/constants.js';
import { createInitialState } from '../level/default-state.js';
import {
  applyLevelSliceToState,
  createEmptyLevelSlice,
  deepCloneLevelSlice,
  extractLevelSliceFromState,
  levelSlicesEqual,
} from '../level/level-slice.js';
import { validateLevelSlice } from '../level/stage-validation.js';
import {
  allWorldStagesValid,
  appendEmptyWorldStage,
  DEFAULT_WORLD_NAME,
  firstInvalidWorldStage,
  loadWorldStageIndex,
  persistActiveWorldStage,
  parseWorldDocumentFromImportData,
  computeWorldStageReorderTargetIndex,
  removeWorldStageAt,
  reorderWorldStage,
  serializeProjectForExport,
} from '../level/world-project.js';
import {
  getPlayGameBaseUrl,
  openPlayGameInNewTab,
  queueWorldPayloadForGame,
} from '../play-in-game-bridge.js';
import { publicAssetUrl } from '../public-asset-url.js';
import { getEntitySpriteStyle, getSnoopyStartMarkerStyle } from './entity-sprites.js';
import { getGbSpriteUrl, SPRITE_BLOCKS } from './gb-sprite-urls.js';
import './editor.css';

/** Cell characters allowed in Select mode for the sidebar (all level tiles from schema). */
const isSelectableInspectorTile = (c) => TILE_BY_CHAR[c] != null;

/** Pixel size of one grid cell in world-strip stage previews. */
const STAGE_PREVIEW_CELL_PX = 8;
/** Approximate Game Boy–style tile colors for mini previews (char → hex). */
const STAGE_PREVIEW_TILE_HEX = {
  '0': '#8bac0f',
  '1': '#306230',
  '2': '#3d8048',
  '3': '#c4a35a',
  '4': '#5c4eb8',
  '5': '#7d6ee0',
  '6': '#3d7ab8',
  '7': '#b86a3d',
  '8': '#3db88a',
  '9': '#b83d8a',
  A: '#4a7038',
  B: '#4a4a68',
  C: '#684a38',
  D: '#386868',
  E: '#7a9444',
};

const BLOCKS_SPRITE_PATH = SPRITE_BLOCKS;
const BLOCKS_SHEET_W = 144;
const BLOCKS_SHEET_H = 32;
const BLOCKS_FRAME = 16;

/**
 * One 16×16 block from blocks.png scaled to an `outPx` square.
 * Uses `background-origin: border-box` and rounds sizes so the full frame stays inside the box
 * (avoids sub-pixel clipping from overflow + border-radius on thumbs).
 */
const tileStyleFromSheet = (sx, sy, outPx) => {
  const scale = outPx / BLOCKS_FRAME;
  const bgw = Math.round(BLOCKS_SHEET_W * scale);
  const bgh = Math.round(BLOCKS_SHEET_H * scale);
  const posX = Math.round(sx * scale);
  const posY = Math.round(sy * scale);
  const sheetUrl = getGbSpriteUrl(BLOCKS_SPRITE_PATH);
  return [
    `background-image:url("${sheetUrl}")`,
    `background-size:${bgw}px ${bgh}px`,
    `background-position:-${posX}px -${posY}px`,
    'background-repeat:no-repeat',
    'background-origin:border-box',
    'background-clip:border-box',
    'image-rendering:pixelated',
  ].join(';');
};

/** 32 = 2× native frame — sharp scaling for grid and toolbar. */
const GRID_TILE_PX = 32;
/** Hidden bonus (power-up or portal in block): 50% of grid cell, top-right on pushable / breakable. */
const HIDDEN_BONUS_BADGE_PX = Math.round(GRID_TILE_PX * 0.5);
/** Sizes for pushable direction badges (same proportions as grid: omni 25%, single-dir 50% of cell). */
const pushableDirBadgeSizesFromCellPx = (cellPx) => ({
  omniArrow: Math.round(cellPx * 0.25),
  singleArrow: Math.round(cellPx * 0.5),
});

/**
 * Arrow overlay for embeddable pushable tiles (`2`, `A`–`D`).
 * @param {HTMLElement} container - positioning context (`position: relative` recommended)
 * @param {string} char
 * @param {number} cellPx
 * @param {{ accessible?: boolean }} [options] - grid cells use accessible labels; toolbar/preview use decorative only
 */
const appendPushableDirectionBadge = (container, char, cellPx, options = {}) => {
  const { accessible = false } = options;
  if (!isEmbeddablePushableBlockChar(char)) return;

  const { omniArrow: om, singleArrow: px } = pushableDirBadgeSizesFromCellPx(cellPx);

  if (char === '2') {
    const wrap = document.createElement('div');
    wrap.className = 'editor__pushable-dir-badge editor__pushable-dir-badge--omni';
    if (accessible) {
      wrap.setAttribute('role', 'img');
      wrap.setAttribute(
        'aria-label',
        'Pushable block — can be pushed in all four directions'
      );
    } else {
      wrap.setAttribute('role', 'presentation');
      wrap.setAttribute('aria-hidden', 'true');
    }
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = `${om}px ${om}px`;
    wrap.style.gridTemplateRows = `${om}px ${om}px`;
    wrap.style.width = `${om * 2}px`;
    wrap.style.height = `${om * 2}px`;
    const omniOrder = ['6', '7', '9', '8'];
    for (const ac of omniOrder) {
      const tileMeta = TILE_BY_CHAR[ac];
      const icon = document.createElement('div');
      icon.className = 'editor__pushable-dir-badge-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = `${tileStyleFromSheet(tileMeta.sheet.sx, tileMeta.sheet.sy, om)};width:${om}px;height:${om}px`;
      wrap.appendChild(icon);
    }
    container.appendChild(wrap);
    return;
  }

  const arrowChar = char === 'A' ? '6' : char === 'B' ? '8' : char === 'C' ? '9' : char === 'D' ? '7' : null;
  if (!arrowChar) return;
  const tileMeta = TILE_BY_CHAR[arrowChar];
  const wrap = document.createElement('div');
  wrap.className = 'editor__pushable-dir-badge';
  if (accessible) {
    wrap.setAttribute('role', 'img');
    const dirLabel =
      char === 'A' ? 'upward' : char === 'B' ? 'downward' : char === 'C' ? 'to the left' : 'to the right';
    wrap.setAttribute('aria-label', `Pushable — only ${dirLabel}`);
  } else {
    wrap.setAttribute('role', 'presentation');
    wrap.setAttribute('aria-hidden', 'true');
  }
  const icon = document.createElement('div');
  icon.className = 'editor__pushable-dir-badge-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.cssText = `${tileStyleFromSheet(tileMeta.sheet.sx, tileMeta.sheet.sy, px)};width:${px}px;height:${px}px`;
  wrap.appendChild(icon);
  container.appendChild(wrap);
};

/** Ghost sprite on portal/power-up destination cells (100% of grid cell). */
const DESTINATION_PREVIEW_PX = GRID_TILE_PX;

const SVG_NS = 'http://www.w3.org/2000/svg';
const DESTINATION_ARROW_COLOR = '#0f380f';

/** Shorten a segment from both ends along its direction (for arrow gaps at cell centers). */
const shortenArrowSegment = (x1, y1, x2, y2, insetFromStart, insetFromEnd) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  const nx1 = x1 + ux * insetFromStart;
  const ny1 = y1 + uy * insetFromStart;
  const nx2 = x2 - ux * insetFromEnd;
  const ny2 = y2 - uy * insetFromEnd;
  if ((nx2 - nx1) * ux + (ny2 - ny1) * uy <= 0) return { x1, y1, x2, y2 };
  return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
};

const TOOLBAR_TILE_THUMB_PX = 32;
const CELL_PORTAL_ICON_PX = 28;

const fillTileThumb = (thumb, t, outPx = TOOLBAR_TILE_THUMB_PX) => {
  thumb.textContent = '';
  thumb.innerHTML = '';
  thumb.className = 'editor__palette-btn-thumb';
  if (t.sheet === null) {
    thumb.style.cssText = 'background:#8bac0f';
    return;
  }
  thumb.classList.add('editor__palette-btn-thumb--sprite');
  if (t.sheet === 'toggle-passable') thumb.style.cssText = tileStyleFromSheet(0, 16, outPx);
  else thumb.style.cssText = tileStyleFromSheet(t.sheet.sx, t.sheet.sy, outPx);
  if (t.char && isEmbeddablePushableBlockChar(t.char)) {
    thumb.style.position = 'relative';
    appendPushableDirectionBadge(thumb, t.char, outPx, { accessible: false });
  }
};

const fillEntityThumb = (thumb, ent, outPx = TOOLBAR_TILE_THUMB_PX) => {
  thumb.textContent = '';
  thumb.innerHTML = '';
  thumb.className = 'editor__palette-btn-thumb';
  thumb.style.cssText = '';
  if (ent.iconKind === 'blocks') {
    thumb.classList.add('editor__palette-btn-thumb--sprite');
    thumb.style.cssText = tileStyleFromSheet(ent.sheet.sx, ent.sheet.sy, outPx);
    return;
  }
  const div = document.createElement('div');
  div.className = 'editor__palette-entity-thumb';
  div.style.cssText = getEntitySpriteStyle(
    ent.type,
    ent.type === 'powerup' ? { powerType: 'invincible' } : {}
  );
  thumb.appendChild(div);
};

/** Thumbnail in the entity panel (under Selected tile). */
const INSPECTOR_ENTITY_THUMB_PX = 40;

const setInspectorEntityThumbEl = (thumb, e, outPx = INSPECTOR_ENTITY_THUMB_PX) => {
  thumb.textContent = '';
  thumb.innerHTML = '';
  thumb.className = 'editor__palette-btn-thumb';
  thumb.style.cssText = '';
  if (e.type === 'portal') {
    const def = ENTITY_PALETTE.find((p) => p.type === 'portal');
    thumb.classList.add('editor__palette-btn-thumb--sprite');
    thumb.style.cssText = tileStyleFromSheet(def.sheet.sx, def.sheet.sy, outPx);
    return;
  }
  const div = document.createElement('div');
  div.className = 'editor__palette-entity-thumb';
  div.style.cssText = getEntitySpriteStyle(e.type, {
    powerType: e.powerType,
    outSize: outPx,
  });
  thumb.appendChild(div);
};

const getTileChar = (state, x, y) => state.tiles[y]?.[x] ?? '0';

const setTileChar = (state, x, y, char) => {
  const row = state.tiles[y] || '0'.repeat(GRID_WIDTH);
  state.tiles[y] = row.slice(0, x) + char + row.slice(x + 1);
};

/** Move a non-empty tile and every entity on that cell to an empty destination (Select mode drag). */
const moveTileWithEntitiesAt = (state, fromX, fromY, toX, toY) => {
  if (fromX === toX && fromY === toY) return false;
  if (toX < 0 || toX >= GRID_WIDTH || toY < 0 || toY >= GRID_HEIGHT) return false;
  if (state.startPosition.x === toX && state.startPosition.y === toY) return false;
  if (getTileChar(state, toX, toY) !== '0') return false;

  const hasEntityAt = (cx, cy) => state.entities.some((e) => e.x === cx && e.y === cy);
  if (hasEntityAt(toX, toY)) return false;

  const tileChar = getTileChar(state, fromX, fromY);
  if (tileChar === '0') return false;

  for (const e of state.entities) {
    if (e.x !== fromX || e.y !== fromY) continue;
    e.x = toX;
    e.y = toY;
    if (e.hidden && (e.type === 'portal' || e.type === 'powerup')) {
      e.blockX = toX;
      e.blockY = toY;
    }
  }

  setTileChar(state, fromX, fromY, '0');
  setTileChar(state, toX, toY, tileChar);

  if (state.selectedTileCell?.x === fromX && state.selectedTileCell?.y === fromY)
    state.selectedTileCell = { x: toX, y: toY };

  return true;
};

/** Whether dropping the tile from `(fromX, fromY)` onto `(toX, toY)` is allowed (same cell = valid, no highlight). */
const isTileMoveDropValid = (state, fromX, fromY, toX, toY) => {
  if (fromX === toX && fromY === toY) return true;
  if (toX < 0 || toX >= GRID_WIDTH || toY < 0 || toY >= GRID_HEIGHT) return false;
  if (state.startPosition.x === toX && state.startPosition.y === toY) return false;
  if (getTileChar(state, toX, toY) !== '0') return false;
  if (state.entities.some((e) => e.x === toX && e.y === toY)) return false;
  if (getTileChar(state, fromX, fromY) === '0') return false;
  return true;
};

/**
 * Floating preview of the tile + stacked visuals from `(fromX, fromY)` while dragging (pointer-events: none).
 */
const appendTileMovePreviewLayer = (cell, state, fromX, fromY, isInvalid) => {
  const char = getTileChar(state, fromX, fromY);
  const meta = TILE_BY_CHAR[char] ?? TILE_BY_CHAR['0'];
  const wrap = document.createElement('div');
  wrap.className = 'editor__tile-move-preview';
  if (isInvalid) wrap.classList.add('editor__tile-move-preview--invalid');

  const tile = document.createElement('div');
  tile.className = 'editor__tile';
  if (char === '0') tile.classList.add('editor__tile--empty');
  else {
    tile.classList.add('editor__tile--sprite');
    if (meta.sheet === 'toggle-passable') tile.style.cssText = tileStyleFromSheet(0, 16, GRID_TILE_PX);
    else if (meta.sheet) tile.style.cssText = tileStyleFromSheet(meta.sheet.sx, meta.sheet.sy, GRID_TILE_PX);
  }
  wrap.appendChild(tile);

  if (isEmbeddablePushableBlockChar(char))
    appendPushableDirectionBadge(wrap, char, GRID_TILE_PX, { accessible: false });

  const entitiesAtFrom = state.entities.filter((ent) => ent.x === fromX && ent.y === fromY);
  const hiddenPu = entitiesAtFrom.find((e) => e.type === 'powerup' && e.hidden);
  const hiddenPortal = entitiesAtFrom.find((e) => e.type === 'portal' && e.hidden);
  const tileForBonusBadge = isEmbeddablePushableBlockChar(char) || isBreakableTileChar(char);

  if (hiddenPu && tileForBonusBadge) {
    const badge = document.createElement('div');
    badge.className = 'editor__hidden-bonus-badge';
    const icon = document.createElement('div');
    icon.className = 'editor__hidden-bonus-badge-icon';
    icon.setAttribute('role', 'presentation');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.cssText = getEntitySpriteStyle('powerup', {
      powerType: hiddenPu.powerType,
      outSize: HIDDEN_BONUS_BADGE_PX,
    });
    badge.appendChild(icon);
    wrap.appendChild(badge);
  } else if (hiddenPortal && tileForBonusBadge) {
    const badge = document.createElement('div');
    badge.className = 'editor__hidden-bonus-badge';
    const icon = document.createElement('div');
    icon.className = 'editor__hidden-bonus-badge-icon';
    icon.setAttribute('role', 'presentation');
    icon.setAttribute('aria-hidden', 'true');
    const def = ENTITY_PALETTE.find((p) => p.type === 'portal');
    icon.style.cssText = `${tileStyleFromSheet(def.sheet.sx, def.sheet.sy, HIDDEN_BONUS_BADGE_PX)};width:${HIDDEN_BONUS_BADGE_PX}px;height:${HIDDEN_BONUS_BADGE_PX}px`;
    badge.appendChild(icon);
    wrap.appendChild(badge);
  }

  const primaryForOverlay = entitiesAtFrom.find((e) => {
    if (!tileForBonusBadge) return true;
    if (e.type === 'powerup' && e.hidden) return false;
    if (e.type === 'portal' && e.hidden) return false;
    return true;
  });
  if (primaryForOverlay) {
    const ent = primaryForOverlay;
    const entWrap = document.createElement('div');
    entWrap.className = 'editor__entity';
    if (ent.type === 'portal') {
      const def = ENTITY_PALETTE.find((p) => p.type === 'portal');
      const d = document.createElement('div');
      d.className = 'editor__entity-icon';
      d.setAttribute('role', 'presentation');
      d.setAttribute('aria-hidden', 'true');
      d.style.cssText = `${tileStyleFromSheet(def.sheet.sx, def.sheet.sy, CELL_PORTAL_ICON_PX)};width:${CELL_PORTAL_ICON_PX}px;height:${CELL_PORTAL_ICON_PX}px`;
      entWrap.appendChild(d);
    } else {
      const d = document.createElement('div');
      d.className = 'editor__entity-icon';
      d.setAttribute('role', 'presentation');
      d.setAttribute('aria-hidden', 'true');
      d.style.cssText = getEntitySpriteStyle(
        ent.type,
        ent.type === 'powerup' ? { powerType: ent.powerType } : {}
      );
      entWrap.appendChild(d);
    }
    wrap.appendChild(entWrap);
  }

  cell.appendChild(wrap);
};

/** Ghost preview for moving a single entity in Select mode (empty destination only). */
const appendEntityMovePreviewLayer = (cell, state, entityIndex, isInvalid) => {
  const e = state.entities[entityIndex];
  if (!e) return;
  const wrap = document.createElement('div');
  wrap.className = 'editor__tile-move-preview';
  if (isInvalid) wrap.classList.add('editor__tile-move-preview--invalid');

  const entWrap = document.createElement('div');
  entWrap.className = 'editor__entity';
  entWrap.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
  const iconPx = Math.round(GRID_TILE_PX * 0.88);
  if (e.type === 'portal') {
    const def = ENTITY_PALETTE.find((p) => p.type === 'portal');
    const d = document.createElement('div');
    d.className = 'editor__entity-icon';
    d.setAttribute('role', 'presentation');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = `${tileStyleFromSheet(def.sheet.sx, def.sheet.sy, iconPx)};width:${iconPx}px;height:${iconPx}px`;
    entWrap.appendChild(d);
  } else {
    const d = document.createElement('div');
    d.className = 'editor__entity-icon';
    d.setAttribute('role', 'presentation');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = getEntitySpriteStyle(e.type, {
      powerType: e.powerType,
      outSize: iconPx,
    });
    entWrap.appendChild(d);
  }
  wrap.appendChild(entWrap);
  cell.appendChild(wrap);
};

const isEntityMoveDropValid = (state, entityIndex, toX, toY) => {
  const e = state.entities[entityIndex];
  if (!e) return false;
  const { x: fromX, y: fromY } = e;
  if (fromX === toX && fromY === toY) return true;
  if (toX < 0 || toX >= GRID_WIDTH || toY < 0 || toY >= GRID_HEIGHT) return false;
  if (state.startPosition.x === toX && state.startPosition.y === toY) return false;
  if (getTileChar(state, toX, toY) !== '0') return false;
  if (state.entities.some((o, i) => i !== entityIndex && o.x === toX && o.y === toY)) return false;
  return true;
};

const moveEntityWithIndexTo = (state, idx, toX, toY) => {
  if (!isEntityMoveDropValid(state, idx, toX, toY)) return false;
  const e = state.entities[idx];
  const fromX = e.x;
  const fromY = e.y;
  if (fromX === toX && fromY === toY) return false;
  e.x = toX;
  e.y = toY;
  if (e.hidden && (e.type === 'portal' || e.type === 'powerup')) {
    e.blockX = toX;
    e.blockY = toY;
  }
  if (state.selectedTileCell?.x === fromX && state.selectedTileCell?.y === fromY)
    state.selectedTileCell = { x: toX, y: toY };
  return true;
};

const isPlayerStartMoveDropValid = (state, fromX, fromY, toX, toY) => {
  if (fromX === toX && fromY === toY) return true;
  if (toX < 0 || toX >= GRID_WIDTH || toY < 0 || toY >= GRID_HEIGHT) return false;
  if (getTileChar(state, toX, toY) !== '0') return false;
  if (state.entities.some((o) => o.x === toX && o.y === toY)) return false;
  return true;
};

const movePlayerStartTo = (state, toX, toY) => {
  const { x: fromX, y: fromY } = state.startPosition;
  if (!isPlayerStartMoveDropValid(state, fromX, fromY, toX, toY)) return false;
  if (fromX === toX && fromY === toY) return false;
  state.startPosition = { x: toX, y: toY };
  if (state.selectedTileCell?.x === fromX && state.selectedTileCell?.y === fromY)
    state.selectedTileCell = { x: toX, y: toY };
  return true;
};

/** Ghost preview while dragging player start (Snoopy spawn). */
const appendPlayerStartMovePreviewLayer = (cell, isInvalid) => {
  const wrap = document.createElement('div');
  wrap.className = 'editor__tile-move-preview';
  if (isInvalid) wrap.classList.add('editor__tile-move-preview--invalid');
  const inner = document.createElement('div');
  inner.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
  const mk = document.createElement('div');
  mk.style.cssText = getSnoopyStartMarkerStyle(Math.round(GRID_TILE_PX * 0.88));
  mk.setAttribute('role', 'presentation');
  mk.setAttribute('aria-hidden', 'true');
  inner.appendChild(mk);
  wrap.appendChild(inner);
  cell.appendChild(wrap);
};

const findEntityIndexAt = (state, x, y) =>
  state.entities.findIndex((e) => e.x === x && e.y === y);

const hasEntityOnCell = (state, x, y) => state.entities.some((e) => e.x === x && e.y === y);

const isPlayerStartCell = (state, x, y) =>
  state.startPosition.x === x && state.startPosition.y === y;

const countToolbarEntitiesOfType = (state, type) =>
  state.entities.filter((e) => e.type === type && !e.hidden).length;

const toolbarEntityPlacementLimit = (type) =>
  type in ENTITY_TOOLBAR_PLACEMENT_LIMITS ? ENTITY_TOOLBAR_PLACEMENT_LIMITS[type] : null;

const canPlaceAnotherToolbarEntity = (state, type) => {
  const max = toolbarEntityPlacementLimit(type);
  if (max == null) return true;
  return countToolbarEntitiesOfType(state, type) < max;
};

/** Teleporter uses two `4` tiles max; legacy `5` is not placeable from the toolbar. */
const canPaintTileCharAt = (state, x, y, ch) => {
  const cur = getTileChar(state, x, y);
  if (ch === '5') return false;
  if (ch === TELEPORT_TILE_A && cur !== TELEPORT_TILE_A) {
    if (countTileCharOccurrences(state.tiles, TELEPORT_TILE_A) >= TELEPORT_TILE_MAX_PER_STAGE)
      return false;
  }
  return true;
};

/**
 * Entity index to edit when a cell is selected: same "primary" overlay as the grid
 * (visible entity on empty/non-bonus tile; else first hidden or first at cell).
 */
const getPrimaryEntityIndexAtCell = (state, x, y) => {
  const char = getTileChar(state, x, y);
  const here = state.entities.filter((ent) => ent.x === x && ent.y === y);
  if (here.length === 0) return null;
  const tileForBonusBadge = isEmbeddablePushableBlockChar(char) || isBreakableTileChar(char);
  const primary =
    here.find((e) => {
      if (!tileForBonusBadge) return true;
      if (e.type === 'powerup' && e.hidden) return false;
      if (e.type === 'portal' && e.hidden) return false;
      return true;
    }) ?? here[0];
  const idx = state.entities.indexOf(primary);
  return idx === -1 ? null : idx;
};

/** Portals / power-ups whose exit points at this cell (excluding self-target). Hidden power-ups use `targets` per direction when present. */
const entitiesWithDestinationAt = (state, destX, destY) =>
  state.entities.filter((e) => {
    if (e.type !== 'portal' && e.type !== 'powerup') return false;

    if (e.type === 'powerup' && e.hidden && e.targets && typeof e.targets === 'object') {
      for (const dir of HIDDEN_POWERUP_TARGET_DIRS) {
        const c = readHiddenPowerupTargetCell(e.targets, dir);
        if (!c) continue;
        if (c.destinationX !== destX || c.destinationY !== destY) continue;
        if (e.x === destX && e.y === destY) return false;
        return true;
      }
    }

    const dx = e.destinationX;
    const dy = e.destinationY;
    if (typeof dx !== 'number' || typeof dy !== 'number') return false;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    if (dx !== destX || dy !== destY) return false;
    if (e.x === dx && e.y === dy) return false;
    return true;
  });

const makeEntity = (type, x, y) => {
  switch (type) {
    case 'woodstock':
      return { type: 'woodstock', x, y };
    case 'ball':
      return { type: 'ball', x, y, vx: 1, vy: 1 };
    case 'spike':
      return { type: 'spike', x, y };
    case 'powerup':
      return {
        type: 'powerup',
        x,
        y,
        powerType: 'invincible',
        hidden: false,
      };
    case 'portal':
      return {
        type: 'portal',
        x,
        y,
        destinationX: Math.min(GRID_WIDTH - 1, x + 1),
        destinationY: y,
        hidden: false,
      };
    default:
      return null;
  }
};

const removeHiddenPortalOrPowerupAt = (state, x, y) => {
  const i = state.entities.findIndex(
    (e) =>
      e.x === x &&
      e.y === y &&
      e.hidden &&
      (e.type === 'portal' || e.type === 'powerup')
  );
  if (i !== -1) state.entities.splice(i, 1);
};

const removeAllEntitiesAtCell = (state, x, y) => {
  for (let i = state.entities.length - 1; i >= 0; i--) {
    if (state.entities[i].x === x && state.entities[i].y === y) state.entities.splice(i, 1);
  }
};

const getTileEdit = (state) =>
  state.tool.mode === 'tile' ? (state.tool.tileEdit ?? 'add') : 'add';

/** Sidebar preview size for the selected block tile. */
const BLOCK_SELECTION_THUMB_PX = 40;

const getSelectedBlockTileDisplayName = (char) => {
  if (isBlockBrushChar(char)) {
    const v = BLOCK_BRUSH_VARIANTS.find((o) => o.value === char);
    if (v) return v.label;
  }
  const t = TILE_BY_CHAR[char];
  return t?.label ?? char;
};

/** On empty tiles, show the focused entity (or primary at cell) / Snoopy spawn in the Selected tile row. */
const fillBlockSelectionRowForCell = (els, state, sel, tc) => {
  els.blockSelectionPos.textContent = `X: ${sel.x} · Y: ${sel.y} — column ${sel.x + 1}, row ${sel.y + 1}`;

  if (tc !== '0') {
    const meta = TILE_BY_CHAR[tc] ?? TILE_BY_CHAR['0'];
    fillTileThumb(els.blockSelectionThumb, meta, BLOCK_SELECTION_THUMB_PX);
    const displayName = getSelectedBlockTileDisplayName(tc);
    els.blockSelectionThumb.setAttribute('aria-label', displayName);
    els.blockSelectionName.textContent = displayName;
    return;
  }

  const atCell = (i) =>
    state.entities[i] && state.entities[i].x === sel.x && state.entities[i].y === sel.y;
  let entIdx = null;
  if (state.selectedEntityIndex != null && atCell(state.selectedEntityIndex))
    entIdx = state.selectedEntityIndex;
  else entIdx = getPrimaryEntityIndexAtCell(state, sel.x, sel.y);

  if (entIdx != null && state.entities[entIdx]) {
    const ent = state.entities[entIdx];
    setInspectorEntityThumbEl(els.blockSelectionThumb, ent, BLOCK_SELECTION_THUMB_PX);
    const entDef = ENTITY_PALETTE.find((p) => p.type === ent.type);
    const label = entDef?.label ?? ent.type;
    els.blockSelectionThumb.setAttribute('aria-label', label);
    els.blockSelectionName.textContent = label;
    return;
  }

  if (state.startPosition.x === sel.x && state.startPosition.y === sel.y) {
    els.blockSelectionThumb.textContent = '';
    els.blockSelectionThumb.innerHTML = '';
    els.blockSelectionThumb.style.cssText = '';
    els.blockSelectionThumb.className = 'editor__palette-btn-thumb';
    const mk = document.createElement('div');
    mk.style.cssText = getSnoopyStartMarkerStyle(BLOCK_SELECTION_THUMB_PX);
    els.blockSelectionThumb.appendChild(mk);
    els.blockSelectionThumb.setAttribute('aria-label', 'Snoopy');
    els.blockSelectionName.textContent = 'Snoopy';
    return;
  }

  const meta = TILE_BY_CHAR['0'];
  fillTileThumb(els.blockSelectionThumb, meta, BLOCK_SELECTION_THUMB_PX);
  const emptyLabel = getSelectedBlockTileDisplayName('0');
  els.blockSelectionThumb.setAttribute('aria-label', emptyLabel);
  els.blockSelectionName.textContent = emptyLabel;
};

const clampDestination = (dx, dy) => ({
  destinationX: Math.max(0, Math.min(GRID_WIDTH - 1, dx)),
  destinationY: Math.max(0, Math.min(GRID_HEIGHT - 1, dy)),
});

const HIDDEN_POWERUP_TARGET_DIRS = ['up', 'down', 'left', 'right'];

/** @returns {{ destinationX: number, destinationY: number } | null} */
const readHiddenPowerupTargetCell = (targets, dir) => {
  const t = targets?.[dir];
  if (!t || typeof t !== 'object') return null;
  const x = Number(t.x);
  const y = Number(t.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return clampDestination(x, y);
};

/**
 * Level JSON often omits `destinationX` / `destinationY` and only defines `targets`.
 * Fill editor destination from `targets`; return whether directions disagree (do not flatten targets then).
 * @returns {{ mixedTargets: boolean }}
 */
const syncHiddenPowerupDestinationFromTargets = (e) => {
  if (e.type !== 'powerup' || !e.hidden) return { mixedTargets: false };
  const t = e.targets;
  if (!t || typeof t !== 'object') return { mixedTargets: false };

  const cells = [];
  for (const dir of HIDDEN_POWERUP_TARGET_DIRS) {
    const c = readHiddenPowerupTargetCell(t, dir);
    if (c) cells.push(c);
  }
  if (cells.length === 0) return { mixedTargets: false };

  const key = (c) => `${c.destinationX},${c.destinationY}`;
  const keys = cells.map(key);
  const uniqueKeys = [...new Set(keys)];
  const mixedTargets = uniqueKeys.length > 1;

  let pick;
  if (!mixedTargets) {
    pick = cells[0];
  } else {
    const freq = new Map();
    for (const k of keys) freq.set(k, (freq.get(k) || 0) + 1);
    let bestKey = keys[0];
    let bestN = 0;
    for (const [k, n] of freq.entries())
      if (n > bestN) {
        bestN = n;
        bestKey = k;
      }
    const [bx, by] = bestKey.split(',').map(Number);
    pick = clampDestination(bx, by);
  }

  e.destinationX = pick.destinationX;
  e.destinationY = pick.destinationY;
  return { mixedTargets };
};

/**
 * Hidden power-up in a block: the game uses `targets.up/down/left/right` each with the bonus
 * cell `{ x, y }` — same as `destinationX` / `destinationY` (Bonus destination in the editor).
 */
const syncHiddenPowerupTargetsFromDestination = (e) => {
  if (e.type !== 'powerup' || !e.hidden) return;
  const d = clampDestination(e.destinationX ?? 0, e.destinationY ?? 0);
  e.destinationX = d.destinationX;
  e.destinationY = d.destinationY;
  const pt = { x: d.destinationX, y: d.destinationY };
  e.targets = {
    up: { ...pt },
    down: { ...pt },
    left: { ...pt },
    right: { ...pt },
  };
};

const normalizeImportedEntitiesInPlace = (entities) => {
  if (!Array.isArray(entities)) return;
  entities.forEach((ent) => {
    if (ent.type !== 'powerup' || !ent.hidden) return;
    const { mixedTargets } = syncHiddenPowerupDestinationFromTargets(ent);
    if (!mixedTargets) syncHiddenPowerupTargetsFromDestination(ent);
  });
};

const createDefaultHiddenPowerupTargets = () => ({
  up: { x: 4, y: 4 },
  down: { x: 4, y: 4 },
  left: { x: 4, y: 4 },
  right: { x: 4, y: 4 },
});

const clampTargetXY = (x, y) => ({
  x: Math.max(0, Math.min(GRID_WIDTH - 1, x)),
  y: Math.max(0, Math.min(GRID_HEIGHT - 1, y)),
});

/** Build brush UI model from entity (JSON `targets` or legacy `destinationX` / `destinationY`). */
const brushTargetsFromEntity = (e) => {
  const out = createDefaultHiddenPowerupTargets();
  const t = e?.targets;
  if (t && typeof t === 'object') {
    for (const dir of HIDDEN_POWERUP_TARGET_DIRS) {
      const c = readHiddenPowerupTargetCell(t, dir);
      if (c) out[dir] = { x: c.destinationX, y: c.destinationY };
    }
    return out;
  }
  const d = clampDestination(e?.destinationX ?? 4, e?.destinationY ?? 4);
  const pt = { x: d.destinationX, y: d.destinationY };
  for (const dir of HIDDEN_POWERUP_TARGET_DIRS) out[dir] = { ...pt };
  return out;
};

/** Write brush `targets` onto hidden power-up; keep `destinationX` / `destinationY` aligned with `up` for compatibility. */
const syncEntityTargetsFromBrushState = (e, brushTargets) => {
  if (e.type !== 'powerup' || !e.hidden) return;
  const next = {};
  for (const dir of HIDDEN_POWERUP_TARGET_DIRS) {
    const raw = brushTargets?.[dir] ?? { x: 4, y: 4 };
    next[dir] = clampTargetXY(Number(raw.x) || 0, Number(raw.y) || 0);
  }
  e.targets = next;
  e.destinationX = next.up.x;
  e.destinationY = next.up.y;
};

/** Read block brush UI state from the tile + first entity at (x,y). */
const syncSelectionPanelFromCell = (state, x, y) => {
  const c = getTileChar(state, x, y);
  if (isBlockBrushChar(c)) state.blockVariant = c;

  if (isBreakableTileChar(c)) {
    const i = findEntityIndexAt(state, x, y);
    if (i === -1) state.blockBreakableBonus = 'none';
    else {
      const e = state.entities[i];
      if (e.type === 'powerup' && e.hidden) {
        if (e.powerType === 'speed') state.blockBreakableBonus = 'speed';
        else if (e.powerType === 'time') state.blockBreakableBonus = 'timer';
        else state.blockBreakableBonus = 'powerup';
        const { mixedTargets } = syncHiddenPowerupDestinationFromTargets(e);
        if (!mixedTargets) syncHiddenPowerupTargetsFromDestination(e);
        state.blockBrushHiddenPowerupTargets = brushTargetsFromEntity(e);
      } else state.blockBreakableBonus = 'none';
    }
    return;
  }

  if (c === '1') {
    state.blockBrushEmbed = 'none';
    state.blockBrushPortalDestination = { destinationX: 4, destinationY: 4 };
    state.blockBrushHiddenPowerupTargets = createDefaultHiddenPowerupTargets();
    state.blockBrushPickingHiddenPowerupExitDir = null;
    return;
  }

  const i = findEntityIndexAt(state, x, y);
  let embed = 'none';
  let portalDest = { destinationX: 4, destinationY: 4 };
  if (i !== -1) {
    const e = state.entities[i];
    if (e.type === 'portal' && e.hidden) {
      embed = 'portal';
      portalDest = {
        destinationX: Math.max(0, Math.min(GRID_WIDTH - 1, e.destinationX ?? 0)),
        destinationY: Math.max(0, Math.min(GRID_HEIGHT - 1, e.destinationY ?? 0)),
      };
    } else if (e.type === 'powerup' && e.hidden) {
      if (e.powerType === 'time') embed = 'timer';
      else if (e.powerType === 'speed') embed = 'speed';
      else embed = 'powerup';
      const { mixedTargets } = syncHiddenPowerupDestinationFromTargets(e);
      if (!mixedTargets) syncHiddenPowerupTargetsFromDestination(e);
      state.blockBrushHiddenPowerupTargets = brushTargetsFromEntity(e);
    }
  }
  state.blockBrushEmbed = embed;
  state.blockBrushPortalDestination = portalDest;
};

/** After updating a cell's tile char, sync hidden portal / power-up from grid + `blockBrushEmbed`. */
const syncBlockBrushEmbeddedEntity = (state, x, y) => {
  if (state.tool.mode !== 'tile') return;
  const char = getTileChar(state, x, y);
  if (!isBlockBrushChar(char)) return;

  if (char === '1') {
    removeHiddenPortalOrPowerupAt(state, x, y);
    return;
  }

  if (state.blockBrushEmbed === 'none') {
    removeHiddenPortalOrPowerupAt(state, x, y);
    return;
  }

  const idx = findEntityIndexAt(state, x, y);
  if (idx !== -1) {
    const e = state.entities[idx];
    const isEmb = e.hidden && (e.type === 'portal' || e.type === 'powerup');
    if (!isEmb) return;
  }

  removeHiddenPortalOrPowerupAt(state, x, y);

  if (state.blockBrushEmbed === 'powerup' || state.blockBrushEmbed === 'timer' || state.blockBrushEmbed === 'speed') {
    const neu = makeEntity('powerup', x, y);
    neu.hidden = true;
    neu.blockX = x;
    neu.blockY = y;
    if (state.blockBrushEmbed === 'timer') neu.powerType = 'time';
    else if (state.blockBrushEmbed === 'speed') neu.powerType = 'speed';
    else neu.powerType = 'invincible';
    syncEntityTargetsFromBrushState(neu, state.blockBrushHiddenPowerupTargets);
    state.entities.push(neu);
    return;
  }
  if (state.blockBrushEmbed === 'portal') {
    const d = state.blockBrushPortalDestination;
    const dx = Math.max(0, Math.min(GRID_WIDTH - 1, d.destinationX));
    const dy = Math.max(0, Math.min(GRID_HEIGHT - 1, d.destinationY));
    const neu = makeEntity('portal', x, y);
    neu.hidden = true;
    neu.blockX = x;
    neu.blockY = y;
    neu.destinationX = dx;
    neu.destinationY = dy;
    state.entities.push(neu);
  }
};

/** Breakable tile (`3`): optional single hidden power-up (invincible, speed, or timer); clears other hidden block bonuses first. */
const syncBreakableHiddenBonus = (state, x, y) => {
  if (state.tool.mode !== 'tile') return;
  const char = getTileChar(state, x, y);
  if (!isBreakableTileChar(char)) return;

  removeHiddenPortalOrPowerupAt(state, x, y);

  if (state.blockBreakableBonus === 'none') return;

  const idx = findEntityIndexAt(state, x, y);
  if (idx !== -1) return;

  const neu = makeEntity('powerup', x, y);
  neu.hidden = true;
  neu.blockX = x;
  neu.blockY = y;
  if (state.blockBreakableBonus === 'speed') neu.powerType = 'speed';
  else if (state.blockBreakableBonus === 'timer') neu.powerType = 'time';
  else neu.powerType = 'invincible';
  syncEntityTargetsFromBrushState(neu, state.blockBrushHiddenPowerupTargets);
  state.entities.push(neu);
};

const parseLevelImport = (raw) => {
  const data = JSON.parse(raw);
  const tilesIn = Array.isArray(data.tiles) ? data.tiles : [];
  const tiles = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = String(tilesIn[y] || '').replace(/[^0-9A-E]/g, '0');
    tiles.push(row.padEnd(GRID_WIDTH, '0').slice(0, GRID_WIDTH));
  }
  const entities = Array.isArray(data.entities) ? data.entities.map((e) => ({ ...e })) : [];
  normalizeImportedEntitiesInPlace(entities);
  const audio = normalizeMusicPair(data.music ?? createInitialState().music);
  return {
    name: data.name ?? 'Imported',
    music: audio.music,
    clearMusic: audio.clearMusic,
    startPosition: {
      x: Math.min(GRID_WIDTH - 1, Math.max(0, data.startPosition?.x ?? 4)),
      y: Math.min(GRID_HEIGHT - 1, Math.max(0, data.startPosition?.y ?? 4)),
    },
    tiles,
    entities,
  };
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt('Copy JSON:', text);
  }
};

const downloadJson = (filename, text) => {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Reset non-level editor UI to match `createInitialState()` (tool, brush, selection). */
const resetEditorChromeToInitial = (state) => {
  const next = createInitialState();
  state.tool = { ...next.tool };
  state.selectedTileCell = next.selectedTileCell;
  state.tileMoveDrag = next.tileMoveDrag;
  state.blockVariant = next.blockVariant;
  state.blockBrushEmbed = next.blockBrushEmbed;
  state.blockBrushPortalDestination = { ...next.blockBrushPortalDestination };
  state.blockBrushPickingPortalExit = next.blockBrushPickingPortalExit;
  state.blockBrushHiddenPowerupTargets = {
    up: { ...next.blockBrushHiddenPowerupTargets.up },
    down: { ...next.blockBrushHiddenPowerupTargets.down },
    left: { ...next.blockBrushHiddenPowerupTargets.left },
    right: { ...next.blockBrushHiddenPowerupTargets.right },
  };
  state.blockBrushPickingHiddenPowerupExitDir = next.blockBrushPickingHiddenPowerupExitDir;
  state.blockBrushPickingHiddenPowerupExit = next.blockBrushPickingHiddenPowerupExit;
  state.blockBreakableBonus = next.blockBreakableBonus;
  state.selectedEntityIndex = next.selectedEntityIndex;
  state.inspectPlayerStart = next.inspectPlayerStart;
};

/** Clear the active stage only; keep other stages and world project name. */
const resetActiveStageToEmpty = (state) => {
  const levelNum = (state.world?.activeStageIndex ?? 0) + 1;
  applyLevelSliceToState(state, createEmptyLevelSlice(levelNum));
  resetEditorChromeToInitial(state);
  persistActiveWorldStage(state);
};

/** True when the active stage is already empty and editor chrome is default (Clear stage disabled). */
const isClearStageButtonDisabled = (state) => {
  persistActiveWorldStage(state);
  const ref = createInitialState();
  const levelNum = (state.world?.activeStageIndex ?? 0) + 1;
  const empty = createEmptyLevelSlice(levelNum);
  const active = state.world?.stages?.[state.world.activeStageIndex];
  if (!active || !levelSlicesEqual(active, empty)) return false;
  if (state.tool.mode !== 'tile' || state.tool.char !== ref.tool.char || state.tool.tileEdit !== ref.tool.tileEdit)
    return false;
  if (state.selectedTileCell != null) return false;
  if (state.tileMoveDrag != null) return false;
  if (state.blockVariant !== ref.blockVariant) return false;
  if (state.blockBrushEmbed !== ref.blockBrushEmbed) return false;
  if (
    state.blockBrushPortalDestination.destinationX !== ref.blockBrushPortalDestination.destinationX ||
    state.blockBrushPortalDestination.destinationY !== ref.blockBrushPortalDestination.destinationY
  )
    return false;
  if (state.blockBrushPickingPortalExit !== ref.blockBrushPickingPortalExit) return false;
  for (const dir of HIDDEN_POWERUP_TARGET_DIRS) {
    const a = state.blockBrushHiddenPowerupTargets[dir];
    const b = ref.blockBrushHiddenPowerupTargets[dir];
    if (a.x !== b.x || a.y !== b.y) return false;
  }
  if (state.blockBrushPickingHiddenPowerupExitDir !== ref.blockBrushPickingHiddenPowerupExitDir) return false;
  if (state.blockBrushPickingHiddenPowerupExit !== ref.blockBrushPickingHiddenPowerupExit) return false;
  if (state.blockBreakableBonus !== ref.blockBreakableBonus) return false;
  if (state.selectedEntityIndex != null) return false;
  if (state.inspectPlayerStart !== ref.inspectPlayerStart) return false;
  return true;
};

export const mountEditor = (root) => {
  const state = createInitialState();

  root.innerHTML = `
    <div class="editor">
      <header class="editor__header">
        <div class="editor__header-title">
          <img
            class="editor__header-logo"
            src="${publicAssetUrl('images/favicon.png')}"
            width="28"
            height="28"
            alt=""
            decoding="async"
          />
          <h1>Snoopy's Magic Show — Level Editor</h1>
        </div>
        <div class="editor__header-actions">
          <button
            type="button"
            class="editor__btn editor__btn--play-now"
            data-action="world-play-now"
            disabled
          >
            <span class="material-symbols-outlined editor__btn--play-now-icon" aria-hidden="true">play_arrow</span>
            Play now
          </button>
        </div>
      </header>
      <div class="editor__tile-toolbar" role="region" aria-label="Tiles and entities">
        <div class="editor__tile-toolbar-inner"></div>
      </div>
      <div class="editor__body">
        <aside class="editor__sidebar" aria-label="Tools">
          <section class="editor__sidebar-section" aria-labelledby="sidebar-section-file">
            <h2 id="sidebar-section-file" class="editor__sidebar-section-title">File</h2>
            <label
              for="fld-import-map"
              class="editor__btn editor__btn--full editor__btn--mode-tile editor__btn--sidebar-import"
            >
              <span class="material-symbols-outlined editor__mode-glyph" aria-hidden="true">upload</span>
              <span class="editor__mode-label">Import Map</span>
              <input
                id="fld-import-map"
                type="file"
                accept="application/json,.json"
                class="visually-hidden"
                data-action="import"
              />
            </label>
          </section>
          <section class="editor__sidebar-section" aria-labelledby="sidebar-section-modes">
            <h2 id="sidebar-section-modes" class="editor__sidebar-section-title">Modes</h2>
            <div class="editor__tool-modes editor__tool-modes--tile" role="group" aria-label="Tile interaction">
              <button type="button" class="editor__btn editor__btn--mode-tile" data-mode="tile-add" aria-label="Add tiles">
                <span class="material-symbols-outlined editor__mode-glyph" aria-hidden="true">add_box</span>
                <span class="editor__mode-label">Add</span>
              </button>
              <button type="button" class="editor__btn editor__btn--mode-tile" data-mode="tile-select" aria-label="Select tile on grid">
                <span class="material-symbols-outlined editor__mode-glyph" aria-hidden="true">ads_click</span>
                <span class="editor__mode-label">Select</span>
              </button>
              <button type="button" class="editor__btn editor__btn--mode-tile" data-mode="tile-erase" aria-label="Erase tile">
                <span class="material-symbols-outlined editor__mode-glyph" aria-hidden="true">ink_eraser</span>
                <span class="editor__mode-label">Erase</span>
              </button>
            </div>
          </section>
          <section class="editor__sidebar-section" aria-labelledby="sidebar-section-stage">
            <h2 id="sidebar-section-stage" class="editor__sidebar-section-title">Stage</h2>
            <details class="editor__accordion editor__accordion--settings" open>
              <summary
                class="editor__btn editor__btn--mode-tile editor__btn--sidebar-settings"
                aria-label="Stage settings — show or hide"
              >
                <span class="material-symbols-outlined editor__mode-glyph" aria-hidden="true">settings</span>
                <span class="editor__mode-label">Settings</span>
                <span class="material-symbols-outlined editor__accordion-chevron editor__mode-glyph" aria-hidden="true">expand_more</span>
              </summary>
              <div
                id="sidebar-settings-fields"
                class="editor__sidebar-settings-fields"
                data-sidebar-settings
              >
                <div class="editor__field">
                  <label for="fld-name">Name</label>
                  <input id="fld-name" type="text" autocomplete="off" />
                </div>
                <div class="editor__field">
                  <label for="fld-music">Music</label>
                  <select id="fld-music" aria-describedby="fld-music-hint"></select>
                  <div class="editor__music-preview">
                    <audio
                      id="fld-music-preview"
                      class="editor__music-preview__audio"
                      controls
                      controlsList="nodownload"
                      preload="metadata"
                      aria-label="Preview stage theme"
                    ></audio>
                  </div>
                  <p id="fld-music-hint" class="editor__hint editor__hint--music-pair">
                    Each theme sets the stage BGM; the clear jingle is paired automatically (same mapping as
                    game levels).
                  </p>
                </div>
              </div>
            </details>
            <div class="editor__sidebar-stage-actions">
              <button
                type="button"
                class="editor__btn editor__btn--full editor__btn--mode-tile editor__btn--clear-stage"
                data-action="clear-stage-open"
                aria-haspopup="dialog"
                aria-controls="editor-dialog-clear-stage"
              >
                <span class="material-symbols-outlined editor__mode-glyph" aria-hidden="true">delete_sweep</span>
                <span class="editor__mode-label">Clear stage</span>
              </button>
            </div>
          </section>
        </aside>
        <div class="editor__main-column">
          <div class="editor__main" id="editor-main" role="main">
            <div class="editor__grid-wrap" data-grid-wrap>
              <div class="editor__grid" role="grid" aria-label="Level grid" aria-rowcount="${GRID_HEIGHT}" aria-colcount="${GRID_WIDTH}"></div>
            </div>
          </div>
          <section class="editor__world" aria-label="World and stages" data-world-strip>
            <div class="editor__world-bar">
              <div class="editor__world-bar-left">
                <h2 class="editor__world-heading">World</h2>
                <div class="editor__world-bar-fields">
                  <label class="editor__world-name-label" for="fld-world-name">Project name</label>
                  <input
                    id="fld-world-name"
                    class="editor__world-name-input"
                    type="text"
                    autocomplete="off"
                    placeholder="Untitled world"
                  />
                </div>
              </div>
              <button
                type="button"
                class="editor__btn editor__btn--primary editor__btn--world-download"
                data-action="world-download"
                disabled
              >
                <span class="material-symbols-outlined editor__btn--world-download-icon" aria-hidden="true">download</span>
                Download World
              </button>
            </div>
            <div class="editor__world-stages-inner">
              <div class="editor__world-stages-scroll-cards">
                <div class="editor__world-stages" data-world-stages-row></div>
              </div>
              <div class="editor__world-add-column">
                <button type="button" class="editor__btn editor__btn--world-add" data-action="world-add-stage">
                  <span class="material-symbols-outlined editor__world-add-icon" aria-hidden="true">add_box</span>
                  Add stage
                </button>
              </div>
            </div>
            <p class="editor__hint editor__hint--world-add" data-world-add-hint hidden></p>
          </section>
        </div>
        <aside class="editor__panel" aria-label="Selection and JSON preview">
          <div class="editor__block-brush" data-block-brush hidden>
            <div class="editor__block-selection">
              <h2 class="editor__section-title">Selected tile</h2>
              <div class="editor__block-selection-row">
                <div class="editor__block-selection-thumb-wrap">
                  <span data-block-selection-thumb></span>
                </div>
                <div class="editor__block-selection-text">
                  <p class="editor__block-selection-name" data-block-selection-name></p>
                  <p class="editor__block-selection-pos" data-block-selection-pos></p>
                </div>
              </div>
              <div class="editor__tile-entity-panel" data-tile-entity-panel hidden>
                <div class="editor__tile-entity-panel-body" data-tile-entity-panel-body></div>
              </div>
            </div>
            <div class="editor__field editor__block-variant-wrap" data-block-variant-wrap>
              <label for="fld-block-variant">Block behavior</label>
              <select id="fld-block-variant"></select>
            </div>
            <div class="editor__block-breakable" data-breakable-embed hidden>
              <div class="editor__field">
                <label for="fld-breakable-bonus">Hidden bonus</label>
                <select id="fld-breakable-bonus">
                  <option value="none">None</option>
                  <option value="powerup">Power-up</option>
                  <option value="speed">Speed</option>
                  <option value="timer">Timer</option>
                </select>
              </div>
            </div>
            <div class="editor__block-embed" data-block-embed hidden>
              <div class="editor__field">
                <label for="fld-block-embed">Hidden content</label>
                <select id="fld-block-embed">
                  <option value="none">None</option>
                  <option value="powerup">Power-up</option>
                  <option value="speed">Speed</option>
                  <option value="timer">Timer</option>
                  <option value="portal">Portal</option>
                </select>
              </div>
              <div class="editor__block-portal-exit" data-portal-exit hidden>
                <h2 class="editor__section-title">Portal exit</h2>
                <div class="editor__row-fields">
                  <div class="editor__field">
                    <label for="fld-portal-dx">Column</label>
                    <select id="fld-portal-dx" aria-label="Portal exit column"></select>
                  </div>
                  <div class="editor__field">
                    <label for="fld-portal-dy">Row</label>
                    <select id="fld-portal-dy" aria-label="Portal exit row"></select>
                  </div>
                </div>
                <button type="button" class="editor__btn editor__btn--block-control" data-action="pick-portal-exit">
                  Pick on grid…
                </button>
                <p class="editor__hint editor__hint--pick" data-portal-pick-banner hidden role="status">
                  Click a cell for the portal exit (Escape to cancel).
                </p>
              </div>
            </div>
            <div class="editor__block-powerup-exit" data-powerup-exit hidden>
              <div class="editor__powerup-exit-intro">
                <h2 class="editor__section-title">Bonus exit by direction</h2>
                <p class="editor__powerup-exit-lead">
                  Each direction maps to <code>targets</code> in JSON. <strong>Push</strong> uses the push axis;
                  <strong>break</strong> uses Snoopy's facing when the block breaks.
                </p>
              </div>
              <fieldset class="editor__powerup-targets-fieldset">
                <legend class="editor__powerup-targets-legend">Exit tile per reveal direction</legend>
                <div class="editor__powerup-target-cards">
                  <div class="editor__powerup-dir-card" data-powerup-dir-card="up">
                    <div class="editor__powerup-dir-card-head">
                      <span class="material-symbols-outlined editor__powerup-dir-glyph" aria-hidden="true">arrow_upward</span>
                      <span class="editor__powerup-dir-title" id="lbl-pu-up">Up</span>
                    </div>
                    <div class="editor__powerup-dir-card-grid">
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-up-x">Column</label>
                        <select id="fld-pu-up-x" class="editor__fld-powerup-tx" data-dir="up" aria-labelledby="lbl-pu-up"></select>
                      </div>
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-up-y">Row</label>
                        <select id="fld-pu-up-y" class="editor__fld-powerup-ty" data-dir="up" aria-labelledby="lbl-pu-up"></select>
                      </div>
                      <button type="button" class="editor__btn editor__btn--powerup-grid" data-action="pick-powerup-exit-dir" data-dir="up" aria-label="Pick exit cell from grid for up direction">
                        <span class="material-symbols-outlined" aria-hidden="true">ads_click</span>
                      </button>
                    </div>
                  </div>
                  <div class="editor__powerup-dir-card" data-powerup-dir-card="down">
                    <div class="editor__powerup-dir-card-head">
                      <span class="material-symbols-outlined editor__powerup-dir-glyph" aria-hidden="true">arrow_downward</span>
                      <span class="editor__powerup-dir-title" id="lbl-pu-down">Down</span>
                    </div>
                    <div class="editor__powerup-dir-card-grid">
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-down-x">Column</label>
                        <select id="fld-pu-down-x" class="editor__fld-powerup-tx" data-dir="down" aria-labelledby="lbl-pu-down"></select>
                      </div>
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-down-y">Row</label>
                        <select id="fld-pu-down-y" class="editor__fld-powerup-ty" data-dir="down" aria-labelledby="lbl-pu-down"></select>
                      </div>
                      <button type="button" class="editor__btn editor__btn--powerup-grid" data-action="pick-powerup-exit-dir" data-dir="down" aria-label="Pick exit cell from grid for down direction">
                        <span class="material-symbols-outlined" aria-hidden="true">ads_click</span>
                      </button>
                    </div>
                  </div>
                  <div class="editor__powerup-dir-card" data-powerup-dir-card="left">
                    <div class="editor__powerup-dir-card-head">
                      <span class="material-symbols-outlined editor__powerup-dir-glyph" aria-hidden="true">arrow_back</span>
                      <span class="editor__powerup-dir-title" id="lbl-pu-left">Left</span>
                    </div>
                    <div class="editor__powerup-dir-card-grid">
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-left-x">Column</label>
                        <select id="fld-pu-left-x" class="editor__fld-powerup-tx" data-dir="left" aria-labelledby="lbl-pu-left"></select>
                      </div>
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-left-y">Row</label>
                        <select id="fld-pu-left-y" class="editor__fld-powerup-ty" data-dir="left" aria-labelledby="lbl-pu-left"></select>
                      </div>
                      <button type="button" class="editor__btn editor__btn--powerup-grid" data-action="pick-powerup-exit-dir" data-dir="left" aria-label="Pick exit cell from grid for left direction">
                        <span class="material-symbols-outlined" aria-hidden="true">ads_click</span>
                      </button>
                    </div>
                  </div>
                  <div class="editor__powerup-dir-card" data-powerup-dir-card="right">
                    <div class="editor__powerup-dir-card-head">
                      <span class="material-symbols-outlined editor__powerup-dir-glyph" aria-hidden="true">arrow_forward</span>
                      <span class="editor__powerup-dir-title" id="lbl-pu-right">Right</span>
                    </div>
                    <div class="editor__powerup-dir-card-grid">
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-right-x">Column</label>
                        <select id="fld-pu-right-x" class="editor__fld-powerup-tx" data-dir="right" aria-labelledby="lbl-pu-right"></select>
                      </div>
                      <div class="editor__powerup-dir-field">
                        <label class="editor__powerup-mini-label" for="fld-pu-right-y">Row</label>
                        <select id="fld-pu-right-y" class="editor__fld-powerup-ty" data-dir="right" aria-labelledby="lbl-pu-right"></select>
                      </div>
                      <button type="button" class="editor__btn editor__btn--powerup-grid" data-action="pick-powerup-exit-dir" data-dir="right" aria-label="Pick exit cell from grid for right direction">
                        <span class="material-symbols-outlined" aria-hidden="true">ads_click</span>
                      </button>
                    </div>
                  </div>
                </div>
              </fieldset>
              <button type="button" class="editor__btn editor__btn--powerup-unify" data-action="pick-powerup-exit-all">
                <span class="material-symbols-outlined editor__btn--powerup-unify-icon" aria-hidden="true">select_all</span>
                <span class="editor__btn--powerup-unify-text">Use one grid cell for all directions</span>
              </button>
              <p class="editor__hint editor__hint--pick" data-powerup-pick-banner hidden role="status"></p>
            </div>
          </div>
          <div class="editor__field">
            <label for="fld-json">JSON preview</label>
            <textarea id="fld-json" class="editor__json" readonly spellcheck="false"></textarea>
          </div>
          <div class="editor__actions">
            <button type="button" class="editor__btn editor__btn--primary" data-action="copy">Copy JSON</button>
          </div>
        </aside>
      </div>
      <dialog
        id="editor-dialog-clear-stage"
        class="editor__dialog"
        aria-labelledby="editor-dialog-clear-stage-title"
      >
        <div class="editor__dialog-panel">
          <h3 id="editor-dialog-clear-stage-title" class="editor__dialog-title">Clear this stage?</h3>
          <p class="editor__dialog-text">
            All tiles, entities, and level settings (name, music, start position) will be reset. This cannot be undone.
          </p>
          <div class="editor__dialog-actions">
            <button type="button" class="editor__btn" data-action="clear-stage-cancel">Cancel</button>
            <button type="button" class="editor__btn editor__btn--danger" data-action="clear-stage-confirm">
              <span class="material-symbols-outlined editor__dialog-confirm-icon" aria-hidden="true">delete_sweep</span>
              Clear stage
            </button>
          </div>
        </div>
      </dialog>
    </div>
  `;

  const els = {
    tileToolbar: root.querySelector('.editor__tile-toolbar'),
    tileToolbarInner: root.querySelector('.editor__tile-toolbar-inner'),
    grid: root.querySelector('.editor__grid'),
    modeButtons: [...root.querySelectorAll('[data-mode]')],
    fldName: root.querySelector('#fld-name'),
    fldMusic: root.querySelector('#fld-music'),
    musicPreview: root.querySelector('#fld-music-preview'),
    fldJson: root.querySelector('#fld-json'),
    fldWorldName: root.querySelector('#fld-world-name'),
    btnWorldPlayNow: root.querySelector('[data-action="world-play-now"]'),
    btnWorldDownload: root.querySelector('[data-action="world-download"]'),
    worldStagesRow: root.querySelector('[data-world-stages-row]'),
    btnWorldAddStage: root.querySelector('[data-action="world-add-stage"]'),
    worldAddHint: root.querySelector('[data-world-add-hint]'),
    blockBrush: root.querySelector('[data-block-brush]'),
    blockSelectionThumb: root.querySelector('[data-block-selection-thumb]'),
    blockSelectionName: root.querySelector('[data-block-selection-name]'),
    blockSelectionPos: root.querySelector('[data-block-selection-pos]'),
    blockVariantWrap: root.querySelector('[data-block-variant-wrap]'),
    fldBlockVariant: root.querySelector('#fld-block-variant'),
    breakableEmbed: root.querySelector('[data-breakable-embed]'),
    fldBreakableBonus: root.querySelector('#fld-breakable-bonus'),
    blockEmbed: root.querySelector('[data-block-embed]'),
    portalExitPanel: root.querySelector('[data-portal-exit]'),
    fldBlockEmbed: root.querySelector('#fld-block-embed'),
    fldPortalDx: root.querySelector('#fld-portal-dx'),
    fldPortalDy: root.querySelector('#fld-portal-dy'),
    portalPickBanner: root.querySelector('[data-portal-pick-banner]'),
    powerupExitPanel: root.querySelector('[data-powerup-exit]'),
    powerupPickBanner: root.querySelector('[data-powerup-pick-banner]'),
    gridWrap: root.querySelector('[data-grid-wrap]'),
    dialogClearStage: root.querySelector('#editor-dialog-clear-stage'),
    btnClearStageOpen: root.querySelector('[data-action="clear-stage-open"]'),
    btnClearStageCancel: root.querySelector('[data-action="clear-stage-cancel"]'),
    btnClearStageConfirm: root.querySelector('[data-action="clear-stage-confirm"]'),
    btnPickPortalExit: root.querySelector('[data-action="pick-portal-exit"]'),
    tileEntityPanel: root.querySelector('[data-tile-entity-panel]'),
    tileEntityPanelBody: root.querySelector('[data-tile-entity-panel-body]'),
  };

  const clearTileMoveDrag = () => {
    state.tileMoveDrag = null;
    els.gridWrap.classList.remove('editor__grid-wrap--tile-moving');
  };

  els.btnClearStageOpen?.addEventListener('click', () => {
    els.dialogClearStage?.showModal();
  });
  els.btnClearStageCancel?.addEventListener('click', () => {
    els.dialogClearStage?.close();
  });
  els.btnClearStageConfirm?.addEventListener('click', () => {
    resetActiveStageToEmpty(state);
    clearTileMoveDrag();
    els.musicPreview?.pause();
    els.dialogClearStage?.close();
    render();
  });
  els.dialogClearStage?.addEventListener('close', () => {
    queueMicrotask(() => els.btnClearStageOpen?.focus());
  });

  els.fldWorldName?.addEventListener('input', () => {
    state.world.name = els.fldWorldName.value;
    render();
  });
  els.btnWorldDownload?.addEventListener('click', () => {
    if (!allWorldStagesValid(state)) return;
    const safe =
      String(state.world?.name || DEFAULT_WORLD_NAME)
        .replace(/[^\w\-]+/g, '-')
        .slice(0, 40) || 'world';
    downloadJson(`${safe}.json`, serializeProjectForExport(state));
  });
  els.btnWorldPlayNow?.addEventListener('click', () => {
    if (!allWorldStagesValid(state)) return;
    queueWorldPayloadForGame(serializeProjectForExport(state));
    openPlayGameInNewTab();
  });
  els.btnWorldAddStage?.addEventListener('click', () => {
    if (!allWorldStagesValid(state)) return;
    appendEmptyWorldStage(state);
    resetEditorChromeToInitial(state);
    clearTileMoveDrag();
    els.musicPreview?.pause();
    render();
  });
  const WORLD_STAGE_REORDER_DRAG_PX = 6;
  /** @type {{ fromIdx: number, pointerId: number, startX: number, startY: number, active: boolean, card: HTMLElement, ghost: HTMLElement | null, offsetX: number, offsetY: number, stride: number, dropOverIdx: number, dropInsertAfter: boolean } | null} */
  let worldStageReorderPointer = null;
  let worldStageDidReorder = false;

  const getWorldStageCardStride = () => {
    const row = els.worldStagesRow;
    if (!row) return 126;
    const cards = [...row.querySelectorAll('.editor__world-stage-card')];
    if (cards.length < 2) {
      const one = cards[0]?.getBoundingClientRect();
      return one ? one.width + 8 : 126;
    }
    const a = cards[0].getBoundingClientRect();
    const b = cards[1].getBoundingClientRect();
    if (Math.abs(b.top - a.top) < 4) return Math.max(b.left - a.left, a.width);
    return a.width + 8;
  };

  const getWorldStageCardShiftPx = (cardIndex, fromIdx, targetIdx, stride) => {
    if (cardIndex === fromIdx || targetIdx === fromIdx) return 0;
    if (fromIdx < targetIdx && cardIndex > fromIdx && cardIndex <= targetIdx) return -stride;
    if (fromIdx > targetIdx && cardIndex >= targetIdx && cardIndex < fromIdx) return stride;
    return 0;
  };

  const clearWorldStageReorderVisuals = (drag) => {
    document.body.classList.remove('editor--world-stage-dragging');
    els.worldStagesRow?.classList.remove('editor__world-stages--reordering');
    els.worldStagesRow?.querySelectorAll('.editor__world-stage-card').forEach((card) => {
      card.classList.remove('editor__world-stage-card--drag-source');
      card.style.transform = '';
    });
    drag?.ghost?.remove();
    if (drag) drag.ghost = null;
  };

  const getWorldStageCardDropAt = (clientX) => {
    const row = els.worldStagesRow;
    if (!row) return null;
    const cards = [...row.querySelectorAll('.editor__world-stage-card')];
    if (!cards.length) return null;
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return { overIdx: i, insertAfter: false };
    }
    return { overIdx: cards.length - 1, insertAfter: true };
  };

  const applyWorldStageReorderPreview = (fromIdx, targetIdx) => {
    const row = els.worldStagesRow;
    if (!row) return;
    const stride = worldStageReorderPointer?.stride ?? getWorldStageCardStride();
    row.querySelectorAll('.editor__world-stage-card').forEach((card) => {
      const i = parseInt(card.dataset.stageIndex, 10);
      if (Number.isNaN(i)) return;
      const shift = getWorldStageCardShiftPx(i, fromIdx, targetIdx, stride);
      card.style.transform = shift === 0 ? '' : `translateX(${shift}px)`;
    });
  };

  const moveWorldStageReorderGhost = (drag, clientX, clientY) => {
    if (!drag.ghost) return;
    drag.ghost.style.left = `${clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${clientY - drag.offsetY}px`;
  };

  const startWorldStageReorderVisual = (drag, ev) => {
    const rect = drag.card.getBoundingClientRect();
    drag.offsetX = ev.clientX - rect.left;
    drag.offsetY = ev.clientY - rect.top;
    drag.stride = getWorldStageCardStride();
    const ghost = drag.card.cloneNode(true);
    ghost.classList.add('editor__world-stage-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    drag.card.classList.add('editor__world-stage-card--drag-source');
    els.worldStagesRow?.classList.add('editor__world-stages--reordering');
    document.body.classList.add('editor--world-stage-dragging');
    moveWorldStageReorderGhost(drag, ev.clientX, ev.clientY);
    const targetIdx = computeWorldStageReorderTargetIndex(
      drag.fromIdx,
      drag.dropOverIdx,
      drag.dropInsertAfter,
    );
    applyWorldStageReorderPreview(drag.fromIdx, targetIdx);
  };

  const finishWorldStageReorderPointer = (ev) => {
    const drag = worldStageReorderPointer;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    worldStageReorderPointer = null;
    try {
      drag.card.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    const toIndex = drag.active
      ? computeWorldStageReorderTargetIndex(drag.fromIdx, drag.dropOverIdx, drag.dropInsertAfter)
      : drag.fromIdx;
    clearWorldStageReorderVisuals(drag);
    if (!drag.active) return;
    if (toIndex !== drag.fromIdx && reorderWorldStage(state, drag.fromIdx, toIndex)) {
      worldStageDidReorder = true;
      render();
    }
  };

  els.worldStagesRow?.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (ev.target.closest('[data-action="world-remove-stage"]')) return;
    const card = ev.target.closest('.editor__world-stage-card');
    if (!card) return;
    const fromIdx = parseInt(card.dataset.stageIndex, 10);
    if (Number.isNaN(fromIdx)) return;
    worldStageDidReorder = false;
    worldStageReorderPointer = {
      fromIdx,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      card,
      ghost: null,
      offsetX: 0,
      offsetY: 0,
      stride: 0,
      dropOverIdx: fromIdx,
      dropInsertAfter: false,
    };
  });

  document.addEventListener('pointermove', (ev) => {
    const drag = worldStageReorderPointer;
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < WORLD_STAGE_REORDER_DRAG_PX) return;
      drag.active = true;
      drag.card.setPointerCapture(ev.pointerId);
      startWorldStageReorderVisual(drag, ev);
    }
    ev.preventDefault();
    moveWorldStageReorderGhost(drag, ev.clientX, ev.clientY);
    const drop = getWorldStageCardDropAt(ev.clientX);
    if (!drop) return;
    drag.dropOverIdx = drop.overIdx;
    drag.dropInsertAfter = drop.insertAfter;
    const targetIdx = computeWorldStageReorderTargetIndex(drag.fromIdx, drop.overIdx, drop.insertAfter);
    applyWorldStageReorderPreview(drag.fromIdx, targetIdx);
  });

  document.addEventListener('pointerup', finishWorldStageReorderPointer);
  document.addEventListener('pointercancel', finishWorldStageReorderPointer);

  els.worldStagesRow?.addEventListener('click', (ev) => {
    if (worldStageDidReorder) {
      worldStageDidReorder = false;
      return;
    }
    if (worldStageReorderPointer?.active) return;
    const delBtn = ev.target.closest('[data-action="world-remove-stage"]');
    if (delBtn) {
      const idx = parseInt(delBtn.dataset.stageIndex, 10);
      if (!Number.isNaN(idx)) {
        removeWorldStageAt(state, idx);
        clearTileMoveDrag();
        els.musicPreview?.pause();
        render();
      }
      return;
    }
    const card = ev.target.closest('.editor__world-stage-card');
    if (!card) return;
    const idx = parseInt(card.dataset.stageIndex, 10);
    if (Number.isNaN(idx)) return;
    if (idx === state.world.activeStageIndex) return;
    loadWorldStageIndex(state, idx);
    clearTileMoveDrag();
    els.musicPreview?.pause();
    render();
  });

  MUSIC_TRACKS.forEach((track) => {
    const o = document.createElement('option');
    o.value = track;
    o.textContent = stageBgmThemeLabel(track);
    els.fldMusic.appendChild(o);
  });

  BLOCK_BRUSH_VARIANTS.forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    els.fldBlockVariant.appendChild(o);
  });

  const pushPortalDestinationToSelectedHiddenPortal = () => {
    if (state.tool.mode !== 'tile' || getTileEdit(state) !== 'select' || !state.selectedTileCell) return;
    const { x, y } = state.selectedTileCell;
    const i = findEntityIndexAt(state, x, y);
    if (i === -1) return;
    const e = state.entities[i];
    if (e.type !== 'portal' || !e.hidden) return;
    const d = state.blockBrushPortalDestination;
    e.destinationX = Math.max(0, Math.min(GRID_WIDTH - 1, d.destinationX));
    e.destinationY = Math.max(0, Math.min(GRID_HEIGHT - 1, d.destinationY));
  };

  els.fldBlockVariant.addEventListener('change', () => {
    state.blockVariant = els.fldBlockVariant.value;
    if (state.blockVariant === '1') {
      state.blockBrushEmbed = 'none';
      state.blockBrushPickingPortalExit = false;
      state.blockBrushPickingHiddenPowerupExit = false;
      state.blockBrushPickingHiddenPowerupExitDir = null;
    }
    if (state.tool.mode === 'tile' && getTileEdit(state) === 'select' && state.selectedTileCell) {
      const { x: sx, y: sy } = state.selectedTileCell;
      const tc = getTileChar(state, sx, sy);
      if (isBlockBrushChar(tc)) {
        setTileChar(state, sx, sy, state.blockVariant);
        syncBlockBrushEmbeddedEntity(state, sx, sy);
      }
      render();
      return;
    }
    if (state.tool.mode === 'tile' && getTileEdit(state) === 'add' && isBlockBrushChar(state.tool.char))
      state.tool.char = state.blockVariant;
    render();
  });

  els.fldBreakableBonus.addEventListener('change', () => {
    state.blockBreakableBonus = els.fldBreakableBonus.value;
    if (state.tool.mode === 'tile' && getTileEdit(state) === 'select' && state.selectedTileCell) {
      const { x, y } = state.selectedTileCell;
      if (isBreakableTileChar(getTileChar(state, x, y))) {
        syncBreakableHiddenBonus(state, x, y);
        syncSelectionPanelFromCell(state, x, y);
      }
    }
    render();
  });

  for (let ix = 0; ix < GRID_WIDTH; ix++) {
    const o = document.createElement('option');
    o.value = String(ix);
    o.textContent = String(ix + 1);
    els.fldPortalDx.appendChild(o);
  }
  for (let iy = 0; iy < GRID_HEIGHT; iy++) {
    const o = document.createElement('option');
    o.value = String(iy);
    o.textContent = String(iy + 1);
    els.fldPortalDy.appendChild(o);
  }

  const fillPowerupTargetAxisSelects = () => {
    const panel = els.powerupExitPanel;
    if (!panel) return;
    panel.querySelectorAll('.editor__fld-powerup-tx').forEach((sel) => {
      if (sel.options.length) return;
      for (let ix = 0; ix < GRID_WIDTH; ix++) {
        const o = document.createElement('option');
        o.value = String(ix);
        o.textContent = String(ix + 1);
        sel.appendChild(o);
      }
    });
    panel.querySelectorAll('.editor__fld-powerup-ty').forEach((sel) => {
      if (sel.options.length) return;
      for (let iy = 0; iy < GRID_HEIGHT; iy++) {
        const o = document.createElement('option');
        o.value = String(iy);
        o.textContent = String(iy + 1);
        sel.appendChild(o);
      }
    });
  };
  fillPowerupTargetAxisSelects();
  els.fldBlockEmbed.addEventListener('change', () => {
    state.blockBrushEmbed = els.fldBlockEmbed.value;
    if (state.blockBrushEmbed !== 'portal') state.blockBrushPickingPortalExit = false;
    if (
      state.blockBrushEmbed !== 'powerup' &&
      state.blockBrushEmbed !== 'speed' &&
      state.blockBrushEmbed !== 'timer'
    )
      state.blockBrushPickingHiddenPowerupExit = false;
    state.blockBrushPickingHiddenPowerupExitDir = null;
    if (state.tool.mode === 'tile' && getTileEdit(state) === 'select' && state.selectedTileCell) {
      const { x, y } = state.selectedTileCell;
      syncBlockBrushEmbeddedEntity(state, x, y);
    }
    render();
  });

  els.fldPortalDx.addEventListener('change', () => {
    const v = parseInt(els.fldPortalDx.value, 10);
    state.blockBrushPortalDestination.destinationX = Number.isNaN(v)
      ? 0
      : Math.max(0, Math.min(GRID_WIDTH - 1, v));
    pushPortalDestinationToSelectedHiddenPortal();
    render();
  });

  els.fldPortalDy.addEventListener('change', () => {
    const v = parseInt(els.fldPortalDy.value, 10);
    state.blockBrushPortalDestination.destinationY = Number.isNaN(v)
      ? 0
      : Math.max(0, Math.min(GRID_HEIGHT - 1, v));
    pushPortalDestinationToSelectedHiddenPortal();
    render();
  });

  const pushHiddenPowerupTargetsToSelectedEntity = () => {
    if (state.tool.mode !== 'tile' || getTileEdit(state) !== 'select' || !state.selectedTileCell) return;
    const { x, y } = state.selectedTileCell;
    const i = findEntityIndexAt(state, x, y);
    if (i === -1) return;
    const e = state.entities[i];
    if (e.type !== 'powerup' || !e.hidden) return;
    syncEntityTargetsFromBrushState(e, state.blockBrushHiddenPowerupTargets);
  };

  els.powerupExitPanel.addEventListener('change', (ev) => {
    const tx = ev.target.closest?.('.editor__fld-powerup-tx');
    const ty = ev.target.closest?.('.editor__fld-powerup-ty');
    const tEl = tx || ty;
    if (!tEl) return;
    const dir = tEl.dataset.dir;
    if (!dir || !state.blockBrushHiddenPowerupTargets[dir]) return;
    const v = parseInt(tEl.value, 10);
    const n = Number.isNaN(v) ? 0 : v;
    if (tx) state.blockBrushHiddenPowerupTargets[dir].x = Math.max(0, Math.min(GRID_WIDTH - 1, n));
    else state.blockBrushHiddenPowerupTargets[dir].y = Math.max(0, Math.min(GRID_HEIGHT - 1, n));
    pushHiddenPowerupTargetsToSelectedEntity();
    render();
  });

  const canPickHiddenPowerupExitFromSelection = () => {
    const tc =
      state.tool.mode === 'tile' && getTileEdit(state) === 'select' && state.selectedTileCell
        ? getTileChar(state, state.selectedTileCell.x, state.selectedTileCell.y)
        : '0';
    const pushableOk =
      isEmbeddablePushableBlockChar(tc) &&
      (state.blockBrushEmbed === 'powerup' ||
        state.blockBrushEmbed === 'speed' ||
        state.blockBrushEmbed === 'timer');
    const breakableOk = isBreakableTileChar(tc) && state.blockBreakableBonus !== 'none';
    return pushableOk || breakableOk;
  };

  const toggleHiddenPowerupExitPick = (dir) => {
    if (!canPickHiddenPowerupExitFromSelection()) return;
    state.blockBrushPickingPortalExit = false;
    if (state.blockBrushPickingHiddenPowerupExit && state.blockBrushPickingHiddenPowerupExitDir === dir) {
      state.blockBrushPickingHiddenPowerupExit = false;
      state.blockBrushPickingHiddenPowerupExitDir = null;
    } else {
      state.blockBrushPickingHiddenPowerupExit = true;
      state.blockBrushPickingHiddenPowerupExitDir = dir;
    }
    render();
  };

  els.powerupExitPanel.addEventListener('click', (ev) => {
    const allBtn = ev.target.closest?.('[data-action="pick-powerup-exit-all"]');
    const dirBtn = ev.target.closest?.('[data-action="pick-powerup-exit-dir"]');
    if (!allBtn && !dirBtn) return;
    const dir = allBtn ? null : dirBtn?.dataset?.dir ?? null;
    if (dirBtn && !HIDDEN_POWERUP_TARGET_DIRS.includes(dir)) return;
    toggleHiddenPowerupExitPick(dir);
  });

  els.btnPickPortalExit.addEventListener('click', () => {
    const tc =
      state.tool.mode === 'tile' && getTileEdit(state) === 'select' && state.selectedTileCell
        ? getTileChar(state, state.selectedTileCell.x, state.selectedTileCell.y)
        : '0';
    if (!isEmbeddablePushableBlockChar(tc) || state.blockBrushEmbed !== 'portal') return;
    state.blockBrushPickingHiddenPowerupExit = false;
    state.blockBrushPickingHiddenPowerupExitDir = null;
    state.blockBrushPickingPortalExit = !state.blockBrushPickingPortalExit;
    render();
  });

  const onEmbedDestinationPickEscape = (ev) => {
    if (ev.key !== 'Escape') return;
    if (
      !state.blockBrushPickingPortalExit &&
      !state.blockBrushPickingHiddenPowerupExit &&
      !state.tileMoveDrag
    )
      return;
    state.blockBrushPickingPortalExit = false;
    state.blockBrushPickingHiddenPowerupExit = false;
    state.blockBrushPickingHiddenPowerupExitDir = null;
    clearTileMoveDrag();
    render();
  };
  window.addEventListener('keydown', onEmbedDestinationPickEscape);

  TILE_TOOLBAR_GROUPS.forEach((group) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'editor__tile-group';
    groupEl.dataset.groupId = group.id;
    const groupLabel = document.createElement('div');
    groupLabel.className = 'editor__tile-group-label';
    groupLabel.textContent = group.label;
    const row = document.createElement('div');
    row.className = 'editor__tile-group-items';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', group.label);
    group.tiles.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor__tile-btn editor__tile-btn--tile';
      const thumb = document.createElement('span');
      if (t.kind === 'block') {
        btn.dataset.blockBrush = '';
        btn.title = t.label;
        btn.setAttribute('aria-label', t.label);
        btn.setAttribute('aria-pressed', 'false');
        const preview = TILE_BY_CHAR['1'];
        fillTileThumb(thumb, preview, TOOLBAR_TILE_THUMB_PX);
      } else {
        btn.dataset.char = t.char;
        btn.title = `${t.char} — ${t.label}`;
        btn.setAttribute('aria-label', t.label);
        btn.setAttribute('aria-pressed', 'false');
        fillTileThumb(thumb, t, TOOLBAR_TILE_THUMB_PX);
      }
      btn.append(thumb);
      row.appendChild(btn);
    });
    groupEl.append(groupLabel, row);
    els.tileToolbarInner.appendChild(groupEl);
  });

  ENTITY_TOOLBAR_GROUPS.forEach((group) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'editor__tile-group';
    groupEl.dataset.groupId = group.id;
    const groupLabel = document.createElement('div');
    groupLabel.className = 'editor__tile-group-label';
    groupLabel.textContent = group.label;
    const row = document.createElement('div');
    row.className = 'editor__tile-group-items';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', group.label);
    group.items.forEach((ent) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor__tile-btn editor__tile-btn--entity';
      btn.dataset.entityType = ent.type;
      btn.title = ent.label;
      btn.setAttribute('aria-label', ent.label);
      btn.setAttribute('aria-pressed', 'false');
      const thumb = document.createElement('span');
      fillEntityThumb(thumb, ent, TOOLBAR_TILE_THUMB_PX);
      btn.append(thumb);
      row.appendChild(btn);
    });
    groupEl.append(groupLabel, row);
    els.tileToolbarInner.appendChild(groupEl);
  });

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row = document.createElement('div');
    row.className = 'editor__row';
    row.setAttribute('role', 'row');
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = document.createElement('div');
      cell.className = 'editor__cell';
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = 0;
      cell.setAttribute('aria-label', `Cell column ${x + 1} row ${y + 1}`);
      row.appendChild(cell);
    }
    els.grid.appendChild(row);
  }

  const arrowW = GRID_WIDTH * GRID_TILE_PX;
  const arrowH = GRID_HEIGHT * GRID_TILE_PX;
  const destArrowSvg = document.createElementNS(SVG_NS, 'svg');
  destArrowSvg.classList.add('editor__destination-arrows');
  destArrowSvg.setAttribute('aria-hidden', 'true');
  destArrowSvg.setAttribute('width', String(arrowW));
  destArrowSvg.setAttribute('height', String(arrowH));
  destArrowSvg.setAttribute('viewBox', `0 0 ${arrowW} ${arrowH}`);
  const arrowDefs = document.createElementNS(SVG_NS, 'defs');
  const arrowMarker = document.createElementNS(SVG_NS, 'marker');
  arrowMarker.setAttribute('id', 'editor-dest-arrowhead');
  arrowMarker.setAttribute('markerUnits', 'userSpaceOnUse');
  arrowMarker.setAttribute('markerWidth', '8');
  arrowMarker.setAttribute('markerHeight', '8');
  arrowMarker.setAttribute('refX', '8');
  arrowMarker.setAttribute('refY', '4');
  arrowMarker.setAttribute('orient', 'auto');
  const arrowHeadPath = document.createElementNS(SVG_NS, 'path');
  arrowHeadPath.setAttribute('d', 'M0,0 L8,4 L0,8 z');
  arrowHeadPath.setAttribute('fill', DESTINATION_ARROW_COLOR);
  arrowMarker.appendChild(arrowHeadPath);
  arrowDefs.appendChild(arrowMarker);
  destArrowSvg.appendChild(arrowDefs);
  els.grid.appendChild(destArrowSvg);
  els.destinationArrowsSvg = destArrowSvg;

  const syncMetaFields = () => {
    els.fldName.value = state.name;
    if (els.fldWorldName) els.fldWorldName.value = state.world?.name ?? DEFAULT_WORLD_NAME;
    const pair = normalizeMusicPair(state.music);
    state.music = pair.music;
    state.clearMusic = pair.clearMusic;
    els.fldMusic.value = state.music;
    const previewUrl = urlForStageBgmPreview(state.music);
    els.musicPreview.src = previewUrl;
    els.musicPreview.setAttribute('aria-label', `Preview: ${stageBgmThemeLabel(state.music)}`);
    try {
      els.musicPreview.load();
    } catch {
      /* ignore */
    }
  };

  const updateModeButtons = () => {
    const te = getTileEdit(state);
    els.modeButtons.forEach((b) => {
      const m = b.dataset.mode;
      let active = false;
      if (m === 'tile-add')
        active =
          (state.tool.mode === 'tile' && te === 'add') || state.tool.mode === 'entity';
      else if (m === 'tile-select') active = state.tool.mode === 'tile' && te === 'select';
      else if (m === 'tile-erase') active = state.tool.mode === 'tile' && te === 'erase';
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  const updateTileToolbar = () => {
    const te = getTileEdit(state);
    els.tileToolbar.querySelectorAll('.editor__tile-btn--tile').forEach((btn) => {
      let on = false;
      let disabled = false;
      const ch = btn.dataset.char;
      if (btn.dataset.blockBrush != null)
        on =
          state.tool.mode === 'tile' &&
          te === 'add' &&
          state.tool.char === '1';
      else {
        on = state.tool.mode === 'tile' && te === 'add' && state.tool.char === ch;
        if (ch === TELEPORT_TILE_A)
          disabled =
            countTileCharOccurrences(state.tiles, TELEPORT_TILE_A) >= TELEPORT_TILE_MAX_PER_STAGE;
      }
      btn.disabled = disabled;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  const updateBlockBrushPanel = () => {
    const tileSelect =
      state.tool.mode === 'tile' &&
      getTileEdit(state) === 'select' &&
      state.selectedTileCell != null;
    const tcIfTileSelect = tileSelect
      ? getTileChar(state, state.selectedTileCell.x, state.selectedTileCell.y)
      : '0';
    const tileSelectShowsPanel = tileSelect && isSelectableInspectorTile(tcIfTileSelect);

    const entIdx =
      state.tool.mode === 'entity' &&
        state.selectedEntityIndex != null &&
        state.entities[state.selectedEntityIndex]
        ? state.selectedEntityIndex
        : null;
    const entityForPanel = entIdx != null ? state.entities[entIdx] : null;
    const entityModeShowsPanel = entityForPanel != null;

    let sel = null;
    let tc = '0';
    if (tileSelectShowsPanel) {
      sel = state.selectedTileCell;
      tc = tcIfTileSelect;
    } else if (entityModeShowsPanel) {
      sel = { x: entityForPanel.x, y: entityForPanel.y };
      tc = getTileChar(state, entityForPanel.x, entityForPanel.y);
    }

    const showsTileInfo = tileSelectShowsPanel || entityModeShowsPanel;

    const hasBlockSelection =
      showsTileInfo &&
      tileSelectShowsPanel &&
      (isBlockBrushChar(tc) || isBreakableTileChar(tc));

    els.blockBrush.hidden = !showsTileInfo;
    if (!showsTileInfo) {
      if (state.blockBrushPickingPortalExit) state.blockBrushPickingPortalExit = false;
      if (state.blockBrushPickingHiddenPowerupExit) state.blockBrushPickingHiddenPowerupExit = false;
      state.blockBrushPickingHiddenPowerupExitDir = null;
    }

    if (showsTileInfo) {
      fillBlockSelectionRowForCell(els, state, sel, tc);
      if (isBlockBrushChar(tc)) els.fldBlockVariant.value = state.blockVariant;
      if (isBreakableTileChar(tc)) els.fldBreakableBonus.value = state.blockBreakableBonus;
    }

    els.blockVariantWrap.hidden = !hasBlockSelection || isBreakableTileChar(tc);
    els.breakableEmbed.hidden = !hasBlockSelection || !isBreakableTileChar(tc);

    const embedChar = hasBlockSelection ? tc : state.tool.char;
    const embeddable = hasBlockSelection && isEmbeddablePushableBlockChar(embedChar);
    els.blockEmbed.hidden = !embeddable;
    if (!embeddable) state.blockBrushPickingPortalExit = false;
    if (embeddable) els.fldBlockEmbed.value = state.blockBrushEmbed;

    const showPortalExit = embeddable && state.blockBrushEmbed === 'portal';
    if (!showPortalExit && state.blockBrushPickingPortalExit) state.blockBrushPickingPortalExit = false;
    els.portalExitPanel.hidden = !showPortalExit;
    if (showPortalExit) {
      const d = state.blockBrushPortalDestination;
      els.fldPortalDx.value = String(Math.max(0, Math.min(GRID_WIDTH - 1, d.destinationX)));
      els.fldPortalDy.value = String(Math.max(0, Math.min(GRID_HEIGHT - 1, d.destinationY)));
    }

    els.portalPickBanner.hidden = !state.blockBrushPickingPortalExit;

    const pushablePowerupDest =
      embeddable &&
      (state.blockBrushEmbed === 'powerup' ||
        state.blockBrushEmbed === 'speed' ||
        state.blockBrushEmbed === 'timer');
    const breakableNeedsDest =
      hasBlockSelection && isBreakableTileChar(tc) && state.blockBreakableBonus !== 'none';
    const showHiddenPowerupDest = pushablePowerupDest || breakableNeedsDest;
    if (!showHiddenPowerupDest && state.blockBrushPickingHiddenPowerupExit) {
      state.blockBrushPickingHiddenPowerupExit = false;
      state.blockBrushPickingHiddenPowerupExitDir = null;
    }

    els.powerupExitPanel.hidden = !showHiddenPowerupDest;
    if (showHiddenPowerupDest) {
      const t = state.blockBrushHiddenPowerupTargets;
      els.powerupExitPanel.querySelectorAll('.editor__fld-powerup-tx').forEach((sel) => {
        const dir = sel.dataset.dir;
        if (!dir || !t[dir]) return;
        sel.value = String(Math.max(0, Math.min(GRID_WIDTH - 1, t[dir].x)));
      });
      els.powerupExitPanel.querySelectorAll('.editor__fld-powerup-ty').forEach((sel) => {
        const dir = sel.dataset.dir;
        if (!dir || !t[dir]) return;
        sel.value = String(Math.max(0, Math.min(GRID_HEIGHT - 1, t[dir].y)));
      });
      if (state.blockBrushPickingHiddenPowerupExit) {
        const pd = state.blockBrushPickingHiddenPowerupExitDir ?? 'all';
        els.powerupExitPanel.setAttribute('data-powerup-picking-dir', pd);
      } else els.powerupExitPanel.removeAttribute('data-powerup-picking-dir');
    } else els.powerupExitPanel.removeAttribute('data-powerup-picking-dir');

    els.powerupPickBanner.hidden = !state.blockBrushPickingHiddenPowerupExit;
    if (state.blockBrushPickingHiddenPowerupExit) {
      const dir = state.blockBrushPickingHiddenPowerupExitDir;
      const dirLabel = dir ? dir.charAt(0).toUpperCase() + dir.slice(1) : null;
      els.powerupPickBanner.textContent =
        dir == null
          ? 'Click any cell on the level grid — the same exit will apply to all four directions. Press Escape to cancel.'
          : `Click a cell on the level grid for ${dirLabel}. Other directions are unchanged. Press Escape to cancel.`;
    }
    els.gridWrap.classList.toggle(
      'editor__grid-wrap--picking-portal',
      state.blockBrushPickingPortalExit || state.blockBrushPickingHiddenPowerupExit
    );
  };

  const updateEntityToolbar = () => {
    els.tileToolbar.querySelectorAll('.editor__tile-btn--entity').forEach((btn) => {
      const entType = btn.dataset.entityType;
      const on = state.tool.mode === 'entity' && state.tool.entityType === entType;
      const atLimit =
        toolbarEntityPlacementLimit(entType) != null && !canPlaceAnotherToolbarEntity(state, entType);
      btn.disabled = atLimit;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  const gridAxisOptionsHtml = (axis, selected) => {
    const n = axis === 'x' ? GRID_WIDTH : GRID_HEIGHT;
    let html = '';
    for (let i = 0; i < n; i++)
      html += `<option value="${i}"${i === selected ? ' selected' : ''}>${i + 1}</option>`;
    return html;
  };

  const renderInspector = () => {
    if (
      state.inspectPlayerStart &&
      state.selectedTileCell &&
      state.startPosition.x === state.selectedTileCell.x &&
      state.startPosition.y === state.selectedTileCell.y
    ) {
      els.tileEntityPanel.hidden = false;
      const sx = state.startPosition.x;
      const sy = state.startPosition.y;
      els.tileEntityPanelBody.innerHTML = `
        <div class="editor__row-fields">
          <div class="editor__field">
            <label for="fld-snoopy-start-x">Column</label>
            <select id="fld-snoopy-start-x" data-inspector-start="x" aria-label="Player start column">
              ${gridAxisOptionsHtml('x', sx)}
            </select>
          </div>
          <div class="editor__field">
            <label for="fld-snoopy-start-y">Row</label>
            <select id="fld-snoopy-start-y" data-inspector-start="y" aria-label="Player start row">
              ${gridAxisOptionsHtml('y', sy)}
            </select>
          </div>
        </div>
        <p class="editor__hint" style="margin:0.35rem 0 0;font-size:.72rem;color:#9aa4b8;line-height:1.4">
          In <strong>Select</strong> mode, click the cell where Snoopy should spawn to move him here.
        </p>`;
      const sxSel = els.tileEntityPanelBody.querySelector('[data-inspector-start="x"]');
      const sySel = els.tileEntityPanelBody.querySelector('[data-inspector-start="y"]');
      sxSel.addEventListener('change', () => {
        const v = parseInt(sxSel.value, 10);
        state.startPosition.x = Number.isNaN(v) ? 0 : Math.max(0, Math.min(GRID_WIDTH - 1, v));
        render();
      });
      sySel.addEventListener('change', () => {
        const v = parseInt(sySel.value, 10);
        state.startPosition.y = Number.isNaN(v) ? 0 : Math.max(0, Math.min(GRID_HEIGHT - 1, v));
        render();
      });
      return;
    }

    const idx = state.selectedEntityIndex;
    if (idx === null || !state.entities[idx]) {
      els.tileEntityPanel.hidden = true;
      els.tileEntityPanelBody.innerHTML = '';
      return;
    }
    const e = state.entities[idx];
    els.tileEntityPanel.hidden = false;
    const entDef = ENTITY_PALETTE.find((p) => p.type === e.type);
    const titleLabel = entDef?.label ?? e.type;
    const tileUnderEntity = getTileChar(state, e.x, e.y);
    const skipMergedHead = tileUnderEntity === '0';
    const indicesHere = state.entities
      .map((ent, i) => (ent.x === e.x && ent.y === e.y ? i : -1))
      .filter((i) => i >= 0);
    let html = '';
    if (indicesHere.length > 1) {
      const opts = indicesHere
        .map((i) => {
          const ent = state.entities[i];
          const lab = `${ent.type}${ent.hidden ? ' (hidden)' : ''}`;
          return `<option value="${i}"${i === idx ? ' selected' : ''}>${lab}</option>`;
        })
        .join('');
      html += `<div class="editor__field"><label for="fld-cell-entity">Entity on this cell</label>
        <select id="fld-cell-entity" data-cell-entity-pick>${opts}</select></div>`;
    }
    if (!skipMergedHead) {
      html += `<div class="editor__entity-inspector-head">
      <div class="editor__entity-inspector-thumb-wrap"><span data-entity-inspector-thumb></span></div>
      <div>
        <p class="editor__entity-inspector-title">${titleLabel}</p>
        <p class="editor__entity-inspector-meta">Type <code>${e.type}</code> · column ${e.x + 1}, row ${e.y + 1} · grid X ${e.x}, Y ${e.y}</p>
      </div>
    </div>`;
    }

    if (e.type === 'ball') {
      html += `
        <div class="editor__row-fields">
          <div class="editor__field"><label for="fld-ent-${idx}-x">Column</label>
            <select id="fld-ent-${idx}-x" data-k="x" aria-label="Grid column">${gridAxisOptionsHtml('x', e.x)}</select></div>
          <div class="editor__field"><label for="fld-ent-${idx}-y">Row</label>
            <select id="fld-ent-${idx}-y" data-k="y" aria-label="Grid row">${gridAxisOptionsHtml('y', e.y)}</select></div>
        </div>
        <div class="editor__row-fields">
          <div class="editor__field"><label>vx</label>
            <select data-k="vx"><option value="-1">-1</option><option value="0">0</option><option value="1">1</option></select>
          </div>
          <div class="editor__field"><label>vy</label>
            <select data-k="vy"><option value="-1">-1</option><option value="0">0</option><option value="1">1</option></select>
          </div>
        </div>`;
    } else if (e.type === 'spike') {
      html += `
        <div class="editor__row-fields">
          <div class="editor__field"><label for="fld-ent-${idx}-x">Column</label>
            <select id="fld-ent-${idx}-x" data-k="x" aria-label="Grid column">${gridAxisOptionsHtml('x', e.x)}</select></div>
          <div class="editor__field"><label for="fld-ent-${idx}-y">Row</label>
            <select id="fld-ent-${idx}-y" data-k="y" aria-label="Grid row">${gridAxisOptionsHtml('y', e.y)}</select></div>
        </div>`;
    } else if (e.type === 'powerup') {
      if (e.hidden) {
        html += `<p class="editor__hint editor__hint--spaced">
          Hidden power-ups are edited with <strong>Block behavior</strong>, <strong>Hidden content</strong>,
          and <strong>Bonus exit by direction</strong> when this block cell is selected (not here).
        </p>`;
      } else {
        html += `
        <div class="editor__field"><label>powerType</label>
          <select data-k="powerType">
            <option value="invincible">invincible</option>
            <option value="time">time</option>
            <option value="speed">speed</option>
          </select>
        </div>
        <div class="editor__field"><label>targets (JSON)</label>
          <textarea data-k="targetsJson" rows="4" class="editor__json" style="min-height:4rem"></textarea>
        </div>`;
      }
    } else if (e.type === 'portal') {
      html += `
        <div class="editor__row-fields">
          <div class="editor__field"><label>destinationX</label><input type="number" data-k="destinationX" min="0" max="8" /></div>
          <div class="editor__field"><label>destinationY</label><input type="number" data-k="destinationY" min="0" max="7" /></div>
        </div>
        <div class="editor__field"><label><input type="checkbox" data-k="hidden" /> Hidden in block</label></div>
        <div class="editor__row-fields">
          <div class="editor__field"><label>blockX</label><input type="number" data-k="blockX" min="0" max="8" /></div>
          <div class="editor__field"><label>blockY</label><input type="number" data-k="blockY" min="0" max="7" /></div>
        </div>`;
    }

    const hideRemoveForHiddenEmbedded =
      (e.type === 'powerup' && e.hidden) || (e.type === 'portal' && e.hidden);
    if (!hideRemoveForHiddenEmbedded) {
      html += `<button type="button" class="editor__btn editor__btn--full" data-del-entity style="margin-top:.5rem">Remove entity</button>`;
    }
    els.tileEntityPanelBody.innerHTML = html;

    const thumbEl = skipMergedHead ? null : els.tileEntityPanelBody.querySelector('[data-entity-inspector-thumb]');
    if (thumbEl) setInspectorEntityThumbEl(thumbEl, e);

    const cellPick = els.tileEntityPanelBody.querySelector('[data-cell-entity-pick]');
    if (cellPick) {
      cellPick.addEventListener('change', () => {
        const next = parseInt(cellPick.value, 10);
        if (!Number.isNaN(next) && state.entities[next]) state.selectedEntityIndex = next;
        state.inspectPlayerStart = false;
        render();
      });
    }

    const bindEntityGridAxis = (axis) => {
      const max = axis === 'x' ? GRID_WIDTH - 1 : GRID_HEIGHT - 1;
      const el = els.tileEntityPanelBody.querySelector(`[data-k="${axis}"]`);
      if (!el) return;
      el.addEventListener('change', () => {
        let v = parseInt(el.value, 10);
        if (Number.isNaN(v)) v = 0;
        v = Math.max(0, Math.min(max, v));
        state.entities[idx][axis] = v;
        if (state.tool.mode === 'tile' && getTileEdit(state) === 'select' && state.selectedTileCell)
          state.selectedTileCell = { x: state.entities[idx].x, y: state.entities[idx].y };
        render();
      });
    };

    if (e.type === 'ball') {
      els.tileEntityPanelBody.querySelector('[data-k="vx"]').value = String(e.vx);
      els.tileEntityPanelBody.querySelector('[data-k="vy"]').value = String(e.vy);
    }
    if (e.type === 'powerup' && !e.hidden) {
      els.tileEntityPanelBody.querySelector('[data-k="powerType"]').value = e.powerType || 'invincible';
      const tj = els.tileEntityPanelBody.querySelector('[data-k="targetsJson"]');
      if (tj) tj.value = e.targets ? JSON.stringify(e.targets, null, 2) : '';
    }
    if (e.type === 'portal') {
      els.tileEntityPanelBody.querySelector('[data-k="destinationX"]').value = String(e.destinationX ?? 0);
      els.tileEntityPanelBody.querySelector('[data-k="destinationY"]').value = String(e.destinationY ?? 0);
      els.tileEntityPanelBody.querySelector('[data-k="hidden"]').checked = !!e.hidden;
      els.tileEntityPanelBody.querySelector('[data-k="blockX"]').value = String(e.blockX ?? e.x);
      els.tileEntityPanelBody.querySelector('[data-k="blockY"]').value = String(e.blockY ?? e.y);
    }

    const delEntityBtn = els.tileEntityPanelBody.querySelector('[data-del-entity]');
    if (delEntityBtn) {
      delEntityBtn.addEventListener('click', () => {
        const ex = state.entities[idx].x;
        const ey = state.entities[idx].y;
        state.entities.splice(idx, 1);
        state.selectedEntityIndex = getPrimaryEntityIndexAtCell(state, ex, ey);
        if (
          state.selectedEntityIndex == null &&
          state.selectedTileCell &&
          state.startPosition.x === state.selectedTileCell.x &&
          state.startPosition.y === state.selectedTileCell.y
        )
          state.inspectPlayerStart = true;
        else state.inspectPlayerStart = false;
        render();
      });
    }

    const bindNum = (sel, key, int = true) => {
      const el = els.tileEntityPanelBody.querySelector(sel);
      if (!el) return;
      el.addEventListener('change', () => {
        const v = int ? parseInt(el.value, 10) : el.value;
        state.entities[idx][key] = Number.isNaN(v) ? 0 : v;
        render();
      });
    };

    if (e.type === 'ball') {
      bindEntityGridAxis('x');
      bindEntityGridAxis('y');
      ['vx', 'vy'].forEach((k) => {
        const el = els.tileEntityPanelBody.querySelector(`[data-k="${k}"]`);
        el.addEventListener('change', () => {
          state.entities[idx][k] = parseInt(el.value, 10) || 0;
          render();
        });
      });
    }
    if (e.type === 'spike') {
      bindEntityGridAxis('x');
      bindEntityGridAxis('y');
    }
    if (e.type === 'powerup' && !e.hidden) {
      els.tileEntityPanelBody.querySelector('[data-k="powerType"]').addEventListener('change', (ev) => {
        state.entities[idx].powerType = ev.target.value;
        render();
      });
      const tj = els.tileEntityPanelBody.querySelector('[data-k="targetsJson"]');
      if (tj) {
        tj.addEventListener('change', (ev) => {
          const raw = ev.target.value.trim();
          if (!raw) {
            delete state.entities[idx].targets;
            return;
          }
          try {
            state.entities[idx].targets = JSON.parse(raw);
          } catch {
            /* keep previous */
          }
        });
      }
    }
    if (e.type === 'portal') {
      bindNum('[data-k="destinationX"]', 'destinationX');
      bindNum('[data-k="destinationY"]', 'destinationY');
      els.tileEntityPanelBody.querySelector('[data-k="hidden"]').addEventListener('change', (ev) => {
        state.entities[idx].hidden = ev.target.checked;
        render();
      });
      bindNum('[data-k="blockX"]', 'blockX');
      bindNum('[data-k="blockY"]', 'blockY');
    }
  };

  const renderCell = (cell) => {
    const x = +cell.dataset.x;
    const y = +cell.dataset.y;

    const d = state.tileMoveDrag;
    let char = getTileChar(state, x, y);
    let awayFromSource = false;
    if (d) {
      const { fromX: fx, fromY: fy } = d;
      const hoverInside =
        typeof d.hoverX === 'number' &&
        typeof d.hoverY === 'number' &&
        Number.isFinite(d.hoverX) &&
        Number.isFinite(d.hoverY);
      awayFromSource = hoverInside && (d.hoverX !== fx || d.hoverY !== fy);
      const skipTileStripAtSource =
        typeof d.entityDragIndex === 'number' || d.playerStartDrag === true;
      if (!skipTileStripAtSource && awayFromSource && x === fx && y === fy) char = '0';
    }

    const meta = TILE_BY_CHAR[char] ?? TILE_BY_CHAR['0'];

    cell.innerHTML = '';

    const tile = document.createElement('div');
    tile.className = 'editor__tile';
    if (char === '0') {
      tile.classList.add('editor__tile--empty');
    } else {
      tile.classList.add('editor__tile--sprite');
      if (meta.sheet === 'toggle-passable') tile.style.cssText = tileStyleFromSheet(0, 16, GRID_TILE_PX);
      else if (meta.sheet) tile.style.cssText = tileStyleFromSheet(meta.sheet.sx, meta.sheet.sy, GRID_TILE_PX);
    }
    cell.appendChild(tile);

    const destPreviewSources = entitiesWithDestinationAt(state, x, y);
    if (destPreviewSources.length > 0) {
      const layer = document.createElement('div');
      layer.className = 'editor__destination-preview';
      layer.setAttribute('aria-hidden', 'true');
      for (const e of destPreviewSources) {
        const g = document.createElement('div');
        g.className = 'editor__destination-preview-glyph';
        if (e.type === 'portal') {
          const def = ENTITY_PALETTE.find((p) => p.type === 'portal');
          g.style.cssText = `${tileStyleFromSheet(def.sheet.sx, def.sheet.sy, DESTINATION_PREVIEW_PX)};width:${DESTINATION_PREVIEW_PX}px;height:${DESTINATION_PREVIEW_PX}px`;
        } else if (e.type === 'powerup') {
          g.style.cssText = getEntitySpriteStyle('powerup', {
            powerType: e.powerType,
            outSize: DESTINATION_PREVIEW_PX,
          });
        } else continue;
        layer.appendChild(g);
      }
      if (layer.childNodes.length > 0) cell.appendChild(layer);
    }

    if (isEmbeddablePushableBlockChar(char))
      appendPushableDirectionBadge(cell, char, GRID_TILE_PX, { accessible: true });

    let entitiesHere = state.entities.filter((ent) => ent.x === x && ent.y === y);
    if (d && awayFromSource && d.fromX === x && d.fromY === y) {
      if (typeof d.entityDragIndex === 'number')
        entitiesHere = entitiesHere.filter(
          (ent) => state.entities.indexOf(ent) !== d.entityDragIndex
        );
      else if (!d.playerStartDrag) entitiesHere = [];
    }
    const hiddenPu = entitiesHere.find((e) => e.type === 'powerup' && e.hidden);
    const hiddenPortal = entitiesHere.find((e) => e.type === 'portal' && e.hidden);
    const tileForBonusBadge = isEmbeddablePushableBlockChar(char) || isBreakableTileChar(char);

    if (hiddenPu && tileForBonusBadge) {
      const badge = document.createElement('div');
      badge.className = 'editor__hidden-bonus-badge';
      const icon = document.createElement('div');
      icon.className = 'editor__hidden-bonus-badge-icon';
      icon.setAttribute('role', 'img');
      const pt = hiddenPu.powerType === 'time' ? 'timer' : hiddenPu.powerType || 'invincible';
      icon.setAttribute('aria-label', `Hidden ${pt} power-up in block`);
      icon.style.cssText = getEntitySpriteStyle('powerup', {
        powerType: hiddenPu.powerType,
        outSize: HIDDEN_BONUS_BADGE_PX,
      });
      badge.appendChild(icon);
      cell.appendChild(badge);
    } else if (hiddenPortal && tileForBonusBadge) {
      const badge = document.createElement('div');
      badge.className = 'editor__hidden-bonus-badge';
      const icon = document.createElement('div');
      icon.className = 'editor__hidden-bonus-badge-icon';
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', 'Hidden portal in block');
      const def = ENTITY_PALETTE.find((p) => p.type === 'portal');
      icon.style.cssText = `${tileStyleFromSheet(def.sheet.sx, def.sheet.sy, HIDDEN_BONUS_BADGE_PX)};width:${HIDDEN_BONUS_BADGE_PX}px;height:${HIDDEN_BONUS_BADGE_PX}px`;
      badge.appendChild(icon);
      cell.appendChild(badge);
    }

    const primaryForOverlay = entitiesHere.find((e) => {
      if (!tileForBonusBadge) return true;
      if (e.type === 'powerup' && e.hidden) return false;
      if (e.type === 'portal' && e.hidden) return false;
      return true;
    });
    if (primaryForOverlay) {
      const ent = primaryForOverlay;
      const wrap = document.createElement('div');
      wrap.className = 'editor__entity';
      if (ent.type === 'portal') {
        const def = ENTITY_PALETTE.find((p) => p.type === 'portal');
        const d = document.createElement('div');
        d.className = 'editor__entity-icon';
        d.setAttribute('role', 'img');
        d.setAttribute('aria-label', 'portal');
        d.style.cssText = `${tileStyleFromSheet(def.sheet.sx, def.sheet.sy, CELL_PORTAL_ICON_PX)};width:${CELL_PORTAL_ICON_PX}px;height:${CELL_PORTAL_ICON_PX}px`;
        wrap.appendChild(d);
      } else {
        const d = document.createElement('div');
        d.className = 'editor__entity-icon';
        d.setAttribute('role', 'img');
        d.setAttribute('aria-label', ent.type);
        d.style.cssText = getEntitySpriteStyle(
          ent.type,
          ent.type === 'powerup' ? { powerType: ent.powerType } : {}
        );
        wrap.appendChild(d);
      }
      cell.appendChild(wrap);
    }

    const hideStartDuringPlayerDrag =
      d &&
      d.playerStartDrag === true &&
      awayFromSource &&
      d.fromX === x &&
      d.fromY === y;
    if (state.startPosition.x === x && state.startPosition.y === y && !hideStartDuringPlayerDrag) {
      const st = document.createElement('div');
      st.className = 'editor__start';
      const marker = document.createElement('div');
      marker.className = 'editor__start-icon';
      marker.setAttribute('role', 'img');
      marker.setAttribute('aria-label', 'Player start');
      marker.style.cssText = getSnoopyStartMarkerStyle();
      st.appendChild(marker);
      cell.appendChild(st);
    }

    const showGhostHere =
      d &&
      awayFromSource &&
      typeof d.hoverX === 'number' &&
      typeof d.hoverY === 'number' &&
      d.hoverX === x &&
      d.hoverY === y;
    if (showGhostHere) {
      if (typeof d.entityDragIndex === 'number' && state.entities[d.entityDragIndex]) {
        const invalid = !isEntityMoveDropValid(state, d.entityDragIndex, d.hoverX, d.hoverY);
        appendEntityMovePreviewLayer(cell, state, d.entityDragIndex, invalid);
      } else if (d.playerStartDrag === true) {
        const invalid = !isPlayerStartMoveDropValid(state, d.fromX, d.fromY, d.hoverX, d.hoverY);
        appendPlayerStartMovePreviewLayer(cell, invalid);
      } else {
        const invalid = !isTileMoveDropValid(state, d.fromX, d.fromY, d.hoverX, d.hoverY);
        appendTileMovePreviewLayer(cell, state, d.fromX, d.fromY, invalid);
      }
    }

    cell.classList.remove('editor__cell--tile-selected');
    if (
      state.tool.mode === 'tile' &&
      getTileEdit(state) === 'select' &&
      state.selectedTileCell &&
      state.selectedTileCell.x === x &&
      state.selectedTileCell.y === y
    )
      cell.classList.add('editor__cell--tile-selected');
  };

  const renderGrid = () => {
    els.grid.querySelectorAll('.editor__cell').forEach(renderCell);
  };

  const renderDestinationArrows = () => {
    const svg = els.destinationArrowsSvg;
    if (!svg) return;
    svg.querySelectorAll('.editor__dest-arrow-line').forEach((n) => n.remove());

    const insetStart = 17;
    const insetEnd = 12;

    const appendDestArrow = (ex, ey, tx, ty) => {
      if (typeof tx !== 'number' || typeof ty !== 'number') return;
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
      if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) return;
      if (ex === tx && ey === ty) return;
      const x1 = (ex + 0.5) * GRID_TILE_PX;
      const y1 = (ey + 0.5) * GRID_TILE_PX;
      const x2 = (tx + 0.5) * GRID_TILE_PX;
      const y2 = (ty + 0.5) * GRID_TILE_PX;
      const seg = shortenArrowSegment(x1, y1, x2, y2, insetStart, insetEnd);
      if (!seg) return;
      const line = document.createElementNS(SVG_NS, 'line');
      line.classList.add('editor__dest-arrow-line');
      line.setAttribute('x1', String(seg.x1));
      line.setAttribute('y1', String(seg.y1));
      line.setAttribute('x2', String(seg.x2));
      line.setAttribute('y2', String(seg.y2));
      line.setAttribute('stroke', DESTINATION_ARROW_COLOR);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('marker-end', 'url(#editor-dest-arrowhead)');
      line.setAttribute('opacity', '0.82');
      svg.appendChild(line);
    };

    for (const e of state.entities) {
      if (e.type === 'portal') {
        appendDestArrow(e.x, e.y, e.destinationX, e.destinationY);
        continue;
      }
      if (e.type !== 'powerup') continue;

      if (e.hidden && e.targets && typeof e.targets === 'object') {
        const seen = new Set();
        for (const dir of HIDDEN_POWERUP_TARGET_DIRS) {
          const c = readHiddenPowerupTargetCell(e.targets, dir);
          if (!c) continue;
          const k = `${c.destinationX},${c.destinationY}`;
          if (seen.has(k)) continue;
          seen.add(k);
          appendDestArrow(e.x, e.y, c.destinationX, c.destinationY);
        }
        continue;
      }

      appendDestArrow(e.x, e.y, e.destinationX, e.destinationY);
    }
  };

  const drawStagePreviewOnCanvas = (canvas, slice) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cell = STAGE_PREVIEW_CELL_PX;
    const w = GRID_WIDTH * cell;
    const h = GRID_HEIGHT * cell;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      const row = String(slice.tiles[y] || '').padEnd(GRID_WIDTH, '0');
      for (let x = 0; x < GRID_WIDTH; x++) {
        const ch = row[x] || '0';
        ctx.fillStyle = STAGE_PREVIEW_TILE_HEX[ch] ?? STAGE_PREVIEW_TILE_HEX['0'];
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const sx = Math.floor(slice.startPosition?.x ?? 0);
    const sy = Math.floor(slice.startPosition?.y ?? 0);
    if (sx >= 0 && sx < GRID_WIDTH && sy >= 0 && sy < GRID_HEIGHT) {
      ctx.fillStyle = 'rgba(28, 48, 120, 0.92)';
      ctx.fillRect(sx * cell, sy * cell, cell, cell);
      ctx.strokeStyle = '#e8ecf4';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx * cell + 0.5, sy * cell + 0.5, Math.max(0, cell - 1), Math.max(0, cell - 1));
    }
  };

  const renderWorldStrip = () => {
    if (!els.worldStagesRow || !els.fldWorldName || !els.btnWorldAddStage) return;
    els.fldWorldName.value = state.world?.name ?? DEFAULT_WORLD_NAME;
    els.worldStagesRow.textContent = '';
    const w = state.world;
    if (!w?.stages?.length) return;
    w.stages.forEach((slice, index) => {
      const card = document.createElement('div');
      card.className = 'editor__world-stage-card';
      if (index === w.activeStageIndex) card.classList.add('editor__world-stage-card--active');
      card.dataset.stageIndex = String(index);

      const prev = document.createElement('canvas');
      prev.className = 'editor__world-stage-preview';
      prev.setAttribute('aria-hidden', 'true');
      prev.draggable = false;
      drawStagePreviewOnCanvas(prev, slice);

      const wrap = document.createElement('div');
      wrap.className = 'editor__world-stage-preview-wrap';
      wrap.appendChild(prev);

      const { valid, errors } = validateLevelSlice(slice);
      if (!valid) {
        const bad = document.createElement('span');
        bad.className = 'editor__world-stage-invalid';
        bad.title = errors.slice(0, 6).join('; ');
        bad.setAttribute('role', 'img');
        bad.setAttribute('aria-label', `Invalid: ${errors[0] ?? 'check stage'}`);
        bad.textContent = '!';
        wrap.appendChild(bad);
      }

      const dragHandle = document.createElement('span');
      dragHandle.className = 'editor__world-stage-drag-handle material-symbols-outlined';
      dragHandle.setAttribute('aria-hidden', 'true');
      dragHandle.title = 'Drag to reorder';
      dragHandle.textContent = 'drag_indicator';

      const meta = document.createElement('div');
      meta.className = 'editor__world-stage-meta';
      meta.appendChild(dragHandle);
      const title = document.createElement('span');
      title.className = 'editor__world-stage-title';
      const rawName = String(slice.name || '').trim();
      title.textContent = rawName || `Stage ${index + 1}`;
      meta.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'editor__world-stage-actions';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'editor__btn editor__btn--world-stage-del';
      del.dataset.action = 'world-remove-stage';
      del.dataset.stageIndex = String(index);
      del.setAttribute('aria-label', `Remove stage ${index + 1}`);
      del.disabled = w.stages.length <= 1;
      const delIcon = document.createElement('span');
      delIcon.className = 'material-symbols-outlined editor__world-stage-del-icon';
      delIcon.setAttribute('aria-hidden', 'true');
      delIcon.textContent = 'delete';
      del.appendChild(delIcon);
      actions.appendChild(del);

      const footer = document.createElement('div');
      footer.className = 'editor__world-stage-footer';
      footer.appendChild(meta);
      footer.appendChild(actions);

      card.appendChild(wrap);
      card.appendChild(footer);
      els.worldStagesRow.appendChild(card);
    });

    const canAdd = allWorldStagesValid(state);
    els.btnWorldAddStage.disabled = !canAdd;
    const hint = els.worldAddHint;
    if (hint) {
      if (!canAdd) {
        hint.hidden = false;
        const inv = firstInvalidWorldStage(state);
        hint.textContent = inv?.errors?.length
          ? `Fix all stages before adding another. Stage ${inv.index + 1}: ${inv.errors[0]}`
          : 'Fix all stages before adding another.';
      } else {
        hint.hidden = true;
        hint.textContent = '';
      }
    }
  };

  const render = () => {
    persistActiveWorldStage(state);
    if (state.selectedEntityIndex != null && state.selectedEntityIndex >= state.entities.length)
      state.selectedEntityIndex = null;
    if (state.selectedTileCell) {
      const { x: sx, y: sy } = state.selectedTileCell;
      const ch = getTileChar(state, sx, sy);
      if (!isSelectableInspectorTile(ch)) {
        state.selectedTileCell = null;
        state.selectedEntityIndex = null;
        state.inspectPlayerStart = false;
        clearTileMoveDrag();
      }
    }
    if (
      state.selectedTileCell &&
      state.selectedEntityIndex != null &&
      state.entities[state.selectedEntityIndex]
    ) {
      const e = state.entities[state.selectedEntityIndex];
      const { x: sx, y: sy } = state.selectedTileCell;
      if (e.x !== sx || e.y !== sy) state.selectedEntityIndex = null;
    }
    if (
      state.tool.mode === 'tile' &&
      getTileEdit(state) === 'select' &&
      state.selectedTileCell &&
      state.selectedEntityIndex == null &&
      state.startPosition.x === state.selectedTileCell.x &&
      state.startPosition.y === state.selectedTileCell.y
    )
      state.inspectPlayerStart = true;

    if (state.inspectPlayerStart && state.selectedTileCell) {
      if (state.startPosition.x !== state.selectedTileCell.x || state.startPosition.y !== state.selectedTileCell.y)
        state.inspectPlayerStart = false;
    }
    if (state.tool.mode === 'tile' && getTileEdit(state) !== 'select') {
      if (state.selectedEntityIndex != null) state.selectedEntityIndex = null;
      if (state.inspectPlayerStart) state.inspectPlayerStart = false;
    }
    syncMetaFields();
    updateModeButtons();
    updateTileToolbar();
    updateBlockBrushPanel();
    updateEntityToolbar();
    renderGrid();
    renderDestinationArrows();
    renderWorldStrip();
    els.fldJson.value = serializeProjectForExport(state);
    renderInspector();
    if (els.btnClearStageOpen) {
      const pristine = isClearStageButtonDisabled(state);
      els.btnClearStageOpen.disabled = pristine;
      els.btnClearStageOpen.title = pristine ? 'Nothing to clear — the stage is already empty.' : '';
    }
    const worldOk = allWorldStagesValid(state);
    if (els.btnWorldPlayNow) {
      els.btnWorldPlayNow.disabled = !worldOk;
      els.btnWorldPlayNow.title = worldOk
        ? `Open the game in a new tab and play this world (${getPlayGameBaseUrl()})`
        : 'Fix all stages before playing — same rules as download.';
    }
    if (els.btnWorldDownload) {
      els.btnWorldDownload.disabled = !worldOk;
      els.btnWorldDownload.title = worldOk
        ? 'Download this world as JSON (all stages)'
        : 'Fix all stages before downloading — see hints on stage cards or below.';
    }
  };

  els.modeButtons.forEach((b) => {
    b.addEventListener('click', () => {
      clearTileMoveDrag();
      const m = b.dataset.mode;
      const preserveChar = () => {
        const c = state.tool?.char;
        return isBlockBrushChar(c) ? c : '1';
      };
      if (m === 'tile-add') {
        state.tool = { mode: 'tile', char: preserveChar(), tileEdit: 'add' };
        state.selectedTileCell = null;
        state.inspectPlayerStart = false;
      }
      if (m === 'tile-select') {
        state.tool = { mode: 'tile', char: preserveChar(), tileEdit: 'select' };
      }
      if (m === 'tile-erase') {
        state.tool = { mode: 'tile', char: preserveChar(), tileEdit: 'erase' };
        state.selectedTileCell = null;
        state.inspectPlayerStart = false;
      }
      render();
    });
  });

  els.tileToolbar.addEventListener('click', (ev) => {
    const entityBtn = ev.target.closest('.editor__tile-btn--entity[data-entity-type]');
    if (entityBtn) {
      if (entityBtn.disabled) return;
      state.tool = { mode: 'entity', entityType: entityBtn.dataset.entityType };
      state.selectedEntityIndex = null;
      state.selectedTileCell = null;
      state.inspectPlayerStart = false;
      clearTileMoveDrag();
      render();
      return;
    }
    const btn = ev.target.closest('.editor__tile-btn--tile');
    if (!btn || btn.disabled) return;
    const te = getTileEdit(state);
    const switchToAdd = te !== 'add';
    if (btn.dataset.blockBrush != null) {
      state.blockVariant = '1';
      state.blockBrushEmbed = 'none';
      state.blockBrushPickingPortalExit = false;
      state.blockBrushPickingHiddenPowerupExit = false;
      state.blockBrushPickingHiddenPowerupExitDir = null;
      state.tool = { mode: 'tile', char: '1', tileEdit: 'add' };
    } else if (btn.dataset.char) {
      const nextChar = btn.dataset.char;
      if (isBlockBrushChar(nextChar)) state.blockVariant = nextChar;
      state.tool = { mode: 'tile', char: nextChar, tileEdit: 'add' };
    }
    else return;
    state.selectedEntityIndex = null;
    if (switchToAdd) {
      state.selectedTileCell = null;
      state.inspectPlayerStart = false;
      clearTileMoveDrag();
    }
    render();
  });

  const applySelectCellCore = (state, x, y) => {
    const c = getTileChar(state, x, y);
    if (!isSelectableInspectorTile(c)) {
      state.selectedTileCell = null;
      state.selectedEntityIndex = null;
      state.inspectPlayerStart = false;
    } else {
      state.selectedTileCell = { x, y };
      if (isBlockBrushChar(c) || isBreakableTileChar(c)) syncSelectionPanelFromCell(state, x, y);
      const ei = getPrimaryEntityIndexAtCell(state, x, y);
      if (ei != null) {
        state.selectedEntityIndex = ei;
        state.inspectPlayerStart = false;
      } else if (state.startPosition.x === x && state.startPosition.y === y) {
        state.selectedEntityIndex = null;
        state.inspectPlayerStart = true;
      } else {
        state.selectedEntityIndex = null;
        state.inspectPlayerStart = false;
      }
    }
  };

  const applyCell = (x, y, opts = {}) => {
    const { selectEntityOnly = false } = opts;
    if (state.tool.mode === 'tile') {
      const te = getTileEdit(state);
      if (te === 'select') {
        applySelectCellCore(state, x, y);
        render();
        return;
      }
      if (te === 'erase') {
        setTileChar(state, x, y, '0');
        removeAllEntitiesAtCell(state, x, y);
        if (state.selectedTileCell?.x === x && state.selectedTileCell?.y === y) {
          state.selectedTileCell = null;
          state.inspectPlayerStart = false;
        }
        state.selectedEntityIndex = null;
        render();
        return;
      }
      if (getTileChar(state, x, y) === state.tool.char) {
        state.selectedEntityIndex = null;
        render();
        return;
      }
      if (hasEntityOnCell(state, x, y)) {
        state.selectedEntityIndex = null;
        render();
        return;
      }
      if (isPlayerStartCell(state, x, y)) {
        state.selectedEntityIndex = null;
        render();
        return;
      }
      if (!canPaintTileCharAt(state, x, y, state.tool.char)) {
        state.selectedEntityIndex = null;
        render();
        return;
      }
      setTileChar(state, x, y, state.tool.char);
      if (isBreakableTileChar(state.tool.char)) syncBreakableHiddenBonus(state, x, y);
      else syncBlockBrushEmbeddedEntity(state, x, y);
      state.selectedEntityIndex = null;
    } else if (state.tool.mode === 'entity') {
      const i = findEntityIndexAt(state, x, y);
      if (selectEntityOnly && i !== -1) {
        state.selectedEntityIndex = i;
        render();
        return;
      }
      if (i !== -1 && state.entities[i].type === state.tool.entityType) {
        state.selectedEntityIndex = i;
        render();
        return;
      }
      if (i !== -1) {
        state.selectedEntityIndex = getPrimaryEntityIndexAtCell(state, x, y) ?? i;
        render();
        return;
      }
      if (i === -1 && isPlayerStartCell(state, x, y)) {
        render();
        return;
      }
      if (!canPlaceAnotherToolbarEntity(state, state.tool.entityType)) {
        render();
        return;
      }
      const neu = makeEntity(state.tool.entityType, x, y);
      if (!neu) return;
      state.entities.push(neu);
      state.selectedEntityIndex = findEntityIndexAt(state, x, y);
    }
    render();
  };

  const tryConsumeEmbedDestinationPick = (x, y) => {
    if (state.blockBrushPickingPortalExit) {
      state.blockBrushPortalDestination = { destinationX: x, destinationY: y };
      state.blockBrushPickingPortalExit = false;
      pushPortalDestinationToSelectedHiddenPortal();
      render();
      return true;
    }
    if (state.blockBrushPickingHiddenPowerupExit) {
      const d = clampDestination(x, y);
      const pt = { x: d.destinationX, y: d.destinationY };
      const pickDir = state.blockBrushPickingHiddenPowerupExitDir;
      if (pickDir == null)
        for (const dir of HIDDEN_POWERUP_TARGET_DIRS) state.blockBrushHiddenPowerupTargets[dir] = { ...pt };
      else if (state.blockBrushHiddenPowerupTargets[pickDir])
        state.blockBrushHiddenPowerupTargets[pickDir] = { ...pt };
      state.blockBrushPickingHiddenPowerupExit = false;
      state.blockBrushPickingHiddenPowerupExitDir = null;
      pushHiddenPowerupTargetsToSelectedEntity();
      render();
      return true;
    }
    return false;
  };

  let painting = false;
  let suppressEntityToolGridClick = false;

  els.grid.addEventListener('mousedown', (ev) => {
    const cell = ev.target.closest('.editor__cell');
    if (!cell) return;
    const x = +cell.dataset.x;
    const y = +cell.dataset.y;
    if (
      state.tileMoveDrag &&
      (state.tileMoveDrag.fromX !== x || state.tileMoveDrag.fromY !== y)
    )
      clearTileMoveDrag();
    if (tryConsumeEmbedDestinationPick(x, y)) return;
    if (
      state.tool.mode === 'tile' &&
      getTileEdit(state) === 'select' &&
      ev.button === 0 &&
      !state.blockBrushPickingPortalExit &&
      !state.blockBrushPickingHiddenPowerupExit
    ) {
      applySelectCellCore(state, x, y);
      if (
        state.selectedTileCell &&
        state.selectedTileCell.x === x &&
        state.selectedTileCell.y === y
      ) {
        const c = getTileChar(state, x, y);
        if (c !== '0' && (isBlockBrushChar(c) || isBreakableTileChar(c))) {
          ev.preventDefault();
          state.tileMoveDrag = { fromX: x, fromY: y, hoverX: x, hoverY: y };
          els.gridWrap.classList.add('editor__grid-wrap--tile-moving');
          render();
          return;
        }
        const ei = state.selectedEntityIndex;
        if (
          ei != null &&
          state.entities[ei] &&
          state.entities[ei].x === x &&
          state.entities[ei].y === y
        ) {
          ev.preventDefault();
          state.tileMoveDrag = {
            fromX: x,
            fromY: y,
            hoverX: x,
            hoverY: y,
            entityDragIndex: ei,
          };
          els.gridWrap.classList.add('editor__grid-wrap--tile-moving');
          render();
          return;
        }
        if (
          state.inspectPlayerStart &&
          state.startPosition.x === x &&
          state.startPosition.y === y
        ) {
          ev.preventDefault();
          state.tileMoveDrag = {
            fromX: x,
            fromY: y,
            hoverX: x,
            hoverY: y,
            playerStartDrag: true,
          };
          els.gridWrap.classList.add('editor__grid-wrap--tile-moving');
          render();
          return;
        }
      }
      render();
      return;
    }
    if (
      state.tool.mode === 'entity' &&
      ev.button === 0 &&
      !state.blockBrushPickingPortalExit &&
      !state.blockBrushPickingHiddenPowerupExit &&
      state.selectedEntityIndex != null &&
      state.entities[state.selectedEntityIndex] &&
      state.entities[state.selectedEntityIndex].x === x &&
      state.entities[state.selectedEntityIndex].y === y
    ) {
      const ei = state.selectedEntityIndex;
      ev.preventDefault();
      state.tileMoveDrag = {
        fromX: x,
        fromY: y,
        hoverX: x,
        hoverY: y,
        entityDragIndex: ei,
      };
      els.gridWrap.classList.add('editor__grid-wrap--tile-moving');
      render();
      return;
    }
    if (state.tool.mode === 'tile') {
      const te = getTileEdit(state);
      if (te === 'add') {
        painting = true;
        applyCell(x, y);
      } else applyCell(x, y);
    }
  });

  window.addEventListener('mouseup', (ev) => {
    painting = false;
    const drag = state.tileMoveDrag;
    if (!drag) return;
    clearTileMoveDrag();
    if (state.tool.mode === 'entity') suppressEntityToolGridClick = true;
    let cell = ev.target?.closest?.('.editor__cell');
    if (!cell && typeof ev.clientX === 'number') {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      cell = el?.closest?.('.editor__cell');
    }
    if (!cell) {
      render();
      return;
    }
    const toX = +cell.dataset.x;
    const toY = +cell.dataset.y;
    if (drag.playerStartDrag === true) movePlayerStartTo(state, toX, toY);
    else if (typeof drag.entityDragIndex === 'number')
      moveEntityWithIndexTo(state, drag.entityDragIndex, toX, toY);
    else if (moveTileWithEntitiesAt(state, drag.fromX, drag.fromY, toX, toY))
      syncSelectionPanelFromCell(state, toX, toY);
    render();
  });

  let tileMoveHoverRaf = 0;
  const tileMovePointer = { clientX: 0, clientY: 0 };

  window.addEventListener('mousemove', (ev) => {
    if (!state.tileMoveDrag) return;
    tileMovePointer.clientX = ev.clientX;
    tileMovePointer.clientY = ev.clientY;
    if (tileMoveHoverRaf) return;
    tileMoveHoverRaf = requestAnimationFrame(() => {
      tileMoveHoverRaf = 0;
      const drag = state.tileMoveDrag;
      if (!drag) return;
      const el = document.elementFromPoint(tileMovePointer.clientX, tileMovePointer.clientY);
      const hoverCell = el?.closest?.('.editor__cell');
      let nextHx;
      let nextHy;
      if (hoverCell && els.grid.contains(hoverCell)) {
        nextHx = +hoverCell.dataset.x;
        nextHy = +hoverCell.dataset.y;
      }
      if (drag.hoverX === nextHx && drag.hoverY === nextHy) return;
      state.tileMoveDrag = { ...drag, hoverX: nextHx, hoverY: nextHy };
      render();
    });
  });

  els.grid.addEventListener('mouseenter', (ev) => {
    if (state.tileMoveDrag) return;
    if (state.blockBrushPickingPortalExit || state.blockBrushPickingHiddenPowerupExit) return;
    if (!painting || state.tool.mode !== 'tile' || getTileEdit(state) !== 'add') return;
    const cell = ev.target.closest('.editor__cell');
    if (!cell) return;
    applyCell(+cell.dataset.x, +cell.dataset.y);
  }, true);

  els.grid.addEventListener('click', (ev) => {
    const cell = ev.target.closest('.editor__cell');
    if (!cell) return;
    const x = +cell.dataset.x;
    const y = +cell.dataset.y;
    if (tryConsumeEmbedDestinationPick(x, y)) return;
    if (suppressEntityToolGridClick) {
      suppressEntityToolGridClick = false;
      return;
    }
    if (state.tool.mode !== 'tile') applyCell(x, y, { selectEntityOnly: ev.shiftKey });
  });

  els.fldName.addEventListener('input', () => {
    state.name = els.fldName.value;
    render();
  });
  els.fldMusic.addEventListener('change', () => {
    const pair = normalizeMusicPair(els.fldMusic.value);
    state.music = pair.music;
    state.clearMusic = pair.clearMusic;
    render();
  });

  root.querySelector('[data-action="copy"]').addEventListener('click', () => {
    copyText(serializeProjectForExport(state));
  });
  root.querySelector('[data-action="import"]').addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      const worldDoc = parseWorldDocumentFromImportData(data);
      if (worldDoc) {
        state.world = {
          name: worldDoc.world.name,
          activeStageIndex: worldDoc.world.activeStageIndex,
          stages: worldDoc.world.stages.map((s) => deepCloneLevelSlice(s)),
        };
        for (const s of state.world.stages) normalizeImportedEntitiesInPlace(s.entities);
        applyLevelSliceToState(
          state,
          deepCloneLevelSlice(state.world.stages[state.world.activeStageIndex])
        );
      } else {
        const parsed = parseLevelImport(text);
        Object.assign(state, parsed);
        delete state.id;
        state.world = {
          name: DEFAULT_WORLD_NAME,
          activeStageIndex: 0,
          stages: [deepCloneLevelSlice(extractLevelSliceFromState(state))],
        };
      }
      state.blockVariant = '1';
      state.blockBrushEmbed = 'none';
      state.blockBrushPortalDestination = { destinationX: 4, destinationY: 4 };
      state.blockBrushPickingPortalExit = false;
      const firstHiddenPu = state.entities?.find((e) => e.type === 'powerup' && e.hidden);
      state.blockBrushHiddenPowerupTargets = firstHiddenPu
        ? brushTargetsFromEntity(firstHiddenPu)
        : createDefaultHiddenPowerupTargets();
      state.blockBrushPickingHiddenPowerupExit = false;
      state.blockBrushPickingHiddenPowerupExitDir = null;
      state.blockBreakableBonus = 'none';
      state.tool = { mode: 'tile', char: '1', tileEdit: 'add' };
      state.selectedEntityIndex = null;
      state.selectedTileCell = null;
      state.inspectPlayerStart = false;
      clearTileMoveDrag();
      render();
    } catch (err) {
      window.alert(`Invalid JSON: ${err.message}`);
    }
  });

  render();
};
