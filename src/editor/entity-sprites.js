import { getGbSpriteUrl } from './gb-sprite-urls.js';

/**
 * CSS background clipping for sprite sheets (same regions as game sprite-manager).
 */

const clipSheet = (path, sheetW, sheetH, sx, sy, sw, sh, outW, outH) => {
  const url = getGbSpriteUrl(path);
  const bgw = (sheetW * outW) / sw;
  const bgh = (sheetH * outH) / sh;
  const posX = (sx * outW) / sw;
  const posY = (sy * outH) / sh;
  return [
    'flex-shrink:0',
    `width:${outW}px`,
    `height:${outH}px`,
    `background-image:url("${url}")`,
    `background-size:${bgw}px ${bgh}px`,
    `background-position:-${posX}px -${posY}px`,
    'background-repeat:no-repeat',
    'image-rendering:pixelated',
  ].join(';');
};

/** Map `powerup.powerType` to sprite column in `powerups.png` (aligned with game sprite-manager). */
const powerTypeToSx = (powerType) => {
  if (powerType === 'time') return 16;
  if (powerType === 'speed') return 32;
  return 0;
};

/**
 * @param {string} entityType
 * @param {{ powerType?: string; outSize?: number }} [opts]
 *   `outSize` — square output in px (e.g. grid cell fraction for badge); defaults per entity type.
 * @returns {string} inline CSS for a div
 */
export const getEntitySpriteStyle = (entityType, opts = {}) => {
  const powerType = opts.powerType || 'invincible';
  const outSize = opts.outSize;
  switch (entityType) {
    case 'woodstock':
      return clipSheet('/sprites/woodstock.png', 16, 16, 0, 0, 16, 16, outSize ?? 32, outSize ?? 32);
    case 'ball':
      return clipSheet('/sprites/ball.png', 29, 8, 0, 0, 8, 8, outSize ?? 18, outSize ?? 18);
    case 'spike':
      return clipSheet('/sprites/spike.png', 144, 32, 0, 0, 16, 16, outSize ?? 32, outSize ?? 32);
    case 'powerup': {
      const s = outSize ?? 32;
      return clipSheet(
        '/sprites/powerups.png',
        64,
        16,
        powerTypeToSx(powerType),
        0,
        16,
        16,
        s,
        s
      );
    }
    default:
      return '';
  }
};

/** Idle Snoopy facing down, frame 0 — same slice as sprite-manager `drawSnoopy` direction 1, frame 0. */
export const getSnoopyStartMarkerStyle = (outPx = 32) =>
  clipSheet('/sprites/snoopy.png', 144, 32, 0, 0, 16, 16, outPx, outPx);
