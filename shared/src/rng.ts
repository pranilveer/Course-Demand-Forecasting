const MASK64 = (1n << 64n) - 1n;
const TWO_POW_53 = 9_007_199_254_740_992;

function xmur3(str: string): () => number {
  let h = 1_779_033_703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3_432_918_353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
    h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function splitmix64(state: bigint): { state: bigint; value: bigint } {
  const nextState = (state + 0x9e3779b97f4a7c15n) & MASK64;
  let z = nextState;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  return { state: nextState, value: (z ^ (z >> 31n)) & MASK64 };
}

export class Rng {
  private state: bigint;
  private readonly baseSeed: string;

  constructor(seed: number | string, stream = 'default') {
    this.baseSeed = String(seed);
    const hash = xmur3(`${this.baseSeed}:${stream}`);
    const high = BigInt(hash());
    const low = BigInt(hash());
    this.state = ((high << 32n) | low) & MASK64;
  }

  fork(stream: string): Rng {
    return new Rng(this.baseSeed, stream);
  }

  nextU64(): bigint {
    const result = splitmix64(this.state);
    this.state = result.state;
    return result.value;
  }

  nextFloat(): number {
    return Number(this.nextU64() >> 11n) / TWO_POW_53;
  }

  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`Invalid integer range: ${min}..${max}`);
    }
    const range = BigInt(max - min + 1);
    return min + Number(this.nextU64() % range);
  }

  bool(probability = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array');
    }
    return items[this.nextInt(0, items.length - 1)] as T;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(0, i);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  sample<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    this.shuffle(copy);
    return copy.slice(0, Math.min(count, copy.length));
  }

  weighted<T>(entries: ReadonlyArray<{ value: T; weight: number }>): T {
    if (entries.length === 0) {
      throw new Error('Cannot choose from an empty weighted list');
    }
    const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (total <= 0) {
      return entries[0]!.value;
    }
    let remaining = this.nextFloat() * total;
    for (const entry of entries) {
      remaining -= Math.max(0, entry.weight);
      if (remaining <= 0) {
        return entry.value;
      }
    }
    return entries[entries.length - 1]!.value;
  }
}
