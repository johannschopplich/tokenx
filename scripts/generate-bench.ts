import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { estimateTokenCount } from '../src/index.ts'

const rootDir = fileURLToPath(new URL('../', import.meta.url))
const benchPath = path.join(rootDir, 'docs/bench.md')

const BENCHMARK_EXAMPLES = [
  {
    description: 'Short English text',
    input: 'In the heart of the forest, a stream flowed gently over the smooth rocks and fallen leaves.',
  },
  {
    description: 'German text with umlauts',
    input: 'Die pünktlich gewünschte Trüffelfüllung im übergestülpten Würzkümmel-Würfel ist kümmerlich und dürfte fürderhin zu Rüffeln in Hülle und Fülle führen',
  },
  {
    description: 'Russian text (Cyrillic)',
    input: 'В глубине леса ручей тихо струился по гладким камням и опавшим листьям, отражая последние лучи заходящего солнца.',
  },
  {
    description: 'Greek text',
    input: 'Στην καρδιά του δάσους, ένα ρυάκι κυλούσε απαλά πάνω από τις λείες πέτρες και τα πεσμένα φύλλα.',
  },
  {
    description: 'Emoji-heavy chat messages',
    input: 'Hey! 😀 Did you see the game last night?? 🏀🔥 Absolutely insane finish 😱😱 We should totally watch the next one together 🍕🎉 Let me know! 👍',
  },
  {
    description: 'JSON payload',
    input: JSON.stringify({
      id: 'usr_29f84h',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      roles: ['admin', 'editor'],
      settings: { theme: 'dark', notifications: true, pageSize: 25 },
      lastLogin: '2026-07-01T09:30:00Z',
    }, undefined, 2),
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
    description: '羅生門 by Akutagawa Ryūnosuke (Japanese)',
    input: path.join(rootDir, 'test/fixtures/ebooks/pg1982.txt'),
  },
  {
    description: 'TypeScript ES5 Type Declarations (~4000 loc)',
    input: path.join(rootDir, 'node_modules/typescript/lib/lib.es5.d.ts'),
  },
] as const

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

for (const example of BENCHMARK_EXAMPLES) {
  const text = example.input.startsWith(rootDir)
    ? (await fsp.readFile(example.input, 'utf-8'))
    : example.input
  const referenceTokenCount = encode(text).length
  const estimatedTokenCount = estimateTokenCount(text)
  const deviation = (Math.abs(referenceTokenCount - estimatedTokenCount) / referenceTokenCount) * 100
  deviations.push(deviation)

  markdownTable += `| ${[
    example.description,
    referenceTokenCount,
    estimatedTokenCount,
    `${deviation.toFixed(2)}%`,
  ].join(' | ')} |\n`
}

const meanDeviation = deviations.reduce((sum, deviation) => sum + deviation, 0) / deviations.length
markdownTable += `\nMean deviation across all samples: **${meanDeviation.toFixed(2)}%**\n`

console.log(markdownTable)

await fsp.writeFile(benchPath, markdownTable.trimStart(), 'utf-8')
