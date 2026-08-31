/** Small deterministic PRNG for reproducible synthetic values. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function pickFrom<T>(values: readonly T[], random: () => number): T {
  const index = Math.floor(random() * values.length);
  return values[index]!;
}

export function amountInRange(
  random: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(random() * (max - min + 1));
}
