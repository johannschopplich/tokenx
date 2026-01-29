import type { LanguageConfig, SplitByTokensOptions, TokenEstimationOptions } from './types.ts'

export * from './types.ts'

const PATTERNS = {
  whitespace: /^\s+$/,
  cjk: /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF\u30A0-\u30FF\u2E80-\u2EFF\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/,
  numeric: /^\d+(?:[.,]\d+)*$/,
  punctuation: /[.,!?;(){}[\]<>:/\\|@#$%^&*+=`~_-]/,
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

/** @deprecated Use `estimateTokenCount` instead */
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

/**
 * Extracts a portion of text based on token positions, similar to Array.prototype.slice().
 */
export function sliceByTokens(
  text: string,
  start: number = 0,
  end?: number,
  options: TokenEstimationOptions = {},
): string {
  if (!text)
    return ''

  const { defaultCharsPerToken = DEFAULT_CHARS_PER_TOKEN, languageConfigs = DEFAULT_LANGUAGE_CONFIGS } = options

  // Handle negative indices
  let totalTokens = 0
  if (start < 0 || (end !== undefined && end < 0)) {
    totalTokens = estimateTokenCount(text, options)
  }

  // Normalize indices
  const normalizedStart = start < 0 ? Math.max(0, totalTokens + start) : Math.max(0, start)
  const normalizedEnd = end === undefined
    ? Infinity
    : end < 0
      ? Math.max(0, totalTokens + end)
      : end

  if (normalizedStart >= normalizedEnd)
    return ''

  // Use same splitting logic as estimateTokenCount for consistency
  const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean)
  const parts: string[] = []
  let currentTokenPos = 0

  for (const segment of segments) {
    if (currentTokenPos >= normalizedEnd)
      break

    const tokenCount = estimateSegmentTokens(segment, languageConfigs, defaultCharsPerToken)
    const extracted = extractSegmentPart(segment, currentTokenPos, tokenCount, normalizedStart, normalizedEnd)
    if (extracted)
      parts.push(extracted)
    currentTokenPos += tokenCount
  }

  return parts.join('')
}

/**
 * Splits text into chunks based on token count.
 */
export function splitByTokens(
  text: string,
  tokensPerChunk: number,
  options: SplitByTokensOptions = {},
): string[] {
  if (!text || tokensPerChunk <= 0)
    return []

  const {
    defaultCharsPerToken = DEFAULT_CHARS_PER_TOKEN,
    languageConfigs = DEFAULT_LANGUAGE_CONFIGS,
    overlap = 0,
  } = options

  const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean)
  const chunks: string[] = []
  let currentChunk: string[] = []
  let currentTokenCount = 0

  for (const segment of segments) {
    const tokenCount = estimateSegmentTokens(segment, languageConfigs, defaultCharsPerToken)

    currentChunk.push(segment)
    currentTokenCount += tokenCount

    if (currentTokenCount >= tokensPerChunk) {
      chunks.push(currentChunk.join(''))

      // Calculate overlap for next chunk
      if (overlap > 0) {
        const overlapSegments: string[] = []
        let overlapTokenCount = 0

        for (let i = currentChunk.length - 1; i >= 0 && overlapTokenCount < overlap; i--) {
          const segmentValue = currentChunk[i]!
          const tokCount = estimateSegmentTokens(segmentValue, languageConfigs, defaultCharsPerToken)
          overlapSegments.unshift(segmentValue)
          overlapTokenCount += tokCount
        }

        currentChunk = overlapSegments
        currentTokenCount = overlapTokenCount
      }
      else {
        currentChunk = []
        currentTokenCount = 0
      }
    }
  }

  // Add remaining content as last chunk
  if (currentChunk.length > 0)
    chunks.push(currentChunk.join(''))

  return chunks
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

  // Fallback for mixed content (URLs, code, JSON, etc.)
  const charsPerToken = getLanguageSpecificCharsPerToken(segment, languageConfigs) ?? defaultCharsPerToken
  return Math.ceil(segment.length / charsPerToken)
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

function extractSegmentPart(
  segment: string,
  segmentTokenStart: number,
  segmentTokenCount: number,
  targetStart: number,
  targetEnd: number,
): string {
  if (segmentTokenCount === 0) {
    return segmentTokenStart >= targetStart && segmentTokenStart < targetEnd ? segment : ''
  }

  const segmentTokenEnd = segmentTokenStart + segmentTokenCount
  if (segmentTokenStart >= targetEnd || segmentTokenEnd <= targetStart)
    return ''

  const overlapStart = Math.max(0, targetStart - segmentTokenStart)
  const overlapEnd = Math.min(segmentTokenCount, targetEnd - segmentTokenStart)

  if (overlapStart === 0 && overlapEnd === segmentTokenCount)
    return segment

  const charStart = Math.floor((overlapStart / segmentTokenCount) * segment.length)
  const charEnd = Math.ceil((overlapEnd / segmentTokenCount) * segment.length)
  return segment.slice(charStart, charEnd)
}
