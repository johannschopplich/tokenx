# tokenx

Fast and lightweight token count estimation without requiring a full tokenizer.

Estimates are calibrated against OpenAI's `o200k_base` encoding – the tokenizer of all current GPT models. Counts for other LLM families will differ somewhat; the `defaultCharsPerToken` and `languageConfigs` options let you tune the heuristics for your model. For precise counts, use a full tokenizer like [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer).

## Features

- ⚡ **~95% average accuracy** compared to GPT token counts
- 📦 **Just 2kB** bundle size with zero dependencies
- 🌍 Multi-language support with configurable language rules
- 🗣️ Built-in rules for accented scripts (German, French, Spanish, Slavic), Cyrillic, and Greek
- 🀄 CJK (Chinese, Japanese, Korean) character handling
- 😀 Emoji-aware pricing (emoji cost more tokens than their character count suggests)
- 🔧 Configurable and extensible

## Benchmarks

The following chart shows how close the estimates come to actual GPT token counts for different input texts:

<!-- automd:file src="./docs/bench.md" -->

Bars grow left when tokenx underestimates and right when it overestimates; the axis spans the ±10% per-sample deviation bound enforced in CI.

```
                                                           under ◂·▸ over
Emoji-heavy chat messages                 39 →     40             │███           +2.56%
GitHub releases API response          10,805 → 11,684             │████████      +8.14%
tokenx source code                     2,970 →  2,870          ███│              -3.37%
Vite plugin API docs (en)              6,901 →  7,291             │██████        +5.65%
The Great Gatsby by Fitzgerald (en)    4,391 →  4,628             │█████         +5.40%
Die Verwandlung by Kafka (de)          4,437 →  4,452             │              +0.34%
Vite plugin API docs (ja)              9,240 →  9,138            █│              -1.10%
Vite plugin API docs (ko)              8,224 →  8,676             │█████         +5.50%
Artificial intelligence article (zh)  10,043 → 10,010             │              -0.33%
                                                        ─────────────────────
                                                                         mean     3.60%
```

<!-- /automd -->

Deviation tracks vocabulary rather than length: a 300-character excerpt deviates about as much as the whole book it came from, while contemporary business prose of the same length runs roughly three times higher. Read the figures above as a range across registers, not a bound on any single input.

## Installation

```bash
# npm
npm install tokenx

# pnpm
pnpm add tokenx

# yarn
yarn add tokenx
```

## Usage

```ts
import { estimateTokenCount, isWithinTokenLimit, sliceByTokens, splitByTokens } from 'tokenx'

const text = 'Your text goes here.'

// Estimate the number of tokens in the text
const estimatedTokens = estimateTokenCount(text)
console.log(`Estimated token count: ${estimatedTokens}`)

// Check if text is within a specific token limit
const tokenLimit = 1024
const withinLimit = isWithinTokenLimit(text, tokenLimit)
console.log(`Is within token limit: ${withinLimit}`)

// Slice text by token positions (like Array.slice)
const firstTokens = sliceByTokens(text, 0, 5)
console.log(`First ~5 tokens: ${firstTokens}`)

// Split text into token-based chunks
const chunks = splitByTokens(text, 100)
console.log(`Split into ${chunks.length} chunks`)

// Use custom options for different languages or models.
// Custom language rules are checked before all built-in heuristics,
// so they can also override the built-in CJK handling.
const customOptions = {
  defaultCharsPerToken: 4, // More conservative estimation
  languageConfigs: [
    { pattern: /[\u4E00-\u9FFF]/, averageCharsPerToken: 1.5 }, // Custom Chinese rule
  ]
}

const customEstimate = estimateTokenCount(text, customOptions)
console.log(`Custom estimate: ${customEstimate}`)
```

## API

### `estimateTokenCount`

Estimates the number of tokens in a given input string using heuristic rules that work across multiple languages and text types.

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
  /** Default average characters per token when no language-specific rule applies (default: 6) */
  defaultCharsPerToken?: number
  /** Custom language configurations to override defaults */
  languageConfigs?: LanguageConfig[]
}

interface LanguageConfig {
  /** Regular expression to detect the language */
  pattern: RegExp
  /** Average number of characters per token for this language */
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

// With custom options
const customSlice = sliceByTokens(text, 0, 5, {
  defaultCharsPerToken: 4,
  languageConfigs: [
    { pattern: /[éèêëàâîï]/i, averageCharsPerToken: 3 }
  ]
})
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

The sliced text portion corresponding to the specified token range.

### `splitByTokens`

Splits text into chunks based on token count. Useful for chunking documents for RAG, batch processing, or staying within context windows.

`tokensPerChunk` is a target, not a hard maximum: a chunk closes once it reaches the target, so a single long segment can push a chunk slightly beyond it. Chunks never break words apart.

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
  /** Number of tokens to overlap between consecutive chunks (default: 0, clamped below `tokensPerChunk`) */
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
