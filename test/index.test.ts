import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  approximateMaxTokenSize,
  approximateTokenSize,
  getModelContextSize,
  isWithinTokenLimit,
} from '../src/index'

const fixturesDir = fileURLToPath(new URL('fixtures', import.meta.url))

describe('token-related functions', () => {
  describe('approximateTokenSize', () => {
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
      expect(approximateTokenSize(input)).toMatchInlineSnapshot(`33930`)
    })

    it('should approximate the token size for German ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg22367.txt'), 'utf-8')
      expect(approximateTokenSize(input)).toMatchInlineSnapshot(`34908`)
    })

    it('should approximate the token size for Chinese ebook', async () => {
      const input = await readFile(join(fixturesDir, 'ebooks/pg7337.txt'), 'utf-8')
      expect(approximateTokenSize(input)).toMatchInlineSnapshot(`11919`)
    })
  })

  describe('getModelContextSize', () => {
    it('should return the correct context size for a given model', () => {
      const modelName = 'gpt-3.5-turbo'
      expect(getModelContextSize(modelName)).toMatchInlineSnapshot('4096')
    })
  })

  describe('approximateMaxTokenSize', () => {
    it('should calculate the maximum number of tokens correctly', () => {
      const prompt = 'This is a test prompt.'
      const modelName = 'gpt-3.5-turbo'
      const maxTokensInResponse = 100
      const tokenSize = approximateTokenSize(prompt)
      const maxTokens = getModelContextSize(modelName)
      const expectedMaxTokens = maxTokens - tokenSize - maxTokensInResponse
      expect(
        approximateMaxTokenSize({ prompt, modelName, maxTokensInResponse }),
      ).toBe(expectedMaxTokens)
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
  })
})
