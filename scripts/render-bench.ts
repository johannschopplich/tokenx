import { spawnSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { Ansis } from 'ansis'

const rootDir = path.resolve(import.meta.dirname, '..')
const chartPath = path.join(rootDir, 'docs/bench.chart.txt')
const outputPath = path.join(rootDir, 'docs/bench.png')
const fontPath = path.join(import.meta.dirname, 'assets/iosevka-regular.woff2')

const FOREGROUND = 'whiteBright'

// The output is piped to freeze, so force truecolor past ansis' TTY detection.
const ansis = new Ansis(3)

const chart = await fsp.readFile(chartPath, 'utf-8')

const freeze = spawnSync('freeze', [
  '-',
  '--language',
  'ansi',
  '--font.file',
  fontPath,
  '--line-height',
  '1.6',
  // Asymmetric bottom padding – freeze stacks the line-height leading below
  // each line, so the last row already carries most of the gap.
  '--padding',
  '16,24,2,24',
  '--margin',
  '24',
  '--border.radius',
  '12',
  '--border.width',
  '1',
  '--shadow.blur',
  '20',
  '--shadow.y',
  '10',
  '--output',
  outputPath,
], { input: toAnsi(chart), stdio: ['pipe', 'inherit', 'inherit'] })

if (freeze.error) {
  if ((freeze.error as NodeJS.ErrnoException).code === 'ENOENT') {
    console.error('freeze not found. Install it with: brew install charmbracelet/tap/freeze')
    process.exit(1)
  }
  throw freeze.error
}
if (freeze.status !== 0)
  process.exit(freeze.status ?? 1)

function toAnsi(markedText: string): string {
  const defaultForeground = styleFor(FOREGROUND).open

  // freeze resets the ANSI state at every line break, so the default
  // foreground must reopen per line, not once per file.
  const lines = markedText.trimEnd().split('\n').map(line => defaultForeground + line.replace(
    /\[([^\]/][^\]]*)\](.*?)\[\/\]/g,
    (_, style: string, text: string) => `${styleFor(style)(text)}${defaultForeground}`,
  ))

  return `${lines.join('\n')}\x1B[0m`
}

function styleFor(style: string): Ansis {
  return style.trim().split(/\s+/).reduce<Ansis>((chainedStyle, token) => {
    if (token.startsWith('#'))
      return chainedStyle.hex(token)
    if (/^\d+$/.test(token))
      return chainedStyle.fg(Number(token))

    const nextStyle = (chainedStyle as unknown as Record<string, Ansis>)[token]
    if (typeof nextStyle !== 'function' || typeof nextStyle.open !== 'string')
      throw new TypeError(`Unknown style token "${token}" in ${chartPath}`)
    return nextStyle
  }, ansis)
}
