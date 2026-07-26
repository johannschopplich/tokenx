import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { estimateTokenCount } from '../src/index.ts'
import { BENCHMARK_SAMPLES, readSampleText } from '../test/fixtures/samples.ts'

const benchPath = path.resolve(import.meta.dirname, '../docs/bench.md')

const TABLE_HEADINGS = [
  'Description',
  'GPT Token Count',
  'Estimated Token Count',
  'Deviation',
] as const

let markdownTable = `
GPT token counts are measured with OpenAI's \`o200k_base\` encoding, the tokenizer of all current GPT models.

| ${TABLE_HEADINGS.join(' | ')} |
| ${TABLE_HEADINGS.map(() => '---').join(' | ')} |
`

const deviations: number[] = []

for (const sample of BENCHMARK_SAMPLES) {
  const text = await readSampleText(sample)
  const referenceTokenCount = encode(text).length
  const estimatedTokenCount = estimateTokenCount(text)
  const deviation = (Math.abs(referenceTokenCount - estimatedTokenCount) / referenceTokenCount) * 100
  deviations.push(deviation)

  markdownTable += `| ${[
    sample.description,
    referenceTokenCount,
    estimatedTokenCount,
    `${deviation.toFixed(2)}%`,
  ].join(' | ')} |\n`
}

const meanDeviation = deviations.reduce((sum, deviation) => sum + deviation, 0) / deviations.length
markdownTable += `\nMean deviation across all samples: **${meanDeviation.toFixed(2)}%**\n`

console.log(markdownTable)

await fsp.writeFile(benchPath, markdownTable.trimStart(), 'utf-8')
