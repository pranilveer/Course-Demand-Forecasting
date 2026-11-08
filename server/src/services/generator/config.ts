import { AS_OF, SCALES, type ScaleName } from '@yottaflex/shared';
import type { GeneratorConfig } from './types.js';

export function makeGeneratorConfig(
  scale: ScaleName,
  seed: number,
  asOf = AS_OF,
): GeneratorConfig {
  return {
    scale,
    seed,
    asOf,
    ...SCALES[scale],
  };
}
