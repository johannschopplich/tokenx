import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '../..')

/** Per-sample deviation bound (%) – enforced in CI, visualized as the bench chart's axis span */
export const MAX_SAMPLE_DEVIATION = 10
/** Mean deviation bound (%) across the corpus – enforced in CI */
export const MAX_MEAN_DEVIATION = 5

export interface BenchmarkSample {
  description: string
  input: { files: string[] }
}

export const BENCHMARK_SAMPLES: BenchmarkSample[] = [
  {
    description: 'Team chat transcript (en)',
    input: { files: ['test/fixtures/texts/chat-transcript-en.txt'] },
  },
  {
    description: 'Vite releases API response',
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
    description: 'Football article (ja)',
    input: { files: ['test/fixtures/texts/football-ja.txt'] },
  },
  {
    description: 'Football article (ko)',
    input: { files: ['test/fixtures/texts/football-ko.txt'] },
  },
  {
    description: 'Football article (zh)',
    input: { files: ['test/fixtures/texts/football-zh.txt'] },
  },
  {
    description: 'The Great Gatsby by Fitzgerald (en)',
    input: { files: ['test/fixtures/texts/great-gatsby-en.txt'] },
  },
  {
    description: 'Die Verwandlung by Kafka (de)',
    input: { files: ['test/fixtures/texts/die-verwandlung-de.txt'] },
  },
]

export async function readSampleText(sample: BenchmarkSample): Promise<string> {
  const contents = await Promise.all(sample.input.files.map(file => readFile(join(rootDir, file), 'utf-8')))
  return contents.join('')
}
