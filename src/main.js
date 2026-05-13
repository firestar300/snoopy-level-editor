import { mountEditor } from './editor/mount-editor.js';
import { preloadGbSprites } from './editor/gb-sprite-urls.js';

const app = document.getElementById('app');
if (app)
  preloadGbSprites()
    .catch(() => {})
    .finally(() => mountEditor(app));
