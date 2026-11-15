import { createTikTokEnhancer } from './enhanced.ts';

if (window.top === window) {
  createTikTokEnhancer().init();
}
