import { http } from './client'

export interface StatsSummary {
  total_runs: number
  success_rate: number | null
  avg_duration_seconds: number | null
  total_movies: number
  total_torrents: number
  total_pikpak: number
  total_dedup_freed_bytes: number
  proxy_bans_last_7d: number
}

export interface TrendDataPoint {
  date: string
  value: number
}

export interface TrendResponse {
  metric: string
  period: string
  data_points: TrendDataPoint[]
}

export interface DistributionBucket {
  label: string
  value: number
}

export interface DistributionResponse {
  metric: string
  period: string
  buckets: DistributionBucket[]
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const { data } = await http.get<StatsSummary>('/api/stats/summary')
  return data
}

export async function getStatsTrend(
  metric: string,
  period: string = '30d',
): Promise<TrendResponse> {
  const { data } = await http.get<TrendResponse>('/api/stats/trend', {
    params: { metric, period },
  })
  return data
}

export async function getStatsDistribution(
  metric: string,
  period: string = '30d',
): Promise<DistributionResponse> {
  const { data } = await http.get<DistributionResponse>('/api/stats/distribution', {
    params: { metric, period },
  })
  return data
}
