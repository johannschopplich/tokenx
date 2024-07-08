# tokenx

GPT token count and context size utilities when approximations are good enough. For advanced use cases, please use a full tokenizer like [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer). This library is intended to be used for quick estimations and to avoid the overhead of a full tokenizer, e.g. when you want to limit your bundle size.

## Benchmarks

The following table shows the accuracy of the token count approximation for different input texts:

<!-- START GENERATED TOKEN COUNT TABLE -->
| Description | Actual GPT Token Count | Estimated Token Count | Token Count Deviation |
| --- | --- | --- | --- |
| Short English text | 10 | 11 | 10.00% |
| German text with umlauts | 56 | 49 | 12.50% |
| Metamorphosis by Franz Kafka (English) | 31891 | 33928 | 6.39% |
| Die Verwandlung by Franz Kafka (German) | 40620 | 34908 | 14.06% |
| 道德經 by Laozi (Chinese) | 14386 | 11919 | 17.15% |
| TypeScript ES5 Type Declarations (~ 4000 loc) | 47890 | 50464 | 5.37% |
<!-- END GENERATED TOKEN COUNT TABLE -->

## Features

- 🌁 Estimate token count without a full tokenizer
- 📐 Supports multiple model context sizes
- 🗣️ Supports accented characters, like German umlauts or French accents
- 🪽 Zero dependencies

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
import {
  approximateMaxTokenSize,
  approximateTokenSize,
  isWithinTokenLimit
} from 'tokenx'

const prompt = 'Your prompt goes here.'
const inputText = 'Your text goes here.'

// Estimate the number of tokens in the input text
const estimatedTokens = approximateTokenSize(inputText)
console.log(`Estimated token count: ${estimatedTokens}`)

// Calculate the maximum number of tokens allowed for a given model
const modelName = 'gpt-3.5-turbo'
const maxResponseTokens = 1000
const availableTokens = approximateMaxTokenSize({
  prompt,
  modelName,
  maxTokensInResponse: maxResponseTokens
})
console.log(`Available tokens for model ${modelName}: ${availableTokens}`)

// Check if the input text is within a specific token limit
const tokenLimit = 1024
const withinLimit = isWithinTokenLimit(inputText, tokenLimit)
console.log(`Is within token limit: ${withinLimit}`)
```

## API

### `approximateTokenSize`

Estimates the number of tokens in a given input string based on common English patterns and tokenization heuristics. Work well for other languages too, like German.

**Usage:**

```ts
const estimatedTokens = approximateTokenSize('Hello, world!')
```

**Type Declaration:**

```ts
function approximateTokenSize(input: string): number
```

### `approximateMaxTokenSize`

Calculates the maximum number of tokens that can be included in a response given the prompt length and model's maximum context size.

**Usage:**

```ts
const maxTokens = approximateMaxTokenSize({
  prompt: 'Sample prompt',
  modelName: 'text-davinci-003',
  maxTokensInResponse: 500
})
```

**Type Declaration:**

```ts
function approximateMaxTokenSize({ prompt, modelName, maxTokensInResponse }: {
  prompt: string
  modelName: ModelName
  /** The maximum number of tokens to generate in the reply. 1000 tokens are roughly 750 English words. */
  maxTokensInResponse?: number
}): number
```

### `isWithinTokenLimit`

Checks if the estimated token count of the input is within a specified token limit.

**Usage:**

```ts
const withinLimit = isWithinTokenLimit('Check this text against a limit', 100)
```

**Type Declaration:**

```ts
function isWithinTokenLimit(input: string, tokenLimit: number): boolean
```

## License

[MIT](./LICENSE) License © 2023-PRESENT [Johann Schopplich](https://github.com/johannschopplich)
