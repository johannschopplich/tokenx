import type { ArgsDef, CommandDef } from 'citty'
import process from 'node:process'
import * as log from './log.ts'

// #region Per-repo bindings

/** Error classes this CLI raises deliberately, beyond `CliError`. */
const EXPECTED_ERRORS: readonly ExpectedErrorClass[] = []

/** Renders a recognized error for a human – the boundary appends the stack itself. */
function describe(error: Error): string {
  return error.message
}

// #endregion

// Byte-identical across the sibling CLI repos – edit it in all of them or none.
// #region Shared boundary

type ExpectedErrorClass = abstract new (...args: never[]) => Error

interface CleanErrorOptions {
  /** Exemption for a command that reads `args._` for more inputs than it declares positionals. */
  allowExtraPositionals?: boolean
}

/**
 * Raised for a condition the CLI recognized and phrased for a human. Anything
 * else reaching the boundary is a defect in the tool and prints its stack unasked.
 */
export class CliError extends Error {}

/** Options spread into every command's `args`, so `--verbose` appears in its own help. */
export const commonArgs: ArgsDef = {
  verbose: {
    type: 'boolean',
    description: 'Print the cause chain and stack trace on failure',
    default: false,
  },
}

/**
 * Wraps a command's `run` in the clean-message boundary. citty's `runMain`
 * prints the raw error object and exits, with no formatting hook, so the
 * wrapping has to happen one command at a time.
 */
export function withCleanErrors<T extends ArgsDef>(
  command: CommandDef<T>,
  options: CleanErrorOptions = {},
): CommandDef<T> {
  const run = command.run
  if (run === undefined)
    return command

  return {
    ...command,
    async run(context) {
      const args = context.args as Record<string, unknown>

      try {
        assertNoUnknownArgs((command.args ?? {}) as ArgsDef, args, options)
        return await run(context)
      }
      catch (error) {
        report(error, args.verbose === true)
      }
    },
  }
}

function report(error: unknown, isVerbose: boolean): void {
  const sections = [Error.isError(error) ? describe(error) : String(error)]

  if (isVerbose || !isExpected(error)) {
    const causeChain = formatCauseChain(error)
    if (causeChain)
      sections.push(causeChain)
    if (Error.isError(error) && error.stack)
      sections.push(error.stack)
  }

  log.error(sections.join('\n\n'))
  // `process.exit` would discard whatever stdout has still buffered, truncating
  // a piped result partway through.
  process.exitCode = 1
}

/**
 * Reports whether the CLI raised this error deliberately rather than tripping
 * over it. A Node system error carries a string `code` and reaches the boundary
 * as the honest answer to what the user asked for, so it reads as deliberate too.
 */
function isExpected(error: unknown): boolean {
  if (error instanceof CliError)
    return true

  if (EXPECTED_ERRORS.some(expectedError => error instanceof expectedError))
    return true

  return Error.isError(error) && typeof (error as { code?: unknown }).code === 'string'
}

function formatCauseChain(error: unknown): string {
  const causeLines: string[] = []
  let current: unknown = Error.isError(error) ? error.cause : undefined

  while (Error.isError(current)) {
    causeLines.push(`Caused by: ${current.name || 'Error'}: ${current.message}`)
    current = current.cause
  }

  return causeLines.join('\n')
}

/** Options citty resolves itself, so no command declares them. */
const BUILTIN_OPTIONS: ReadonlySet<string> = new Set(['help', 'h', 'version', 'v'])

/**
 * Throws when the parsed args carry a flag or positional the command never
 * declared. citty parses with `strict: false` and never rejects an unknown
 * flag, so a typo like `--jsonn` would otherwise be swallowed and the command
 * would run as if it had never been passed. Undeclared flags land as extra keys
 * on the parsed args; a flag that consumed a value shows up as a surplus
 * positional instead.
 */
function assertNoUnknownArgs(
  argsDef: ArgsDef,
  args: Record<string, unknown>,
  { allowExtraPositionals = false }: CleanErrorOptions,
): void {
  const knownNames = new Set<string>()
  let positionalCount = 0

  for (const [name, definition] of Object.entries(argsDef)) {
    knownNames.add(optionName(name))

    const { alias, type } = definition as { alias?: string | string[], type?: string }
    for (const aliasName of typeof alias === 'string' ? [alias] : alias ?? [])
      knownNames.add(optionName(aliasName))

    if (type === 'positional')
      positionalCount++
  }

  const unknownNames = new Set(
    Object.keys(args)
      .filter(key => key !== '_')
      .map(optionName)
      .filter(name => !BUILTIN_OPTIONS.has(name) && !knownNames.has(name)),
  )

  const unknown = [...unknownNames].map(name => name.length === 1 ? `-${name}` : `--${name}`)

  if (!allowExtraPositionals) {
    for (const surplus of (args._ as string[] | undefined)?.slice(positionalCount) ?? [])
      unknown.push(JSON.stringify(surplus))
  }

  if (unknown.length > 0)
    throw new CliError(`Unknown argument(s): ${unknown.join(', ')} – see --help`)
}

/**
 * Normalizes an option key to a single spelling, since citty writes each option
 * under both its camel and its kebab spelling.
 */
export function optionName(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

// #endregion
