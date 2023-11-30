import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { encode } from 'gpt-tokenizer'
import { approximateTokenSize } from '../src/index'

const rootDir = join(fileURLToPath(new URL('../', import.meta.url)))
const readmePath = join(rootDir, 'README.md')
const tokenExamples = [
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
    input: join(rootDir, 'test/fixtures/ebooks/pg5200.txt'),
  },
  {
    description: 'Die Verwandlung by Franz Kafka (German)',
    input: join(rootDir, 'test/fixtures/ebooks/pg22367.txt'),
  },
  {
    description: '道德經 by Laozi (Chinese)',
    input: join(rootDir, 'test/fixtures/ebooks/pg7337.txt'),
  },
  {
    description: 'TypeScript ES5 Type Declarations (~ 4000 loc)',
    input: join(rootDir, 'node_modules/typescript/lib/lib.es5.d.ts'),
  },
]

let markdownTable = `
| Description | Actual GPT Token Count | Estimated Token Count | Token Count Deviation (%) |
| ----------- | ---------------------- | --------------------- | ------------------------- |
`

for (const example of tokenExamples) {
  const text = example.input.startsWith(rootDir)
    ? (await readFile(example.input, 'utf-8'))
    : example.input
  const tokenCount = encode(text).length
  const estimatedTokenCount = approximateTokenSize(text)
  const errorPercentage = ((Math.abs(tokenCount - estimatedTokenCount) / tokenCount) * 100).toFixed(2)

  markdownTable += `| ${example.description} | ${tokenCount} | ${estimatedTokenCount} | ${errorPercentage}% |\n`
}

console.log(markdownTable)

// Replace the table in the README
const readmeContent = await readFile(readmePath, 'utf-8')
const newReadmeContent = readmeContent.replace(
  /(?<=<!-- START GENERATED TOKEN COUNT TABLE -->\n)[\s\S]+(?=\n<!-- END GENERATED TOKEN COUNT TABLE -->)/,
  markdownTable.trim(),
)

await writeFile(readmePath, newReadmeContent)
