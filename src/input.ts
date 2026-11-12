/** Keyboard (A/D, arrows) and touch (hold left or right half of the screen) steering input. */

/** Steering axis in [-1, 1]: +1 steers left of the flow (d > 0), -1 right. */
export class SteerInput {
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, number>();

  constructor(
    target: HTMLElement,
    onRestart: () => void,
  ) {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'r') onRestart();
      if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
    });
    target.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, e.clientX < innerWidth / 2 ? 1 : -1);
      target.setPointerCapture?.(e.pointerId);
    });
    const release = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
  }

  get axis(): number {
    let a = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) a += 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) a -= 1;
    for (const v of this.pointers.values()) a += v;
    return Math.max(-1, Math.min(1, a));
  }
}
