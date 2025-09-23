import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  estimateTokenCount,
  isWithinTokenLimit,
  sliceByTokens,
} from '../src/index'

const fixturesDir = fileURLToPath(new URL('fixtures', import.meta.url))

describe('token-related functions', () => {
  const ENGLISH_TEXT = 'Hello, world! This is a short sentence.'
  const GERMAN_TEXT = 'Die pünktlich gewünschte Trüffelfüllung im übergestülpten Würzkümmel-Würfel ist kümmerlich und dürfte fürderhin zu Rüffeln in Hülle und Fülle führen'

  describe('estimateTokenCount', () => {
    it('should estimate tokens for short English text', () => {
      expect(estimateTokenCount(ENGLISH_TEXT)).toMatchInlineSnapshot('11')
    })

    it('should estimate tokens for German text with umlauts', () => {
      expect(estimateTokenCount(GERMAN_TEXT)).toMatchInlineSnapshot('49')
    })

    it('should approximate the token size for English ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg5200.txt'), 'utf-8')
      expect(estimateTokenCount(input)).toMatchInlineSnapshot(`35705`)
    })

    it('should approximate the token size for German ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg22367.txt'), 'utf-8')
      expect(estimateTokenCount(input)).toMatchInlineSnapshot(`35069`)
    })

    it('should approximate the token size for Chinese ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg7337.txt'), 'utf-8')
      expect(estimateTokenCount(input)).toMatchInlineSnapshot(`12059`)
    })

    it('should handle empty input', () => {
      expect(estimateTokenCount('')).toBe(0)
      expect(estimateTokenCount()).toBe(0)
    })

    it('should work with custom options', () => {
      const input = 'Hello world'
      const customOptions = { defaultCharsPerToken: 4 }
      const defaultCount = estimateTokenCount(input)
      const customCount = estimateTokenCount(input, customOptions)

      // With shorter chars per token, we should get more tokens
      expect(customCount).toBeGreaterThan(defaultCount)
    })
  })

  describe('isWithinTokenLimit', () => {
    it('should return true if the input is within the token limit', () => {
      const input = 'Short input.'
      const tokenLimit = 10
      expect(isWithinTokenLimit(input, tokenLimit)).toBe(true)
    })

    it('should return false if the input exceeds the token limit', () => {
      const input
        = 'This is a much longer input that should exceed the token limit set for this test case.'
      const tokenLimit = 10
      expect(isWithinTokenLimit(input, tokenLimit)).toBe(false)
    })

    it('should work with custom options', () => {
      const input = 'Hello world'
      const tokenLimit = 3
      const customOptions = { defaultCharsPerToken: 2 }

      expect(isWithinTokenLimit(input, tokenLimit)).toBe(true)
      expect(isWithinTokenLimit(input, tokenLimit, customOptions)).toBe(false)
    })
  })

  describe('sliceByTokens', () => {
    it('should handle empty input and return entire text without bounds', () => {
      // Empty input
      expect(sliceByTokens('')).toBe('')
      expect(sliceByTokens('', 0, 5)).toBe('')

      // No bounds - return entire text
      expect(sliceByTokens(ENGLISH_TEXT)).toBe(ENGLISH_TEXT)
    })

    it('should slice English text with positive indices', () => {
      // Test specific slice behavior with known English text
      const firstTwoTokens = sliceByTokens(ENGLISH_TEXT, 0, 2)
      const fromThirdToken = sliceByTokens(ENGLISH_TEXT, 2)

      expect(firstTwoTokens).toMatchInlineSnapshot('"Hello,"')
      expect(fromThirdToken).toMatchInlineSnapshot('" world! This is a short sentence."')

      // Verify they combine to cover most of the original
      expect(firstTwoTokens.length + fromThirdToken.length).toBeGreaterThan(ENGLISH_TEXT.length * 0.8)
    })

    it('should slice German text with positive indices', () => {
      // First 3 tokens
      const firstThree = sliceByTokens(GERMAN_TEXT, 0, 3)
      expect(firstThree).toMatchInlineSnapshot('"Die pünktl"')

      // Middle section
      const middle = sliceByTokens(GERMAN_TEXT, 5, 10)
      expect(middle.length).toBeGreaterThan(0)
      expect(middle.length).toBeLessThan(GERMAN_TEXT.length)
    })

    it('should slice German text with negative indices', () => {
      // Last 3 tokens
      const lastThree = sliceByTokens(GERMAN_TEXT, -3)
      expect(lastThree).toMatchInlineSnapshot('"lle führen"')

      // Exclude last 2 tokens
      const withoutLastTwo = sliceByTokens(GERMAN_TEXT, 0, -2)
      expect(withoutLastTwo.endsWith('Fülle')).toBe(true)

      // Both negative indices
      const middleNegative = sliceByTokens(GERMAN_TEXT, -8, -3)
      expect(middleNegative.length).toBeGreaterThan(0)
      expect(middleNegative.includes('Hülle')).toBe(true)
    })

    it('should handle edge cases', () => {
      const totalTokens = estimateTokenCount(GERMAN_TEXT)

      // Invalid ranges
      expect(sliceByTokens(GERMAN_TEXT, 10, 5)).toBe('')
      expect(sliceByTokens(GERMAN_TEXT, 5, 5)).toBe('')

      // Out of bounds
      expect(sliceByTokens(GERMAN_TEXT, totalTokens + 10)).toBe('')
      expect(sliceByTokens(GERMAN_TEXT, 0, totalTokens + 10)).toBe(GERMAN_TEXT)
      expect(sliceByTokens(GERMAN_TEXT, -1000)).toBe(GERMAN_TEXT)
    })
  })
})
