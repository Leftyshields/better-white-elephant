/**
 * Compile-time UX preview flag. Set by Vite `define` in ux-preview mode only.
 * Production builds replace this with a literal `false`, so preview branches are dead-code eliminated.
 */
/* global __UX_PREVIEW__ */
export const UX_PREVIEW_ENABLED =
  typeof __UX_PREVIEW__ !== 'undefined' ? __UX_PREVIEW__ : false;
