export interface TokenEstimationOptions {
  /** Average characters per token for segments no other rule prices (default: 7). */
  defaultCharsPerToken?: number
  /** Language configs checked before the built-in ones, so the first matching custom config wins. */
  languageConfigs?: LanguageConfig[]
}

export interface LanguageConfig {
  /** Regular expression to detect the language. */
  pattern: RegExp
  averageCharsPerToken: number
}

export interface SplitByTokensOptions extends TokenEstimationOptions {
  /** Number of tokens to overlap between consecutive chunks (default: 0, clamped below the target chunk size). */
  overlap?: number
}
