import type { ChartOptions, TooltipItem } from 'chart.js'

const MB = 1024 * 1024
const GB = 1024 * 1024 * 1024

export function formatBytesScaled(bytes: number): string {
  if (!bytes || bytes < 0) return '0 MB'
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`
  return `${(bytes / MB).toFixed(2)} MB`
}

const BASE_LINE: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false } } },
}

const BASE_BAR: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: { display: false } } },
}

export const lineChartOptions: ChartOptions<'line'> = { ...BASE_LINE }

export const barChartOptions: ChartOptions<'bar'> = { ...BASE_BAR }

export const percentLineOptions: ChartOptions<'line'> = {
  ...BASE_LINE,
  scales: {
    x: { grid: { display: false } },
    y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'line'>) =>
          ctx.parsed.y == null ? '' : `${ctx.parsed.y.toFixed(1)}%`,
      },
    },
  },
}

export const durationLineOptions: ChartOptions<'line'> = {
  ...BASE_LINE,
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, ticks: { callback: (v) => `${v}s` } },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'line'>) =>
          ctx.parsed.y == null ? '' : `${Math.round(ctx.parsed.y)}s`,
      },
    },
  },
}

export const bytesBarOptions: ChartOptions<'bar'> = {
  ...BASE_BAR,
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, ticks: { callback: (v) => formatBytesScaled(Number(v)) } },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) =>
          ctx.parsed.y == null ? '' : formatBytesScaled(ctx.parsed.y),
      },
    },
  },
}

export const stackedBarOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: true, position: 'bottom' } },
  scales: {
    x: { stacked: true, grid: { display: false } },
    y: { stacked: true, beginAtZero: true },
  },
}

export const ratingLineOptions: ChartOptions<'line'> = {
  ...BASE_LINE,
  scales: {
    x: { grid: { display: false } },
    y: { min: 0, max: 10 },
  },
}

export const dualLineOptions: ChartOptions<'line'> = {
  ...BASE_LINE,
  plugins: { legend: { display: true, position: 'bottom' } },
  scales: {
    x: { grid: { display: false } },
    y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
  },
}

export const doughnutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'right' },
  },
}
