/** Zoom limits and scroll anchoring (SPEC §6.7). No DOM access. */

/** Largest cell size zooming in can reach. */
export const MAX_ZOOM_CELL = 64;
/** Factor per zoom button press / key. */
export const ZOOM_STEP = 1.25;

/** Highest zoom factor for a fitted cell size (never below 1). */
export const maxZoom = (fitCell: number) => Math.max(1, MAX_ZOOM_CELL / fitCell);

export const clampZoom = (zoom: number, fitCell: number) => Math.min(maxZoom(fitCell), Math.max(1, zoom));

/**
 * Scroll position that keeps the content point under `offset` (pixels from
 * the container's visible edge) in place after the content scales by `ratio`.
 */
export const anchoredScroll = (scroll: number, offset: number, ratio: number) =>
  Math.max(0, (scroll + offset) * ratio - offset);
