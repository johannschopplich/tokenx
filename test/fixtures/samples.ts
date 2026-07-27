import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '../..')

/** Per-sample deviation bound (%) – enforced in CI, visualized as the bench chart's axis span */
export const MAX_SAMPLE_DEVIATION = 20
/** Mean deviation bound (%) across the corpus – enforced in CI */
export const MAX_MEAN_DEVIATION = 7

export interface BenchmarkSample {
  description: string
  /** Inline text, or a repo-root-relative file to load */
  input: string | { file: string }
}

export const BENCHMARK_SAMPLES: BenchmarkSample[] = [
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
    input: { file: 'test/fixtures/ebooks/pg5200.txt' },
  },
  {
    description: 'Die Verwandlung by Franz Kafka (German)',
    input: { file: 'test/fixtures/ebooks/pg22367.txt' },
  },
  {
    description: '道德經 by Laozi (Chinese)',
    input: { file: 'test/fixtures/ebooks/pg7337.txt' },
  },
  {
    description: '羅生門 by Akutagawa Ryūnosuke (Japanese)',
    input: { file: 'test/fixtures/ebooks/pg1982.txt' },
  },
  {
    description: 'TypeScript ES5 Type Declarations (~4000 loc)',
    input: { file: 'node_modules/typescript/lib/lib.es5.d.ts' },
  },
]

export async function readSampleText(sample: BenchmarkSample): Promise<string> {
  return typeof sample.input === 'string'
    ? sample.input
    : readFile(join(rootDir, sample.input.file), 'utf-8')
}
