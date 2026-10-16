import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { describe, expect, it } from 'vitest'
import { estimateTokenCount } from '../src/index'

/**
 * Texts no ratio was ever fitted against. The sample corpus and the
 * heuristic buckets both feed back into the shipped ratios, so neither can
 * tell overfitting from accuracy – these can, and only for as long as nobody
 * tunes against them. Widen a ratio to make this file pass and it stops
 * measuring anything.
 */
const HOLDOUT_SAMPLES = [
  // Romance prose at document scale, which the sample corpus has none of.
  { description: 'Candide by Voltaire (fr)', file: 'candide-fr.txt' },
  // Everyday imperative English – a register the corpus never sees.
  { description: 'The Whitehouse Cookbook (en)', file: 'whitehouse-cookbook-en.txt' },
  // Cyrillic at document scale, where the sentence-level shortfall amortizes.
  { description: 'Library article (ru)', file: 'library-ru.txt' },
]

/** Deviation bound (%) for each text. */
const MAX_HOLDOUT_DEVIATION = 15

describe('accuracy against texts held out of calibration', () => {
  it(`deviates less than ${MAX_HOLDOUT_DEVIATION}% for each text`, async () => {
    const deviations = Object.fromEntries(await Promise.all(
      HOLDOUT_SAMPLES.map(async sample => [sample.description, await measureDeviation(sample.file)] as const),
    ))

    expect(Object.values(deviations).filter(deviation => Math.abs(deviation) >= MAX_HOLDOUT_DEVIATION)).toEqual([])
    // A retune that moves the holdout shows up in the same diff, even within the bound.
    expect(deviations).toMatchInlineSnapshot(`
      {
        "Candide by Voltaire (fr)": -8.8,
        "Library article (ru)": -10.5,
        "The Whitehouse Cookbook (en)": -1.8,
      }
    `)
  })
})

const holdoutDir = join(import.meta.dirname, 'fixtures/holdout')

async function measureDeviation(file: string): Promise<number> {
  const text = await readFile(join(holdoutDir, file), 'utf-8')
  const referenceTokenCount = encode(text).length

  const deviation = ((estimateTokenCount(text) - referenceTokenCount) / referenceTokenCount) * 100
  return Math.round(deviation * 10) / 10
}
