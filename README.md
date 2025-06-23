# tokenx

[![npm version](https://img.shields.io/npm/v/tokenx)](https://www.npmjs.com/package/tokenx)

Fast and lightweight token count estimation for any LLM without requiring a full tokenizer. This library provides quick approximations that are good enough for most use cases while keeping your bundle size minimal.

For advanced use cases requiring precise token counts, please use a full tokenizer like [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer).

## Benchmarks

The following table shows the accuracy of the token count approximation for different input texts:

<!-- START GENERATED TOKEN COUNT TABLE -->
| Description | Actual GPT Token Count | Estimated Token Count | Token Count Deviation |
| --- | --- | --- | --- |
| Short English text | 10 | 11 | 10.00% |
| German text with umlauts | 56 | 49 | 12.50% |
| Metamorphosis by Franz Kafka (English) | 31892 | 35705 | 11.96% |
| Die Verwandlung by Franz Kafka (German) | 40621 | 35069 | 13.67% |
| 道德經 by Laozi (Chinese) | 14387 | 12059 | 16.18% |
| TypeScript ES5 Type Declarations (~ 4000 loc) | 48553 | 52434 | 7.99% |
<!-- END GENERATED TOKEN COUNT TABLE -->

## Features

- ⚡ Fast token estimation without a full tokenizer
- 🌍 Multi-language support with configurable language rules
- 🗣️ Built-in support for accented characters (German, French, Spanish, etc.)
- 🔧 Configurable and extensible
- 🪽 Zero dependencies
- 📦 Tiny bundle size

## Installation

Run the following command to add `tokenx` to your project.

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
import { estimateTokenCount, isWithinTokenLimit } from 'tokenx'

const text = 'Your text goes here.'

// Estimate the number of tokens in the text
const estimatedTokens = estimateTokenCount(text)
console.log(`Estimated token count: ${estimatedTokens}`)

// Check if text is within a specific token limit
const tokenLimit = 1024
const withinLimit = isWithinTokenLimit(text, tokenLimit)
console.log(`Is within token limit: ${withinLimit}`)

// Use custom options for different languages or models
const customOptions = {
  defaultCharsPerToken: 4, // More conservative estimation
  languageConfigs: [
    { pattern: /[你我他]/g, averageCharsPerToken: 1.5 }, // Custom Chinese rule
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
  /** Default average characters per token when no language-specific rule applies */
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

## License

[MIT](./LICENSE) License © 2023-PRESENT [Johann Schopplich](https://github.com/johannschopplich)
