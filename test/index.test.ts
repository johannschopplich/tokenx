import { describe, expect, it } from 'vitest'
import {
  approximateMaxTokenSize,
  approximateTokenSize,
  getModelContextSize,
  isWithinTokenLimit,
} from '../src/index'

describe('token-related functions', () => {
  describe('approximateTokenSize', () => {
    it('should approximate the token size for short English text', () => {
      const input = 'Hello, world! This is a test.'
      // 9 tokens when using the GPT tokenizer
      expect(approximateTokenSize(input)).toMatchInlineSnapshot('9')
    })

    it('should approximate the token size for Kafka text excerpt', () => {
      const input = 'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin. He lay on his armour-like back, and if he lifted his head a little he could see his brown belly, slightly domed and divided by arches into stiff sections. The bedding was hardly able to cover it and seemed ready to slide off any moment. His many legs, pitifully thin compared with the size of the rest of him, waved about helplessly as he looked. “What’s happened to me?” he thought. It wasn’t a dream. His room, a proper human room although a little too small, lay peacefully between its four familiar walls. A collection of textile samples lay spread out on the table – Samsa was a travelling salesman – and above it there hung a picture that he had recently cut out of an illustrated magazine and housed in a nice, gilded frame. It showed a lady fitted out with a fur hat and fur boa who sat upright, raising a heavy fur muff that covered the whole of her lower arm towards the viewer. Gregor then turned to look out the window at the dull weather. Drops of rain could be heard hitting the pane, which made him feel quite sad. “How about if I sleep a little bit longer and forget all this nonsense”, he thought, but that was something he was unable to do because he was used to sleeping on his right, and in his present state couldn’t get into that position.'
      // 304 tokens when using the GPT tokenizer
      expect(approximateTokenSize(input)).toMatchInlineSnapshot('364')
    })

    it('should approximate the token size for German text with special characters', () => {
      const input = 'Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich.'
      // 22 tokens when using the GPT tokenizer
      expect(approximateTokenSize(input)).toMatchInlineSnapshot('15')
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
