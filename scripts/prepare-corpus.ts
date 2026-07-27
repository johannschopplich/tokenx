import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

const textsDir = path.resolve(import.meta.dirname, '../test/fixtures/texts')

interface CorpusText {
  file: string
  url: string
  /** Fixture content starts at this marker in the cleaned download */
  startMarker: string
  /** Cut at the last paragraph boundary below this length */
  maxLength?: number
  hasWikiMarkup?: boolean
  /** Source is rendered HTML (Wikisource REST API), not plain text */
  isRenderedHtml?: boolean
}

// All sources are public domain; Gutenberg texts are trimmed to the story
// itself so the fixtures measure the language they are labeled with
const CORPUS_TEXTS: CorpusText[] = [
  {
    file: 'great-gatsby-en.txt',
    url: 'https://www.gutenberg.org/cache/epub/64317/pg64317.txt',
    startMarker: 'In my younger and more vulnerable years',
    maxLength: 20_000,
  },
  {
    file: 'die-verwandlung-de.txt',
    url: 'https://www.gutenberg.org/cache/epub/22367/pg22367.txt',
    startMarker: 'Als Gregor Samsa eines Morgens',
    maxLength: 20_000,
  },
  {
    file: 'dama-s-sobachkoy-ru.txt',
    url: 'https://ru.wikisource.org/w/index.php?action=raw&title=%D0%94%D0%B0%D0%BC%D0%B0%20%D1%81%20%D1%81%D0%BE%D0%B1%D0%B0%D1%87%D0%BA%D0%BE%D0%B9%20(%D0%A7%D0%B5%D1%85%D0%BE%D0%B2)',
    startMarker: 'Говорили, что на набережной',
    maxLength: 20_000,
    hasWikiMarkup: true,
  },
  {
    // Rendered via the REST API because the wiki page only transcludes
    // scanned PDF pages
    file: 'a-q-zheng-zhuan-zh.txt',
    url: 'https://zh.wikisource.org/api/rest_v1/page/html/%E9%98%BFQ%E6%AD%A3%E5%82%B3',
    startMarker: '第一章',
    maxLength: 8_000,
    isRenderedHtml: true,
  },
  {
    file: 'rashomon-ja.txt',
    url: 'https://www.gutenberg.org/cache/epub/1982/pg1982.txt',
    startMarker: '羅生門\n\n芥川龍之介',
  },
]

await fsp.mkdir(textsDir, { recursive: true })

for (const corpusText of CORPUS_TEXTS) {
  const response = await fetch(corpusText.url)
  if (!response.ok)
    throw new Error(`Download failed for ${corpusText.url}: ${response.status}`)

  let text = (await response.text()).replaceAll('\r\n', '\n')

  if (corpusText.hasWikiMarkup)
    text = stripWikiMarkup(text)

  if (corpusText.isRenderedHtml)
    text = stripRenderedHtml(text)

  const endMarkerIndex = text.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i)
  if (endMarkerIndex !== -1)
    text = text.slice(0, endMarkerIndex)

  const startIndex = text.indexOf(corpusText.startMarker)
  if (startIndex === -1)
    throw new Error(`Start marker not found in ${corpusText.url}`)
  text = text.slice(startIndex)

  if (corpusText.maxLength !== undefined && text.length > corpusText.maxLength)
    text = text.slice(0, text.lastIndexOf('\n\n', corpusText.maxLength))

  text = `${text.trim()}\n`
  await fsp.writeFile(path.join(textsDir, corpusText.file), text, 'utf-8')
  console.log(`${corpusText.file}: ${text.length.toLocaleString('en-US')} chars`)
}

function stripRenderedHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    // Zero-width characters from the proofread page layer
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

function stripWikiMarkup(text: string): string {
  // Innermost templates first so nested {{...}} blocks unwrap over the passes
  for (let pass = 0; pass < 10; pass++) {
    text = text.replace(/\{\{[^{}]*\}\}/g, '')
  }

  return text
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/g, ' ')
}
