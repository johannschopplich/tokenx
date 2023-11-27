# tokenwise

GPT token count and context size utilities when approximations are good enough.

For advanced use cases, please use a full tokenizer like [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer). This library is intended to be used for quick estimations and to avoid the overhead of a full tokenizer, e.g. when you want to limit your bundle size.

## Features

- 🌁 Estimate token count without a full tokenizer
- 📐 Supports multiple model context sizes
- 🗣️ Supports accented characters, like German umlauts or French accents
- 🪽 Zero dependencies

## Installation

Run the following command to add `tokenwise` to your project.

```bash
# npm
npm install tokenwise

# pnpm
pnpm add tokenwise

# yarn
yarn add tokenwise
```

## Usage

```ts
import {
  approximateMaxTokenSize,
  approximateTokenSize,
  isWithinTokenLimit
} from 'tokenwise'

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
