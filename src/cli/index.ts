import type { CommandDef } from 'utilful/cli'
import type { TokenEstimationOptions } from '../types.ts'
import process from 'node:process'
import { CliError, defineCommand, log } from 'utilful/cli'
import pkg from '../../package.json' with { type: 'json' }
import { estimateTokenCount, sliceByTokens, splitByTokens } from '../index.ts'
import { readInputs } from './input.ts'

const { name, version } = pkg

/** The boundary exits with `1` for any failure, which leaves `2` free to mean "ran fine, but the input is over the limit". */
const EXIT_OVER_LIMIT = 2

/** The one default the CLI owns – every other default belongs to the library. */
const DEFAULT_CHUNK_SIZE = 1000

interface InputCount {
  label: string
  tokenCount: number
}

const countArgs = {
  'input': {
    type: 'positional',
    description: 'File path (omit or use "-" to read from stdin)',
    required: false,
  },
  'chars-per-token': {
    type: 'string',
    description: 'Average characters per token when no language rule applies',
  },
  'limit': {
    type: 'string',
    // `mainCommand`'s exported type reaches these arguments, and `isolatedDeclarations` cannot infer an interpolated string's type.
    description: `Exit with code ${EXIT_OVER_LIMIT} when the total exceeds this many tokens` as string,
  },
  'json': {
    type: 'boolean',
    description: 'Print a JSON object instead of plain numbers',
  },
} as const

const sliceArgs = {
  'input': countArgs.input,
  'chars-per-token': countArgs['chars-per-token'],
  'start': {
    type: 'string',
    description: 'Start token index, inclusive (negative counts from the end)',
  },
  'end': {
    type: 'string',
    description: 'End token index, exclusive (negative counts from the end)',
  },
} as const

const splitArgs = {
  'input': countArgs.input,
  'chars-per-token': countArgs['chars-per-token'],
  'size': {
    type: 'string',
    description: `Target tokens per chunk (default: ${DEFAULT_CHUNK_SIZE})`,
  },
  'overlap': {
    type: 'string',
    description: 'Tokens repeated from the end of the previous chunk',
  },
} as const

const countCommand: CommandDef<typeof countArgs> = defineCommand({
  meta: {
    name: 'count',
    description: 'Estimate the token count of one or more inputs',
  },
  args: countArgs,
  allowExtraPositionals: true,
  async run({ args }) {
    const options = resolveEstimationOptions(args['chars-per-token'])
    const limit = parseInteger('limit', args.limit, 0)

    const documents = await readInputs(args._)
    const counts: InputCount[] = documents.map(({ label, text }) => ({
      label,
      tokenCount: estimateTokenCount(text, options),
    }))
    const total = counts.reduce((sum, { tokenCount }) => sum + tokenCount, 0)

    if (args.json)
      process.stdout.write(`${JSON.stringify({ inputs: counts, total })}\n`)
    else if (counts.length === 1)
      process.stdout.write(`${total}\n`)
    else
      process.stdout.write(formatCountTable(counts, total))

    if (limit !== undefined && total > limit) {
      log.info(`${total} tokens exceeds the limit of ${limit}`)
      process.exitCode = EXIT_OVER_LIMIT
    }
  },
})

const sliceCommand: CommandDef<typeof sliceArgs> = defineCommand({
  meta: {
    name: 'slice',
    description: 'Extract a token range from an input, like Array.prototype.slice()',
  },
  args: sliceArgs,
  allowExtraPositionals: true,
  async run({ args }) {
    const options = resolveEstimationOptions(args['chars-per-token'])
    const start = parseInteger('start', args.start)
    const end = parseInteger('end', args.end)

    const text = await readSingleInput(args._)

    // A trailing newline keeps the shell prompt on a fresh line; command
    // substitution strips it again, so scripts see the slice verbatim.
    process.stdout.write(`${sliceByTokens(text, start, end, options)}\n`)
  },
})

const splitCommand: CommandDef<typeof splitArgs> = defineCommand({
  meta: {
    name: 'split',
    description: 'Split an input into token-sized chunks, printed as a JSON array',
  },
  args: splitArgs,
  allowExtraPositionals: true,
  async run({ args }) {
    const options = resolveEstimationOptions(args['chars-per-token'])
    const size = parseInteger('size', args.size, 1) ?? DEFAULT_CHUNK_SIZE
    const overlap = parseInteger('overlap', args.overlap, 0)

    const text = await readSingleInput(args._)
    const chunks = splitByTokens(text, size, { ...options, overlap })

    // Arbitrary text has no honest raw framing – JSON is the only unambiguous one.
    process.stdout.write(`${JSON.stringify(chunks)}\n`)
  },
})

/** An input on its own is counted, so `count` doubles as the run of the tree itself. */
export const mainCommand: CommandDef<typeof countArgs> = defineCommand({
  ...countCommand,
  meta: {
    name,
    description: 'Estimate, slice and split text by LLM token count',
    version,
  },
  subCommands: {
    count: countCommand,
    slice: sliceCommand,
    split: splitCommand,
  },
})

async function readSingleInput(paths: string[]): Promise<string> {
  if (paths.length > 1)
    throw new CliError('Expected a single input')

  const [document] = await readInputs(paths)
  return document!.text
}

function resolveEstimationOptions(charsPerToken: string | undefined): TokenEstimationOptions {
  const defaultCharsPerToken = parseInteger('chars-per-token', charsPerToken, 1)
  return defaultCharsPerToken === undefined ? {} : { defaultCharsPerToken }
}

function parseInteger(option: string, rawValue: string | undefined, minimum?: number): number | undefined {
  if (rawValue === undefined)
    return undefined

  // `--limit "$BUDGET"` collapses to an empty string when the variable is unset.
  if (rawValue === '')
    throw new CliError(`Missing --${option} value`)

  // `Number` would read `0x10` as 16 and `1e3` as 1000; only decimals are meant.
  const value = /^-?\d+$/.test(rawValue) ? Number(rawValue) : Number.NaN

  if (Number.isNaN(value) || (minimum !== undefined && value < minimum))
    throw new CliError(`Invalid --${option} value: ${rawValue}`)

  return value
}

function formatCountTable(counts: readonly InputCount[], total: number): string {
  const rows = [...counts, { label: 'total', tokenCount: total }]
  const labelWidth = Math.max(...rows.map(({ label }) => label.length))
  const countWidth = Math.max(...rows.map(({ tokenCount }) => String(tokenCount).length))

  return `${rows
    .map(({ label, tokenCount }) => `${label.padEnd(labelWidth)}  ${String(tokenCount).padStart(countWidth)}`)
    .join('\n')}\n`
}
