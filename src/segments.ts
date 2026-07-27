import type { LanguageConfig, TokenEstimationOptions } from './types.ts'

const PATTERNS = {
  whitespace: /^\s+$/,
  structuredWhitespace: /\n\s/,
  cjk: /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF\u30A0-\u30FF\u2E80-\u2EFF\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/,
  numeric: /^\d+$/,
  punctuation: /[.,!?;(){}[\]<>:/\\|@#$%^&*+=`~_"-]/,
} as const

const TOKEN_SPLIT_PATTERN = new RegExp(`(\\s+|${PATTERNS.punctuation.source}+)`)

// All ratios are calibrated against OpenAI's o200k_base encoding
const DEFAULT_CHARS_PER_TOKEN = 6
const SHORT_TOKEN_THRESHOLD = 3

const DEFAULT_LANGUAGE_CONFIGS: LanguageConfig[] = [
  { pattern: /[äöüßẞ]/i, averageCharsPerToken: 3 },
  { pattern: /[éèêëàâîïôûùüÿçœæáíóúñ]/i, averageCharsPerToken: 3 },
  { pattern: /[ąćęłńóśźżěščřžýůúďťň]/i, averageCharsPerToken: 3.5 },
  { pattern: /[\u0430-\u044F\u0451]/i, averageCharsPerToken: 3.5 },
  { pattern: /[\u03AC-\u03CE]/i, averageCharsPerToken: 2.75 },
  // Anchored to pure emoji runs – symbols like ™ are Extended_Pictographic
  // too, and an unanchored match would misprice the whole attached word
  { pattern: /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\p{Emoji_Component}]*$/u, averageCharsPerToken: 0.75 },
]

export interface SegmentEstimate {
  segment: string
  tokenCount: number
}

/**
 * Walks a text as (segment, estimated token count) pairs. The segments
 * concatenate back to the original text; whitespace segments count zero
 * tokens unless they carry structure (indentation or blank lines).
 */
export function* walkSegments(text: string, options: TokenEstimationOptions = {}): Generator<SegmentEstimate> {
  if (!text)
    return

  const resolvedOptions = resolveOptions(options)

  for (const segment of text.split(TOKEN_SPLIT_PATTERN)) {
    if (segment)
      yield { segment, tokenCount: estimateSegmentTokens(segment, resolvedOptions) }
  }
}

interface ResolvedTokenEstimationOptions {
  defaultCharsPerToken: number
  languageConfigs: LanguageConfig[]
}

function resolveOptions(options: TokenEstimationOptions): ResolvedTokenEstimationOptions {
  return {
    defaultCharsPerToken: options.defaultCharsPerToken ?? DEFAULT_CHARS_PER_TOKEN,
    languageConfigs: options.languageConfigs ?? DEFAULT_LANGUAGE_CONFIGS,
  }
}

function estimateSegmentTokens(
  segment: string,
  { languageConfigs, defaultCharsPerToken }: ResolvedTokenEstimationOptions,
): number {
  if (PATTERNS.whitespace.test(segment)) {
    // Indentation and blank lines cost a token in o200k, while line-wrap
    // newlines and single spaces merge into the neighboring word tokens
    return PATTERNS.structuredWhitespace.test(segment) ? 1 : 0
  }

  // Checked before the built-in rules so custom configs can override them
  const languageCharsPerToken = getLanguageSpecificCharsPerToken(segment, languageConfigs)
  if (languageCharsPerToken !== undefined) {
    return Math.ceil(getCharacterCount(segment) / languageCharsPerToken)
  }

  if (PATTERNS.cjk.test(segment)) {
    return getCharacterCount(segment)
  }

  if (PATTERNS.numeric.test(segment)) {
    return 1
  }

  if (segment.length <= SHORT_TOKEN_THRESHOLD) {
    return 1
  }

  if (PATTERNS.punctuation.test(segment)) {
    return Math.ceil(segment.length / 2)
  }

  return Math.ceil(segment.length / defaultCharsPerToken)
}

function getLanguageSpecificCharsPerToken(segment: string, languageConfigs: LanguageConfig[]): number | undefined {
  for (const config of languageConfigs) {
    // `search` instead of `test`: it ignores `lastIndex`, so stateful flags
    // (`/g`, `/y`) on user-supplied patterns can't skew matching
    if (segment.search(config.pattern) !== -1) {
      return config.averageCharsPerToken
    }
  }
}

function getCharacterCount(text: string): number {
  return Array.from(text).length
}
