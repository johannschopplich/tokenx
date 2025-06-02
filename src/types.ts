/**
 * Configuration options for token estimation
 */
export interface TokenEstimationOptions {
  /** Default average characters per token when no language-specific rule applies */
  defaultCharsPerToken?: number
  /** Custom language configurations to override defaults */
  languageConfigs?: LanguageConfig[]
}

/**
 * Language-specific token estimation configurations
 */
export interface LanguageConfig {
  /** Regular expression to detect the language */
  pattern: RegExp
  /** Average number of characters per token for this language */
  averageCharsPerToken: number
}
