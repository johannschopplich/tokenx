import type { ArgsDef, CommandDef, ParsedArgs } from 'citty'
import type { TokenEstimationOptions } from '../types.ts'
import process from 'node:process'
import { defineCommand, runMain } from 'citty'
import pkg from '../../package.json' with { type: 'json' }
import { estimateTokenCount, sliceByTokens, splitByTokens } from '../index.ts'
import { CliError, commonArgs, optionName, withCleanErrors } from './errors.ts'
import { readInputs } from './input.ts'
import * as log from './log.ts'

const { name, version } = pkg

/**
 * The boundary exits with `1`, matching citty's own code for usage errors, which
 * leaves `2` free to mean "ran fine, but the input is over the limit".
 */
const EXIT_OVER_LIMIT = 2

/** The one default the CLI owns – every other default belongs to the library. */
const DEFAULT_CHUNK_SIZE = 1000

interface InputCount {
  label: string
  tokenCount: number
}

// Kebab-cased key so citty renders `--chars-per-token` in the usage block;
// its argument proxy resolves either spelling on the way back in.
const estimationArgs: ArgsDef = {
  'chars-per-token': {
    type: 'string',
    description: 'Average characters per token when no language rule applies',
  },
}

const inputArg: ArgsDef = {
  input: {
    type: 'positional',
    description: 'File path (omit or use "-" to read from stdin)',
    required: false,
  },
}

const countArgs: ArgsDef = {
  ...inputArg,
  ...estimationArgs,
  ...commonArgs,
  limit: {
    type: 'string',
    description: `Exit with code ${EXIT_OVER_LIMIT} when the total exceeds this many tokens`,
  },
  json: {
    type: 'boolean',
    description: 'Print a JSON object instead of plain numbers',
    default: false,
  },
}

const sliceArgs: ArgsDef = {
  ...inputArg,
  ...estimationArgs,
  ...commonArgs,
  start: {
    type: 'string',
    description: 'Start token index, inclusive (negative counts from the end)',
  },
  end: {
    type: 'string',
    description: 'End token index, exclusive (negative counts from the end)',
  },
}

const splitArgs: ArgsDef = {
  ...inputArg,
  ...estimationArgs,
  ...commonArgs,
  size: {
    type: 'string',
    description: `Target tokens per chunk (default: ${DEFAULT_CHUNK_SIZE})`,
  },
  overlap: {
    type: 'string',
    description: 'Tokens repeated from the end of the previous chunk',
  },
}

/** Which options carry a value has to be known before the subcommand is. */
const EVERY_ARG: ArgsDef = { ...countArgs, ...sliceArgs, ...splitArgs }

