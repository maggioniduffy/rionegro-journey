/** Aspect ratio of the window, safe against a zero-height viewport. */
export function computeAspect(width: number, height: number): number {
  return height > 0 ? width / height : 1;
}

/** Cap the device pixel ratio so phones and hi-dpi screens keep 60 fps. */
export function clampPixelRatio(ratio: number, max = 2): number {
  return Math.min(Math.max(ratio, 1), max);
}
