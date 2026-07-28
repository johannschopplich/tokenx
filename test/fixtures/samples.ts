import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '../..')

/** Per-sample deviation bound (%) – enforced in CI, visualized as the bench chart's axis span */
export const MAX_SAMPLE_DEVIATION = 50
/** Mean deviation bound (%) across the corpus – enforced in CI */
export const MAX_MEAN_DEVIATION = 20

export interface BenchmarkSample {
  description: string
  /** Inline text, or repo-root-relative files to load and concatenate */
  input: string | { files: string[] }
}

export const BENCHMARK_SAMPLES: BenchmarkSample[] = [
  {
    description: 'Emoji-heavy chat messages',
    input: 'Hey! 😀 Did you see the game last night?? 🏀🔥 Absolutely insane finish 😱😱 We should totally watch the next one together 🍕🎉 Let me know! 👍',
  },
  {
    description: 'GitHub releases API response',
    input: { files: ['test/fixtures/texts/github-releases-api.txt'] },
  },
  {
    description: 'tokenx source code',
    input: { files: ['src/index.ts', 'src/segments.ts', 'src/types.ts'] },
  },
  {
    description: 'Vite plugin API docs (en)',
    input: { files: ['test/fixtures/texts/vite-plugin-api-en.txt'] },
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
    description: 'Vite plugin API docs (ja)',
    input: { files: ['test/fixtures/texts/vite-plugin-api-ja.txt'] },
  },
  {
    description: 'Vite plugin API docs (ko)',
    input: { files: ['test/fixtures/texts/vite-plugin-api-ko.txt'] },
  },
  {
    description: 'Artificial intelligence article (zh)',
    input: { files: ['test/fixtures/texts/artificial-intelligence-zh.txt'] },
  },
]

export async function readSampleText(sample: BenchmarkSample): Promise<string> {
  if (typeof sample.input === 'string')
    return sample.input

  const contents = await Promise.all(sample.input.files.map(file => readFile(join(rootDir, file), 'utf-8')))
  return contents.join('')
}
