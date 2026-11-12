/** Which terrain mesh chunks to keep around the raft. Pure bookkeeping, no Three.js.
 *
 * The 1024-station file chunks are sub-divided into mesh chunks of `meshStations` stations (plus one shared boundary
 * row), so only a window ahead of and behind the raft exists as meshes. Mesh chunk k covers stations
 * [k * meshStations, (k + 1) * meshStations].
 */
export interface ChunkWindowConfig {
  meshStations: number;
  /** Metres per station. */
  resolutionM: number;
  aheadM: number;
  behindM: number;
  /** Highest station that may be meshed (inclusive): the stations actually loaded. */
  maxStation: number;
}

/** Mesh chunk indices to keep for raft distance `s`, ascending. */
export function wantedChunks(s: number, c: ChunkWindowConfig): number[] {
  const first = Math.max(0, Math.floor((s - c.behindM) / c.resolutionM / c.meshStations));
  const lastStation = Math.min(c.maxStation, Math.ceil((s + c.aheadM) / c.resolutionM));
  // A chunk needs its rows plus one neighbour row (for slopes), all within the loaded stations.
  const last = Math.min(Math.floor(lastStation / c.meshStations), Math.floor((c.maxStation - 1) / c.meshStations) - 1);
  const out: number[] = [];
  for (let k = first; k <= last; k++) out.push(k);
  return out;
}

/** Owns the set of live chunk resources; builds missing ones and disposes the ones that left the window. */
export class ChunkManager<T> {
  private readonly live = new Map<number, T>();

  constructor(
    private readonly config: ChunkWindowConfig,
    private readonly build: (index: number) => T,
    private readonly dispose: (index: number, item: T) => void,
  ) {}

  get count(): number {
    return this.live.size;
  }

  get indices(): number[] {
    return [...this.live.keys()].sort((a, b) => a - b);
  }

  update(s: number): void {
    const want = new Set(wantedChunks(s, this.config));
    for (const [k, item] of this.live) {
      if (!want.has(k)) {
        this.dispose(k, item);
        this.live.delete(k);
      }
    }
    for (const k of want) if (!this.live.has(k)) this.live.set(k, this.build(k));
  }

  clear(): void {
    for (const [k, item] of this.live) this.dispose(k, item);
    this.live.clear();
  }
}
