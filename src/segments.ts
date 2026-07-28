import type { LanguageConfig, TokenEstimationOptions } from './types.ts'

const PATTERNS = {
  whitespace: /^\s+$/,
  structuredWhitespace: /\n\s/,
  nonAscii: /[\u0080-\uFFFF]/,
  cjk: /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u30FF\uFF00-\uFFEF\u2E80-\u2EFF\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/,
  numeric: /^\d+$/,
  punctuation: /[.,!?;(){}[\]<>:/\\|@#$%^&*+=`~_"-]/,
} as const

const TOKEN_SPLIT_PATTERN = new RegExp(`(\\s+|${PATTERNS.punctuation.source}+)`)

// All ratios are calibrated against OpenAI's o200k_base encoding
const DEFAULT_CHARS_PER_TOKEN = 6
const SHORT_TOKEN_THRESHOLD = 3
// Kana runs merge into multi-character tokens (particles, common words);
// kanji and hanzi price at one token per character – the safe upper bound,
// as modern vocabulary merges below it and classical text splits above it
const KANA_CHARS_PER_TOKEN = 1.35

const DEFAULT_LANGUAGE_CONFIGS: LanguageConfig[] = [
  { pattern: /[äöüßẞ]/i, averageCharsPerToken: 2.6 },
  { pattern: /[éèêëàâîïôûùüÿçœæáíóúñ]/i, averageCharsPerToken: 3 },
  // Below the ~3.0 of accented segments on purpose: unaccented Slavic words
  // fall through to the default ratio, and this compensates the shortfall
  { pattern: /[ąćęłńóśźżěščřžýůúďťň]/i, averageCharsPerToken: 2.5 },
  { pattern: /[\u0430-\u044F\u0451]/i, averageCharsPerToken: 4 },
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
    return estimateCjkTokens(segment)
  }

  if (PATTERNS.numeric.test(segment)) {
    // o200k chunks digit runs into groups of up to three digits
    return Math.ceil(segment.length / 3)
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
  if (languageConfigs === DEFAULT_LANGUAGE_CONFIGS && !PATTERNS.nonAscii.test(segment)) {
    return
  }

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

function estimateCjkTokens(segment: string): number {
  let kanaCount = 0
  let otherCount = 0

  for (const character of segment) {
    const codePoint = character.codePointAt(0)!
    const isKanaGlyph = codePoint >= 0x3040 && codePoint <= 0x30FF

    if (isKanaGlyph)
      kanaCount++
    else
      otherCount++
  }

  return otherCount + Math.ceil(kanaCount / KANA_CHARS_PER_TOKEN)
}
