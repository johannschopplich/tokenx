import type { ArgsDef, CommandDef } from 'citty'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CliError, commonArgs, withCleanErrors } from '../src/cli/errors.ts'

// Byte-identical across the sibling CLI repos apart from the import above –
// edit it in all of them or none.

const STACK_FRAME = /^\s+at \S+/m

/** Runs a command that throws nothing but `thrown`, and returns what reached stderr. */
async function reportFor(thrown: unknown, args: Record<string, unknown> = {}): Promise<string> {
  const command: CommandDef<ArgsDef> = {
    args: commonArgs,
    run() {
      throw thrown
    },
  }
  const messages: string[] = []
  const consoleError = vi.spyOn(console, 'error').mockImplementation((message: string) => {
    messages.push(message)
  })

  try {
    await withCleanErrors(command).run!({ args, rawArgs: [], cmd: command } as never)
  }
  finally {
    consoleError.mockRestore()
  }

  return messages.join('\n')
}

afterEach(() => {
  process.exitCode = undefined
})

describe('cli error boundary', () => {
  it('prints a recognized error as a message alone', async () => {
    const output = await reportFor(new CliError('Not a directory: /tmp/missing'))

    expect(output).toContain('Not a directory: /tmp/missing')
    expect(output).not.toMatch(STACK_FRAME)
    expect(process.exitCode).toBe(1)
  })

  it('adds the stack to a recognized error with --verbose', async () => {
    const output = await reportFor(new CliError('Not a directory: /tmp/missing'), { verbose: true })

    expect(output).toContain('Not a directory: /tmp/missing')
    expect(output).toMatch(STACK_FRAME)
  })

  it('prints the stack of an unexpected error without being asked', async () => {
    // A `TypeError` is a defect in the tool rather than something the user can
    // fix by rereading the message, so the stack is the part worth showing.
    const output = await reportFor(new TypeError('entries.map is not a function'))

    expect(output).toContain('entries.map is not a function')
    expect(output).toMatch(STACK_FRAME)
  })

  it('treats a filesystem error as recognized', async () => {
    const failure = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })

    const output = await reportFor(failure)

    expect(output).toContain('ENOENT')
    expect(output).not.toMatch(STACK_FRAME)
  })

  it('names each cause with --verbose', async () => {
    const failure = new CliError('Cannot read the input', { cause: new Error('permission denied') })

    const output = await reportFor(failure, { verbose: true })

    expect(output).toContain('Caused by: Error: permission denied')
  })

  it('reports a thrown non-error by its string form', async () => {
    const output = await reportFor('plain string failure')

    expect(output).toContain('plain string failure')
    expect(process.exitCode).toBe(1)
  })

  it('rejects an argument no command declares', async () => {
    const output = await reportFor(undefined, { typo: true })

    expect(output).toContain('Unknown argument(s): --typo')
    expect(process.exitCode).toBe(1)
  })
})
