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
const DEFAULT_CHARS_PER_TOKEN = 7
const SHORT_TOKEN_THRESHOLD = 3
const PUNCTUATION_CHARS_PER_TOKEN = 6
const KANA_CHARS_PER_TOKEN = 1.4
const HANGUL_CHARS_PER_TOKEN = 1.65
const HANZI_CHARS_PER_TOKEN = 1.15

const DEFAULT_LANGUAGE_CONFIGS: LanguageConfig[] = [
  // An accent rule prices a whole language through the minority of its words
  // that carry an accent, so each ratio is fitted against running text in that
  // language rather than against the segments the pattern matches
  { pattern: /[äöüßẞ]/i, averageCharsPerToken: 3 },
  { pattern: /[éèêëàâîïôûùüÿçœæáíóúñ]/i, averageCharsPerToken: 4.5 },
  // Set below what the accented segments alone would fit: unaccented Slavic
  // words fall through to the default ratio, and this compensates the shortfall
  { pattern: /[ąćęłńóśźżěščřžýůúďťň]/i, averageCharsPerToken: 2.5 },
  { pattern: /[\u0430-\u044F\u0451]/i, averageCharsPerToken: 6 },
  { pattern: /[\u03AC-\u03CE]/i, averageCharsPerToken: 3 },
  // Anchored to pure emoji runs – symbols like ™ are Extended_Pictographic
  // too, and an unanchored match would misprice the whole attached word
  { pattern: /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\p{Emoji_Component}]*$/u, averageCharsPerToken: 0.9 },
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

  let previousSegment = ''

  for (const segment of text.split(TOKEN_SPLIT_PATTERN)) {
    if (segment) {
      yield { segment, tokenCount: estimateSegmentTokens(segment, resolvedOptions, previousSegment) }
      previousSegment = segment
    }
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
  previousSegment: string,
): number {
  if (PATTERNS.whitespace.test(segment)) {
    // Indentation and blank lines cost a token in o200k
    if (PATTERNS.structuredWhitespace.test(segment))
      return 1

    // A line break merges into a preceding punctuation token but stands on
    // its own after a word. Single spaces always merge
    return segment.includes('\n') && !PATTERNS.punctuation.test(previousSegment.slice(-1)) ? 1 : 0
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
    return Math.ceil(segment.length / PUNCTUATION_CHARS_PER_TOKEN)
  }

  return Math.ceil(segment.length / defaultCharsPerToken)
}

function getLanguageSpecificCharsPerToken(segment: string, languageConfigs: LanguageConfig[]): number | undefined {
  // Every built-in config needs a non-ASCII character to match, so ASCII-only
  // segments skip the loop – custom configs carry no such guarantee, which is
  // why the shortcut checks for the defaults
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
  let hangulCount = 0
  let hanziCount = 0

  for (const character of segment) {
    const codePoint = character.codePointAt(0)!

    if (codePoint >= 0x3040 && codePoint <= 0x30FF)
      kanaCount++
    else if (isHangulCodePoint(codePoint))
      hangulCount++
    else
      hanziCount++
  }

  // One rounding for the whole segment: rounding each script on its own would
  // charge a token for every script boundary in mixed CJK text
  return Math.ceil(
    hanziCount / HANZI_CHARS_PER_TOKEN
    + kanaCount / KANA_CHARS_PER_TOKEN
    + hangulCount / HANGUL_CHARS_PER_TOKEN,
  )
}

function isHangulCodePoint(codePoint: number): boolean {
  return (codePoint >= 0xAC00 && codePoint <= 0xD7AF)
    || (codePoint >= 0x1100 && codePoint <= 0x11FF)
    || (codePoint >= 0x3130 && codePoint <= 0x318F)
    || (codePoint >= 0xA960 && codePoint <= 0xA97F)
    || (codePoint >= 0xD7B0 && codePoint <= 0xD7FF)
}
