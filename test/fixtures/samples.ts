import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '../..')

/** Per-sample deviation bound (%) – enforced in CI, visualized as the bench chart's axis span */
export const MAX_SAMPLE_DEVIATION = 20
/** Mean deviation bound (%) across the corpus – enforced in CI */
export const MAX_MEAN_DEVIATION = 7

export interface BenchmarkSample {
  description: string
  /** Inline text, or repo-root-relative files to load and concatenate */
  input: string | { files: string[] }
}

const JSON_PAYLOAD = {
  id: 'usr_29f84h',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  roles: ['admin', 'editor'],
  settings: { theme: 'dark', notifications: true, pageSize: 25 },
  lastLogin: '2026-07-01T09:30:00Z',
}

export const BENCHMARK_SAMPLES: BenchmarkSample[] = [
  {
    description: 'Emoji-heavy chat messages',
    input: 'Hey! 😀 Did you see the game last night?? 🏀🔥 Absolutely insane finish 😱😱 We should totally watch the next one together 🍕🎉 Let me know! 👍',
  },
  {
    description: 'JSON payload (formatted)',
    input: JSON.stringify(JSON_PAYLOAD, undefined, 2),
  },
  {
    description: 'JSON payload (minified)',
    input: JSON.stringify(JSON_PAYLOAD),
  },
  {
    description: 'tokenx source code',
    input: { files: ['src/index.ts', 'src/segments.ts', 'src/types.ts'] },
  },
  {
    description: 'Cyrillic text (ru)',
    input: 'В глубине леса ручей тихо струился по гладким камням и опавшим листьям, отражая последние лучи заходящего солнца.',
  },
  {
    description: 'Greek text (el)',
    input: 'Στην καρδιά του δάσους, ένα ρυάκι κυλούσε απαλά πάνω από τις λείες πέτρες και τα πεσμένα φύλλα.',
  },
  {
    description: 'Metamorphosis by Franz Kafka (en)',
    input: { files: ['test/fixtures/ebooks/pg5200.txt'] },
  },
  {
    description: 'Die Verwandlung by Franz Kafka (de)',
    input: { files: ['test/fixtures/ebooks/pg22367.txt'] },
  },
  {
    description: '道德經 by Laozi (zh)',
    input: { files: ['test/fixtures/ebooks/pg7337.txt'] },
  },
  {
    description: '羅生門 by Akutagawa Ryūnosuke (ja)',
    input: { files: ['test/fixtures/ebooks/pg1982.txt'] },
  },
]

export async function readSampleText(sample: BenchmarkSample): Promise<string> {
  if (typeof sample.input === 'string')
    return sample.input

  const contents = await Promise.all(sample.input.files.map(file => readFile(join(rootDir, file), 'utf-8')))
  return contents.join('')
}
