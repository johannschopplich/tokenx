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
tokenx source code                    3,496 →  3,341         ████│              -4.43%
Vite plugin API docs (en)             6,901 →  7,155             │████          +3.68%
Cat article (ja)                     12,437 → 11,914         ████│              -4.21%
Cat article (ko)                      7,117 →  6,815         ████│              -4.24%
Cat article (zh)                      9,057 →  8,953            █│              -1.15%
The Great Gatsby by Fitzgerald (en)   4,391 →  4,479             │██            +2.00%
Die Verwandlung by Kafka (de)         4,437 →  4,384            █│              -1.19%
                                                       ─────────────────────
                                                                        mean     3.28%
```

<!-- /automd -->

Accuracy depends on the kind of text, not its length: a short excerpt deviates about as much as the full document it came from. A holdout corpus of French, English, and Russian documents that no ratio was ever fitted against is held to a looser ±15% bound per document, so a retune that only fits the calibration texts fails the test run.

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

### Options

Every function takes an optional `options` object last:

- `defaultCharsPerToken` – average characters per token for segments no other rule prices (default: 7)
- `languageConfigs` – `{ pattern, averageCharsPerToken }` entries checked before the built-in language configs; the first matching config prices a segment. They take precedence over every built-in rule except whitespace, the CJK script rates included, and the built-in configs still price whatever no custom config matches.

### `estimateTokenCount(text, options?)`

Returns the estimated token count of `text`.

```ts
estimateTokenCount('Hello, world!')

estimateTokenCount('Bonjour le monde!', {
  defaultCharsPerToken: 4,
  languageConfigs: [{ pattern: /[éèêëàâîï]/i, averageCharsPerToken: 3 }],
})
```

### `isWithinTokenLimit(text, tokenLimit, options?)`

Returns whether the estimated token count stays within `tokenLimit`, the limit included. Stops counting as soon as the limit is exceeded.

```ts
isWithinTokenLimit('Check this text against a limit', 100) // true
```

### `sliceByTokens(text, start?, end?, options?)`

Extracts a token range like `Array.prototype.slice()`: `start` is inclusive, `end` exclusive, and negative indices count back from the end. A boundary inside a multi-token word cuts the word proportionally, so a slice can start or end mid-word – adjacent slices still rejoin into the original text.

```ts
const text = 'Hello, world! This is a test sentence.'

sliceByTokens(text, 0, 3) // First three tokens
sliceByTokens(text, -2) // Last two tokens
sliceByTokens(text, 1, -1) // All but the first and last token
```

### `splitByTokens(text, tokensPerChunk, options?)`

Splits text into chunks of about `tokensPerChunk` tokens – for RAG, batch processing, or staying within a context window.

`tokensPerChunk` is a target, not a hard maximum: a chunk closes once it reaches the target, so a single long segment can push a chunk beyond it. Chunks never break words apart. Chinese and Japanese text has no spaces, so a whole clause up to its punctuation mark forms one segment, and a long clause can push a chunk well past the target.

The `overlap` option (default: 0, clamped below `tokensPerChunk`) repeats the trailing tokens of each chunk at the start of the next; a final chunk consisting only of overlap content is never emitted.

```ts
splitByTokens(text, 100)
splitByTokens(text, 100, { overlap: 10 })
```

## License

[MIT](./LICENSE) License © 2023-PRESENT [Johann Schopplich](https://github.com/johannschopplich)
