import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode } from 'gpt-tokenizer'
import { estimateTokenCount } from '../src/index'

const rootDir = fileURLToPath(new URL('../', import.meta.url))
const benchPath = path.join(rootDir, 'docs/bench.md')

const BENCHMARK_EXAMPLES = [
  {
    description: 'Short English text',
    input: 'Hello, world! This is a short sentence.',
  },
  {
    description: 'German text with umlauts',
    input: 'Die pünktlich gewünschte Trüffelfüllung im übergestülpten Würzkümmel-Würfel ist kümmerlich und dürfte fürderhin zu Rüffeln in Hülle und Fülle führen',
  },
  {
    description: 'Metamorphosis by Franz Kafka (English)',
    input: path.join(rootDir, 'test/fixtures/ebooks/pg5200.txt'),
  },
  {
    description: 'Die Verwandlung by Franz Kafka (German)',
    input: path.join(rootDir, 'test/fixtures/ebooks/pg22367.txt'),
  },
  {
    description: '道德經 by Laozi (Chinese)',
    input: path.join(rootDir, 'test/fixtures/ebooks/pg7337.txt'),
  },
  {
    description: 'TypeScript ES5 Type Declarations (~ 4000 loc)',
    input: path.join(rootDir, 'node_modules/typescript/lib/lib.es5.d.ts'),
  },
] as const

const TABLE_HEADINGS = [
  'Description',
  'Actual GPT Token Count',
  'Estimated Token Count',
  'Token Count Deviation',
] as const

let markdownTable = `
| ${TABLE_HEADINGS.join(' | ')} |
| ${TABLE_HEADINGS.map(() => '---').join(' | ')} |
`

for (const example of BENCHMARK_EXAMPLES) {
  const text = example.input.startsWith(rootDir)
    ? (await fsp.readFile(example.input, 'utf-8'))
    : example.input
  const tokenCount = encode(text).length
  const estimatedTokenCount = estimateTokenCount(text)
  const errorPercentage = ((Math.abs(tokenCount - estimatedTokenCount) / tokenCount) * 100).toFixed(2)

  markdownTable += `| ${[
    example.description,
    `${tokenCount}`,
    estimatedTokenCount,
    `${errorPercentage}%`,
  ].join(' | ')} |\n`
}

console.log(markdownTable)

// Write the table to bench.md
await fsp.writeFile(benchPath, markdownTable.trim())
