import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { encode } from 'gpt-tokenizer/encoding/o200k_base'
import { estimateTokenCount } from '../src/index.ts'
import { BENCHMARK_SAMPLES, MAX_SAMPLE_DEVIATION, readSampleText } from '../test/fixtures/samples.ts'

const benchPath = path.resolve(import.meta.dirname, '../docs/bench.md')
const chartPath = path.resolve(import.meta.dirname, '../docs/bench.chart.txt')
const packageJson = JSON.parse(await fsp.readFile(path.resolve(import.meta.dirname, '../package.json'), 'utf-8'))

const BAR_CELLS_PER_SIDE = 10
const PERCENT_PER_BAR_CELL = MAX_SAMPLE_DEVIATION / BAR_CELLS_PER_SIDE

/** Wraps an already laid-out span in an ansis style, so padding never counts markers */
type Paint = (text: string, style: string) => string

const plainPaint: Paint = text => text
const markerPaint: Paint = (text, style) => `[${style}]${text}[/]`

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
${renderDeviationChart(measurements, plainPaint)}
\`\`\`
`.trimStart()

console.log(benchMarkdown)

await fsp.writeFile(benchPath, benchMarkdown, 'utf-8')
await fsp.writeFile(chartPath, `${renderDeviationChart(measurements, markerPaint, repoSlug())}\n`, 'utf-8')

function renderDeviationChart(measurements: SampleMeasurement[], paint: Paint, footerLink = ''): string {
  const labelWidth = Math.max(...measurements.map(measurement => measurement.description.length))
  const countWidth = Math.max(...measurements.map(measurement => Math.max(
    formatCount(measurement.referenceTokenCount).length,
    formatCount(measurement.estimatedTokenCount).length,
  )))

  const rows = measurements.map((measurement) => {
    const label = measurement.description.padEnd(labelWidth)
    const counts = `${formatCount(measurement.referenceTokenCount).padStart(countWidth)} → ${formatCount(measurement.estimatedTokenCount).padStart(countWidth)}`

    return `${label}  ${paint(counts, '245')}   ${renderDeviationBar(measurement.signedDeviation, paint)}  ${formatSignedPercent(measurement.signedDeviation)}`
  })

  const barColumnOffset = labelWidth + 2 + (countWidth * 2 + 3) + 3
  const axisHeader = paint(`${' '.repeat(barColumnOffset)}${'under ◂'.padStart(BAR_CELLS_PER_SIDE)}·▸ over`, '245')
  const barWidth = BAR_CELLS_PER_SIDE * 2 + 1
  const meanSeparator = paint(`${' '.repeat(barColumnOffset)}${'─'.repeat(barWidth)}`, 'black')

  const meanValue = `${meanDeviation.toFixed(2)}%`.padStart(2 + 8)
  const footerPadding = ' '.repeat(barColumnOffset + barWidth - 'mean'.length - footerLink.length)
  const footerRow = `${footerLink ? paint(footerLink, 'gray') : ''}${footerPadding}${paint('mean', '245')}${meanValue}`

  return [axisHeader, ...rows, meanSeparator, footerRow].join('\n')
}

function formatCount(tokenCount: number): string {
  return tokenCount.toLocaleString('en-US')
}

function renderDeviationBar(signedDeviation: number, paint: Paint): string {
  const cellCount = Math.min(BAR_CELLS_PER_SIDE, Math.round(Math.abs(signedDeviation) / PERCENT_PER_BAR_CELL))
  const leftCells = signedDeviation < 0 ? cellCount : 0
  const rightCells = signedDeviation > 0 ? cellCount : 0

  return `${'█'.repeat(leftCells).padStart(BAR_CELLS_PER_SIDE)}${paint('│', 'black')}${'█'.repeat(rightCells).padEnd(BAR_CELLS_PER_SIDE)}`
}

function formatSignedPercent(signedDeviation: number): string {
  const magnitude = Math.abs(signedDeviation).toFixed(2)
  const sign = Number(magnitude) === 0 ? ' ' : signedDeviation > 0 ? '+' : '-'

  return `${sign}${magnitude}%`.padStart(8)
}

function repoSlug(): string {
  const homepage = new URL(packageJson.homepage)
  return `${homepage.host}${homepage.pathname}`
}
