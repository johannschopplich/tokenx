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
    description: 'The Great Gatsby by Fitzgerald (en)',
    input: { files: ['test/fixtures/texts/great-gatsby-en.txt'] },
  },
  {
    description: 'Die Verwandlung by Kafka (de)',
    input: { files: ['test/fixtures/texts/die-verwandlung-de.txt'] },
  },
  {
    description: 'Ah Q Zhengzhuan by Lu Xun (zh)',
    input: { files: ['test/fixtures/texts/a-q-zheng-zhuan-zh.txt'] },
  },
  {
    description: 'Rashomon by Akutagawa (ja)',
    input: { files: ['test/fixtures/texts/rashomon-ja.txt'] },
  },
]

export async function readSampleText(sample: BenchmarkSample): Promise<string> {
  if (typeof sample.input === 'string')
    return sample.input

  const contents = await Promise.all(sample.input.files.map(file => readFile(join(rootDir, file), 'utf-8')))
  return contents.join('')
}
