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
  /**
   * Approximate number of tokens repeated from the end of each chunk at the start of the next (default: 0, clamped
   * below the target chunk size). The repeat consists of whole segments – more tokens when a segment crosses this
   * count, fewer when one more segment would bring the repeat up to the target chunk size.
   */
  overlap?: number
}
