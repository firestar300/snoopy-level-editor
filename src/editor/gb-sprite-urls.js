/**
 * Game Boy 4-color remapping for editor sprites (same algorithm as snoopys-magic-show
 * `src/engine/sprite-manager.js` `applyGameBoyPalette`).
 */

import { publicAssetUrl } from '../public-asset-url.js';

const GB_PALETTE = [
  { r: 15, g: 56, b: 15 },
  { r: 48, g: 98, b: 48 },
  { r: 139, g: 172, b: 15 },
  { r: 155, g: 188, b: 15 },
];

export const SPRITE_BLOCKS = publicAssetUrl('sprites/blocks.png');
export const SPRITE_WOODSTOCK = publicAssetUrl('sprites/woodstock.png');
export const SPRITE_BALL = publicAssetUrl('sprites/ball.png');
export const SPRITE_SPIKE = publicAssetUrl('sprites/spike.png');
export const SPRITE_POWERUPS = publicAssetUrl('sprites/powerups.png');
export const SPRITE_SNOOPY = publicAssetUrl('sprites/snoopy.png');

/** Sprite URLs processed for the editor (under `public/sprites/`). */
export const GB_SPRITE_PATHS = [
  SPRITE_BLOCKS,
  SPRITE_WOODSTOCK,
  SPRITE_BALL,
  SPRITE_SPIKE,
  SPRITE_POWERUPS,
  SPRITE_SNOOPY,
];

const processedUrlByPath = new Map();

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });

/**
 * @param {HTMLImageElement} img
 * @returns {Promise<string>} PNG data URL
 */
export const applyGameBoyPaletteToDataUrl = (img) =>
  new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const paletteIndex = gray < 64 ? 0 : gray < 128 ? 1 : gray < 192 ? 2 : 3;
        const color = GB_PALETTE[paletteIndex];
        data[i] = color.r;
        data[i + 1] = color.g;
        data[i + 2] = color.b;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    } catch (err) {
      reject(err);
    }
  });

/** Resolved Game Boy–tinted URL, or original path if not ready / failed. */
export const getGbSpriteUrl = (path) => processedUrlByPath.get(path) || path;

/**
 * Preprocess all editor sprites. Safe to call once at startup.
 * @returns {Promise<void>}
 */
export const preloadGbSprites = async () => {
  await Promise.all(
    GB_SPRITE_PATHS.map(async (path) => {
      try {
        const img = await loadImage(path);
        const dataUrl = await applyGameBoyPaletteToDataUrl(img);
        processedUrlByPath.set(path, dataUrl);
      } catch {
        /* Keep original URL via getGbSpriteUrl fallback */
      }
    })
  );
};
