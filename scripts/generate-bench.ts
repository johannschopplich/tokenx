import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { estimateTokenCount } from '../src/index.ts'
import { BENCHMARK_SAMPLES, MAX_SAMPLE_DEVIATION, readSampleText } from '../test/fixtures/samples.ts'

const benchPath = path.resolve(import.meta.dirname, '../docs/bench.md')

const BAR_CELLS_PER_SIDE = 10
const PERCENT_PER_BAR_CELL = MAX_SAMPLE_DEVIATION / BAR_CELLS_PER_SIDE

interface SampleMeasurement {
  description: string
  referenceTokenCount: number
  estimatedTokenCount: number
  /** Positive when tokenx overestimates, negative when it underestimates */
  signedDeviation: number
}

const measurements: SampleMeasurement[] = []

for (const sample of BENCHMARK_SAMPLES) {
  const text = await readSampleText(sample)
  const referenceTokenCount = encode(text).length
  const estimatedTokenCount = estimateTokenCount(text)

  measurements.push({
    description: sample.description,
    referenceTokenCount,
    estimatedTokenCount,
    signedDeviation: ((estimatedTokenCount - referenceTokenCount) / referenceTokenCount) * 100,
  })
}

const meanDeviation = measurements.reduce(
  (sum, measurement) => sum + Math.abs(measurement.signedDeviation),
  0,
) / measurements.length

const benchMarkdown = `
Bars grow left when tokenx underestimates and right when it overestimates; the axis spans the ±${MAX_SAMPLE_DEVIATION}% per-sample deviation bound enforced in CI.

\`\`\`
${renderDeviationChart(measurements)}
\`\`\`

Mean deviation across all samples: **${meanDeviation.toFixed(2)}%**
`.trimStart()

console.log(benchMarkdown)

await fsp.writeFile(benchPath, benchMarkdown, 'utf-8')

function renderDeviationChart(measurements: SampleMeasurement[]): string {
  const labelWidth = Math.max(...measurements.map(measurement => displayWidth(measurement.description)))
  const countWidth = Math.max(...measurements.map(measurement => Math.max(
    formatCount(measurement.referenceTokenCount).length,
    formatCount(measurement.estimatedTokenCount).length,
  )))

  const rows = measurements.map((measurement) => {
    const label = measurement.description + ' '.repeat(labelWidth - displayWidth(measurement.description))
    const counts = `${formatCount(measurement.referenceTokenCount).padStart(countWidth)} → ${formatCount(measurement.estimatedTokenCount).padStart(countWidth)}`

    return `${label}  ${counts}   ${renderDeviationBar(measurement.signedDeviation)}  ${formatSignedPercent(measurement.signedDeviation)}`
  })

  const barColumnOffset = labelWidth + 2 + (countWidth * 2 + 3) + 3
  const axisHeader = `${' '.repeat(barColumnOffset)}${'under ◂'.padStart(BAR_CELLS_PER_SIDE)}·▸ over`

  return [axisHeader, ...rows].join('\n')
}

function renderDeviationBar(signedDeviation: number): string {
  const cellCount = Math.min(BAR_CELLS_PER_SIDE, Math.round(Math.abs(signedDeviation) / PERCENT_PER_BAR_CELL))
  const leftCells = signedDeviation < 0 ? cellCount : 0
  const rightCells = signedDeviation > 0 ? cellCount : 0

  return `${'█'.repeat(leftCells).padStart(BAR_CELLS_PER_SIDE)}│${'█'.repeat(rightCells).padEnd(BAR_CELLS_PER_SIDE)}`
}

function formatSignedPercent(signedDeviation: number): string {
  const magnitude = Math.abs(signedDeviation).toFixed(2)
  const sign = Number(magnitude) === 0 ? ' ' : signedDeviation > 0 ? '+' : '-'

  return `${sign}${magnitude}%`.padStart(8)
}

function formatCount(tokenCount: number): string {
  return tokenCount.toLocaleString('en-US')
}

// CJK glyphs occupy two monospace columns – count them double so the corpus
// titles (道德經, 羅生門) align with the Latin ones
function displayWidth(text: string): number {
  let width = 0

  for (const character of text) {
    const codePoint = character.codePointAt(0)!
    const isWideGlyph
      = (codePoint >= 0x2E80 && codePoint <= 0x9FFF)
        || (codePoint >= 0xAC00 && codePoint <= 0xD7A3)
        || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
        || (codePoint >= 0xFF00 && codePoint <= 0xFF60)
    width += isWideGlyph ? 2 : 1
  }

  return width
}
