import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { describe, expect, it } from 'vitest'
import { estimateTokenCount } from '../src/index'
import { BENCHMARK_SAMPLES, MAX_MEAN_DEVIATION, MAX_SAMPLE_DEVIATION, readSampleText } from './fixtures/samples'

async function measureDeviation(sample: (typeof BENCHMARK_SAMPLES)[number]): Promise<number> {
  const text = await readSampleText(sample)
  const referenceTokenCount = encode(text).length
  const estimatedTokenCount = estimateTokenCount(text)
  return (Math.abs(referenceTokenCount - estimatedTokenCount) / referenceTokenCount) * 100
}

describe('accuracy against the reference tokenizer', () => {
  for (const sample of BENCHMARK_SAMPLES) {
    it(`deviates less than ${MAX_SAMPLE_DEVIATION}% for ${sample.description}`, async () => {
      expect(await measureDeviation(sample)).toBeLessThan(MAX_SAMPLE_DEVIATION)
    })
  }

  it(`deviates less than ${MAX_MEAN_DEVIATION}% on average across the sample corpus`, async () => {
    const deviations = await Promise.all(BENCHMARK_SAMPLES.map(sample => measureDeviation(sample)))
    const meanDeviation = deviations.reduce((sum, deviation) => sum + deviation, 0) / deviations.length

    expect(meanDeviation).toBeLessThan(MAX_MEAN_DEVIATION)
  })
})
