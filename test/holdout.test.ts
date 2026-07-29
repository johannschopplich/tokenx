import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { describe, expect, it } from 'vitest'
import { estimateTokenCount } from '../src/index'

/**
 * Texts no ratio was ever fitted against. The benchmark corpus and the
 * heuristic buckets both feed back into the shipped ratios, so neither can
 * tell overfitting from accuracy – these can, and only for as long as nobody
 * tunes against them. Widen a ratio to make this file pass and it stops
 * measuring anything.
 */
const HOLDOUT_SAMPLES = [
  // Romance prose at document scale, which the benchmark corpus has none of.
  { description: 'Candide by Voltaire (fr)', file: 'candide-fr.txt' },
  // Everyday imperative English – a register the corpus never sees.
  { description: 'The Whitehouse Cookbook (en)', file: 'whitehouse-cookbook-en.txt' },
  // Cyrillic at document scale, where the sentence-level shortfall amortizes.
  { description: 'Library article (ru)', file: 'library-ru.txt' },
]

/** Deviation bound (%), per sample and across the holdout. */
const MAX_HOLDOUT_DEVIATION = 15

const holdoutDir = join(import.meta.dirname, 'fixtures/holdout')

async function measureDeviation(file: string): Promise<number> {
  const text = await readFile(join(holdoutDir, file), 'utf-8')
  const referenceTokenCount = encode(text).length

  return (Math.abs(referenceTokenCount - estimateTokenCount(text)) / referenceTokenCount) * 100
}

describe('accuracy against texts held out of calibration', () => {
  for (const sample of HOLDOUT_SAMPLES) {
    it(`deviates less than ${MAX_HOLDOUT_DEVIATION}% for ${sample.description}`, async () => {
      expect(await measureDeviation(sample.file)).toBeLessThan(MAX_HOLDOUT_DEVIATION)
    })
  }

  it(`deviates less than ${MAX_HOLDOUT_DEVIATION}% on average across the holdout`, async () => {
    const deviations = await Promise.all(HOLDOUT_SAMPLES.map(sample => measureDeviation(sample.file)))
    const meanDeviation = deviations.reduce((sum, deviation) => sum + deviation, 0) / deviations.length

    expect(meanDeviation).toBeLessThan(MAX_HOLDOUT_DEVIATION)
  })
})
