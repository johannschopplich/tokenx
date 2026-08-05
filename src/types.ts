export interface TokenEstimationOptions {
  /** Default average characters per token when no language-specific rule applies (default: 7). */
  defaultCharsPerToken?: number
  /** Custom language configurations to override defaults. */
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
