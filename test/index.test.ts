import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  approximateTokenSize,
  estimateTokenCount,
  isWithinTokenLimit,
} from '../src/index'

const fixturesDir = fileURLToPath(new URL('fixtures', import.meta.url))

describe('token-related functions', () => {
  describe('approximateTokenSize (legacy)', () => {
    it('should approximate the token size for short English text', () => {
      const input = 'Hello, world! This is a short sentence.'
      expect(approximateTokenSize(input)).toMatchInlineSnapshot('11')
    })

    it('should approximate the token size for short German text with umlauts', () => {
      const input = 'Die pünktlich gewünschte Trüffelfüllung im übergestülpten Würzkümmel-Würfel ist kümmerlich und dürfte fürderhin zu Rüffeln in Hülle und Fülle führen'
      expect(approximateTokenSize(input)).toMatchInlineSnapshot('49')
    })

    it('should approximate the token size for English ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg5200.txt'), 'utf-8')
      expect(approximateTokenSize(input)).toMatchInlineSnapshot(`35705`)
    })

    it('should approximate the token size for German ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg22367.txt'), 'utf-8')
      expect(approximateTokenSize(input)).toMatchInlineSnapshot(`35069`)
    })

    it('should approximate the token size for Chinese ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg7337.txt'), 'utf-8')
      expect(approximateTokenSize(input)).toMatchInlineSnapshot(`12059`)
    })
  })

  describe('estimateTokenCount', () => {
    it('should estimate tokens for short English text', () => {
      const input = 'Hello, world! This is a short sentence.'
      expect(estimateTokenCount(input)).toMatchInlineSnapshot('11')
    })

    it('should estimate tokens for German text with umlauts', () => {
      const input = 'Die pünktlich gewünschte Trüffelfüllung im übergestülpten Würzkümmel-Würfel ist kümmerlich und dürfte fürderhin zu Rüffeln in Hülle und Fülle führen'
      expect(estimateTokenCount(input)).toMatchInlineSnapshot('49')
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
})
