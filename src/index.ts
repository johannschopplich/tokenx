import type { LanguageConfig, TokenEstimationOptions } from './types'

export * from './types'

const PATTERNS = {
  whitespace: /^\s+$/,
  cjk: /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF\u30A0-\u30FF\u2E80-\u2EFF\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/,
  numeric: /^\d+(?:[.,]\d+)*$/,
  punctuation: /[.,!?;(){}[\]<>:/\\|@#$%^&*+=`~-]/,
  alphanumeric: /^[a-zA-Z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]+$/,
} as const

const TOKEN_SPLIT_PATTERN = new RegExp(`(\\s+|${PATTERNS.punctuation.source}+)`)

// Default configuration constants
const DEFAULT_CHARS_PER_TOKEN = 6
const SHORT_TOKEN_THRESHOLD = 3

// Default language-specific token estimation rules
const DEFAULT_LANGUAGE_CONFIGS: LanguageConfig[] = [
  { pattern: /[äöüßẞ]/i, averageCharsPerToken: 3 },
  { pattern: /[éèêëàâîïôûùüÿçœæáíóúñ]/i, averageCharsPerToken: 3 },
  { pattern: /[ąćęłńóśźżěščřžýůúďťň]/i, averageCharsPerToken: 3.5 },
]

/**
 * Checks if a text string is within a specified token limit
 */
export function isWithinTokenLimit(
  text: string,
  tokenLimit: number,
  options?: TokenEstimationOptions,
): boolean {
  return estimateTokenCount(text, options) <= tokenLimit
}

// Legacy alias for backward compatibility
export const approximateTokenSize: typeof estimateTokenCount = estimateTokenCount

/**
 * Estimates the number of tokens in a text string using heuristic rules.
 */
export function estimateTokenCount(text?: string, options: TokenEstimationOptions = {}): number {
  if (!text)
    return 0

  const {
    defaultCharsPerToken = DEFAULT_CHARS_PER_TOKEN,
    languageConfigs = DEFAULT_LANGUAGE_CONFIGS,
  } = options

  const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean)
  let tokenCount = 0

  for (const segment of segments) {
    tokenCount += estimateSegmentTokens(segment, languageConfigs, defaultCharsPerToken)
  }

  return tokenCount
}

function estimateSegmentTokens(
  segment: string,
  languageConfigs: LanguageConfig[],
  defaultCharsPerToken: number,
): number {
  if (PATTERNS.whitespace.test(segment)) {
    return 0
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
    return segment.length > 1 ? Math.ceil(segment.length / 2) : 1
  }

  if (PATTERNS.alphanumeric.test(segment)) {
    const charsPerToken = getLanguageSpecificCharsPerToken(segment, languageConfigs) ?? defaultCharsPerToken
    return Math.ceil(segment.length / charsPerToken)
  }

  return getCharacterCount(segment)
}

function getLanguageSpecificCharsPerToken(segment: string, languageConfigs: LanguageConfig[]): number | undefined {
  for (const config of languageConfigs) {
    if (config.pattern.test(segment)) {
      return config.averageCharsPerToken
    }
  }
}

function getCharacterCount(text: string): number {
  return Array.from(text).length
}
