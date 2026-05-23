import { http } from './client'

export interface MigrationItem {
  id: string
  filename: string
  applied: boolean
  applied_at: string | null
}

export interface MigrationsResponse {
  migrations: MigrationItem[]
}

export interface RunMigrationResponse {
  migration_id: string
  dry_run: boolean
  sql_preview: string
  statements: number
  applied?: boolean
}

export async function listMigrations(): Promise<MigrationsResponse> {
  const { data } = await http.get<MigrationsResponse>('/api/migrations/')
  return data
}

export async function runMigration(
  id: string,
  dryRun: boolean = true,
): Promise<RunMigrationResponse> {
  const { data } = await http.post<RunMigrationResponse>(
    `/api/migrations/${encodeURIComponent(id)}/run`,
    { dry_run: dryRun },
  )
  return data
}