const countCommand: CommandDef<ArgsDef> = withCleanErrors(defineCommand({
  meta: {
    name: 'count',
    description: 'Estimate the token count of one or more inputs',
  },
  args: countArgs,
  async run({ args }) {
    const options = resolveEstimationOptions(args)
    const limit = parseInteger('limit', args.limit, 0)

    const documents = await readInputs(args._)
    const counts: InputCount[] = documents.map(({ label, text }) => ({
      label,
      tokenCount: estimateTokenCount(text, options),
    }))
    const total = counts.reduce((sum, { tokenCount }) => sum + tokenCount, 0)

    if (args.json === true)
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
}), { allowExtraPositionals: true })

const sliceCommand: CommandDef<ArgsDef> = withCleanErrors(defineCommand({
  meta: {
    name: 'slice',
    description: 'Extract a token range from an input, like Array.prototype.slice()',
  },
  args: sliceArgs,
  async run({ args }) {
    const options = resolveEstimationOptions(args)
    const start = parseInteger('start', args.start)
    const end = parseInteger('end', args.end)

    const text = await readSingleInput(args._)

    // A trailing newline keeps the shell prompt on a fresh line; command
    // substitution strips it again, so scripts see the slice verbatim.
    process.stdout.write(`${sliceByTokens(text, start, end, options)}\n`)
  },
}), { allowExtraPositionals: true })

const splitCommand: CommandDef<ArgsDef> = withCleanErrors(defineCommand({
  meta: {
    name: 'split',
    description: 'Split an input into token-sized chunks, printed as a JSON array',
  },
  args: splitArgs,
  async run({ args }) {
    const options = resolveEstimationOptions(args)
    const size = parseInteger('size', args.size, 1) ?? DEFAULT_CHUNK_SIZE
    const overlap = parseInteger('overlap', args.overlap, 0)

    const text = await readSingleInput(args._)
    const chunks = splitByTokens(text, size, { ...options, overlap })

    // Arbitrary text has no honest raw framing – JSON is the only unambiguous one.
    process.stdout.write(`${JSON.stringify(chunks)}\n`)
  },
}), { allowExtraPositionals: true })

const subCommands = {
  count: countCommand,
  slice: sliceCommand,
  split: splitCommand,
}

export const mainCommand: CommandDef<ArgsDef> = defineCommand({
  meta: {
    name,
    description: 'Estimate, slice and split text by LLM token count',
    version,
  },
  // Repeated from `count` so `tokenx --help` documents the options the default
  // command accepts, rather than only listing the commands.
  args: countArgs,
  subCommands,
  default: 'count',
})

export async function runCli(rawArgs: readonly string[]): Promise<void> {
  await runMain(mainCommand, { rawArgs: normalizeArgs(rawArgs) })
}

/**
 * Puts the subcommand first, so citty never has to guess at it. citty only falls
 * back to `default` when no operand is present at all, so `tokenx README.md` would
 * otherwise be rejected as an unknown command. Naming a file after a subcommand
 * shadows it – the same trade-off git and npm make.
 */
export function normalizeArgs(rawArgs: readonly string[]): string[] {
  const operandIndex = findOperandIndex(rawArgs)

  // Prepending `count` here would defeat citty's `--version`, which only fires
  // when it is the sole argument.
  if (operandIndex === -1)
    return [...rawArgs]

  const operand = rawArgs[operandIndex]!

  // citty discards everything ahead of the subcommand name, so the name moves to
  // the front rather than the options moving behind it.
  return Object.hasOwn(subCommands, operand)
    ? [operand, ...rawArgs.slice(0, operandIndex), ...rawArgs.slice(operandIndex + 1)]
    : ['count', ...rawArgs]
}

/**
 * Finds the operand citty would treat as the subcommand, stepping over the value
 * of an option rather than mistaking it for the operand.
 */
function findOperandIndex(rawArgs: readonly string[]): number {
  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index]!

    if (arg === '--')
      return -1
    // `-` on its own is stdin, not an option.
    if (!arg.startsWith('-') || arg === '-')
      return index
    if (!arg.includes('=') && EVERY_ARG[optionName(arg.replace(/^--?/, ''))]?.type === 'string')
      index++
  }

  return -1
}

async function readSingleInput(paths: string[]): Promise<string> {
  if (paths.length > 1)
    throw new CliError('Expected a single input')

  const [document] = await readInputs(paths)
  return document!.text
}

function resolveEstimationOptions(args: ParsedArgs<ArgsDef>): TokenEstimationOptions {
  const defaultCharsPerToken = parseInteger('chars-per-token', args.charsPerToken, 1)
  return defaultCharsPerToken === undefined ? {} : { defaultCharsPerToken }
}

function parseInteger(option: string, rawValue: unknown, minimum?: number): number | undefined {
  if (rawValue === undefined)
    return undefined

  const raw = String(rawValue)
  // citty hands over an empty string for an option given no value, which is what
  // `--limit "$BUDGET"` collapses to when the variable is unset.
  if (raw === '')
    throw new CliError(`Missing --${option} value`)

  // `Number` would read `0x10` as 16 and `1e3` as 1000; only decimals are meant.
  const value = /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN

  if (Number.isNaN(value) || (minimum !== undefined && value < minimum))
    throw new CliError(`Invalid --${option} value: ${raw}`)

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
