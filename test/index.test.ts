import { describe, expect, it } from 'vitest'
import {
  approximateMaxTokenSize,
  approximateTokenSize,
  getModelContextSize,
  isWithinTokenLimit,
} from '../src/index'

describe('token-related functions', () => {
  describe('approximateTokenSize', () => {
    it('should approximate the token size for English text', () => {
      const input = 'Hello, world! This is a test.'
      expect(approximateTokenSize(input)).toMatchInlineSnapshot('9')
    })

    it('should approximate the token size for German text with special characters', () => {
      const input = 'Guten Tag! Wie geht’s dir?'
      expect(approximateTokenSize(input)).toMatchInlineSnapshot('9')
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
