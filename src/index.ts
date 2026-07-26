import type { LanguageConfig, SplitByTokensOptions, TokenEstimationOptions } from './types.ts'

export * from './types.ts'

const PATTERNS = {
  whitespace: /^\s+$/,
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

  const resolvedOptions = resolveOptions(options)

  const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean)
  let tokenCount = 0

  for (const segment of segments) {
    tokenCount += estimateSegmentTokens(segment, resolvedOptions)
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

  const resolvedOptions = resolveOptions(options)

  // Resolving negative indices needs the total count – a full extra pass
  // worth skipping otherwise
  let totalTokens = 0
  if (start < 0 || (end !== undefined && end < 0)) {
    totalTokens = estimateTokenCount(text, options)
  }

  const normalizedStart = start < 0 ? Math.max(0, totalTokens + start) : Math.max(0, start)
  const normalizedEnd = end === undefined
    ? Infinity
    : end < 0
      ? Math.max(0, totalTokens + end)
      : end

  if (normalizedStart >= normalizedEnd)
    return ''

  const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean)
  const parts: string[] = []
  let currentTokenPos = 0

  for (const segment of segments) {
    if (currentTokenPos >= normalizedEnd)
      break

    const tokenCount = estimateSegmentTokens(segment, resolvedOptions)
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

  const resolvedOptions = resolveOptions(options)
  const { overlap = 0 } = options

  const segments = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean)
  const chunks: string[] = []
  let currentChunk: string[] = []
  let currentTokenCount = 0

  for (const segment of segments) {
    const tokenCount = estimateSegmentTokens(segment, resolvedOptions)

    currentChunk.push(segment)
    currentTokenCount += tokenCount

    if (currentTokenCount >= tokensPerChunk) {
      chunks.push(currentChunk.join(''))

      if (overlap > 0) {
        const overlapSegments: string[] = []
        let overlapTokenCount = 0

        for (let i = currentChunk.length - 1; i >= 0 && overlapTokenCount < overlap; i--) {
          const segmentValue = currentChunk[i]!
          overlapSegments.unshift(segmentValue)
          overlapTokenCount += estimateSegmentTokens(segmentValue, resolvedOptions)
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

  if (currentChunk.length > 0)
    chunks.push(currentChunk.join(''))

  return chunks
}

interface ResolvedTokenEstimationOptions {
  defaultCharsPerToken: number
  languageConfigs: LanguageConfig[]
}

function resolveOptions(options: TokenEstimationOptions): ResolvedTokenEstimationOptions {
  return {
    defaultCharsPerToken: options.defaultCharsPerToken ?? DEFAULT_CHARS_PER_TOKEN,
    languageConfigs: withoutStatefulFlags(options.languageConfigs ?? DEFAULT_LANGUAGE_CONFIGS),
  }
}

// Stateful flags make `test()` results depend on `lastIndex`, silently
// alternating across segments
function withoutStatefulFlags(configs: LanguageConfig[]): LanguageConfig[] {
  return configs.map(config => config.pattern.global || config.pattern.sticky
    ? { ...config, pattern: new RegExp(config.pattern.source, config.pattern.flags.replace(/[gy]/g, '')) }
    : config)
}

function estimateSegmentTokens(
  segment: string,
  { languageConfigs, defaultCharsPerToken }: ResolvedTokenEstimationOptions,
): number {
  if (PATTERNS.whitespace.test(segment)) {
    return 0
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
