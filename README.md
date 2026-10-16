# tokenx

Fast and lightweight token count estimation without requiring a full tokenizer.

Estimates are calibrated against OpenAI's `o200k_base` encoding – the tokenizer of all current GPT models. Counts for other LLM families will differ somewhat; the `defaultCharsPerToken` and `languageConfigs` options let you tune the heuristics for your model. For precise counts, use a full tokenizer like [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer).

## Features

- 🎯 **95%+ average accuracy**, and no single sample below 90%
- 📦 **Just 2kB** bundle size with zero dependencies
- 🖥️ **[Bundled CLI](#cli)** – count, slice and split from the shell
- 🌍 Built-in rules for CJK, Cyrillic, Greek, accented Latin scripts and emoji – extend them with your own

## Accuracy

The following chart shows how close the estimates come to actual GPT token counts for different input texts:

<!-- automd:file src="./docs/bench.md" -->

Bars grow left when tokenx underestimates and right when it overestimates. The axis spans the ±10% per-sample deviation bound.

```
                                                          under ◂·▸ over
Team chat transcript (en)               293 →    285          ███│              -2.73%
Vite releases API response            8,075 →  8,551             │██████        +5.89%
tokenx source code                    3,470 →  3,315         ████│              -4.47%
Vite plugin API docs (en)             6,901 →  7,155             │████          +3.68%
Cat article (ja)                     12,437 → 11,914         ████│              -4.21%
Cat article (ko)                      7,117 →  6,815         ████│              -4.24%
Cat article (zh)                      9,057 →  8,953            █│              -1.15%
The Great Gatsby by Fitzgerald (en)   4,391 →  4,479             │██            +2.00%
Die Verwandlung by Kafka (de)         4,437 →  4,384            █│              -1.19%
                                                       ─────────────────────
                                                                        mean     3.29%
```

<!-- /automd -->

Accuracy depends on the kind of text, not its length: a short excerpt deviates about as much as the full document it came from. A holdout corpus of French, English, and Russian text that no ratio was ever fitted against is held to a looser ±15% bound, so a retune cannot silently overfit the chart for those languages.

These cases are knowingly left outside the bounds:

- **High-entropy strings** – base64, hashes, digests: ≈-70%. Pricing them would cost every caller runtime for a case ordinary traffic rarely carries.
- **Traditional and classical Chinese** – the hanzi rate is calibrated on contemporary simplified script: ≈-5% to -20%.
- **Scripts without a built-in rule** – Arabic ≈-35%, Hindi ≈-30%, Hebrew ≈-45%, Thai ≈-60%; a custom language config closes the gap.
- **Chinese or Japanese mixed with Latin words or code** – Latin letters that share a segment with CJK text are priced like hanzi: ≈+30% to +80% for technical prose, up to ≈+200% for a sentence built around code identifiers.

## Installation

```bash
# npm
npm install tokenx

# pnpm
pnpm add tokenx

# yarn
yarn add tokenx
```

## Quick Start

```ts
import { estimateTokenCount, isWithinTokenLimit, sliceByTokens, splitByTokens } from 'tokenx'

const text = 'Your text goes here.'

estimateTokenCount(text) // Estimated token count
isWithinTokenLimit(text, 1024) // true
sliceByTokens(text, 0, 5) // Roughly the first five tokens
splitByTokens(text, 100) // Chunks of about 100 tokens each
```

## CLI

The package ships a `tokenx` binary. Run it with `npx tokenx`, or install the package to call `tokenx` directly. The CLI requires Node.js 24 or later.

```bash
# Count tokens in a file, a pipe, or several files at once
tokenx README.md
cat article.md | tokenx
tokenx count src/*.ts

# Fail a script when a prompt outgrows its budget (exit code 2)
tokenx prompt.txt --limit 8000

# Extract a token range, or chunk a document for RAG
tokenx slice article.md --end 500
tokenx split article.md --size 500 --overlap 50
```

Only results go to stdout – a bare integer for one input, a table for several, chunks as a JSON array – so `$(tokenx count file.txt)` and `| jq` work unchanged. Notices and errors go to stderr. Run `tokenx --help` for every option.

## API

### `estimateTokenCount`

Estimates the number of tokens in a given input string using heuristic rules that work across multiple languages and text types.

Custom `languageConfigs` take precedence over the built-in rules for every segment except whitespace, so they can also override the built-in CJK handling. The built-in configs still apply to text no custom config matches.

**Usage:**

```ts
const estimatedTokens = estimateTokenCount('Hello, world!')

// With custom options
const customEstimate = estimateTokenCount('Bonjour le monde!', {
  defaultCharsPerToken: 4,
  languageConfigs: [
    { pattern: /[éèêëàâîï]/i, averageCharsPerToken: 3 }
  ]
})
```

**Type Declaration:**

```ts
function estimateTokenCount(
  text?: string,
  options?: TokenEstimationOptions
): number

interface TokenEstimationOptions {
  /** Average characters per token for segments no other rule prices (default: 7). */
  defaultCharsPerToken?: number
  /** Language configs checked before the built-in ones, so the first matching custom config wins. */
  languageConfigs?: LanguageConfig[]
}

interface LanguageConfig {
  /** Regular expression to detect the language. */
  pattern: RegExp
  averageCharsPerToken: number
}
```

### `isWithinTokenLimit`

Checks if the estimated token count of the input is within a specified token limit.

**Usage:**

```ts
const withinLimit = isWithinTokenLimit('Check this text against a limit', 100)
// With custom options
const customCheck = isWithinTokenLimit('Text', 50, { defaultCharsPerToken: 3 })
```

**Type Declaration:**

```ts
function isWithinTokenLimit(
  text: string,
  tokenLimit: number,
  options?: TokenEstimationOptions
): boolean
```

### `sliceByTokens`

Extracts a portion of text based on token positions, similar to `Array.prototype.slice()`. Supports both positive and negative indices.

**Usage:**

```ts
const text = 'Hello, world! This is a test sentence.'

const firstThree = sliceByTokens(text, 0, 3)
const fromSecond = sliceByTokens(text, 2)
const lastTwo = sliceByTokens(text, -2)
const middle = sliceByTokens(text, 1, -1)
```

**Type Declaration:**

```ts
function sliceByTokens(
  text: string,
  start?: number,
  end?: number,
  options?: TokenEstimationOptions
): string
```

**Parameters:**

- `text` - The input text to slice
- `start` - The start token index (inclusive). If negative, treated as offset from end. Default: `0`
- `end` - The end token index (exclusive). If negative, treated as offset from end. If omitted, slices to the end
- `options` - Token estimation options (same as `estimateTokenCount`)

**Returns:**

The sliced text portion corresponding to the specified token range. A boundary inside a multi-token word cuts the word proportionally, so a slice can start or end mid-word – adjacent slices still rejoin into the original text.

### `splitByTokens`

Splits text into chunks based on token count. Useful for chunking documents for RAG, batch processing, or staying within context windows.

`tokensPerChunk` is a target, not a hard maximum: a chunk closes once it reaches the target, so a single long segment can push a chunk beyond it. Chunks never break words apart. Chinese and Japanese text has no spaces, so a whole clause up to its punctuation mark forms one segment, and a long clause can push a chunk well past the target.

**Usage:**

```ts
const text = 'Long text that needs to be split into smaller chunks...'

// Basic splitting
const chunks = splitByTokens(text, 100)
console.log(`Split into ${chunks.length} chunks`)

// With overlap for semantic continuity
const overlappedChunks = splitByTokens(text, 100, { overlap: 10 })

// With custom options
const customChunks = splitByTokens(text, 50, {
  defaultCharsPerToken: 4,
  overlap: 5
})
```

**Type Declaration:**

```ts
interface SplitByTokensOptions extends TokenEstimationOptions {
  /** Number of tokens to overlap between consecutive chunks (default: 0, clamped below `tokensPerChunk`). */
  overlap?: number
}

function splitByTokens(
  text: string,
  tokensPerChunk: number,
  options?: SplitByTokensOptions
): string[]
```

**Parameters:**

- `text` - The input text to split
- `tokensPerChunk` - Target number of tokens per chunk
- `options` - Token estimation options with optional overlap

**Returns:**

An array of text chunks, each containing approximately `tokensPerChunk` tokens. With `overlap`, each chunk repeats the trailing tokens of the previous one; a final chunk consisting only of overlap content is never emitted.

## License

[MIT](./LICENSE) License © 2023-PRESENT [Johann Schopplich](https://github.com/johannschopplich)
