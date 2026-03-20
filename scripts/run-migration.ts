/**
 * Run the cluster R/L migration via run_mutation RPC.
 * Usage: npx tsx scripts/run-migration.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=["']?([^"'\n]*)["']?$/)
  if (match) process.env[match[1]] = match[2]
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('Running migration: add cluster R/L columns...')

  const statements = [
    `ALTER TABLE pitcher_season_command ADD COLUMN IF NOT EXISTS avg_cluster_r numeric`,
    `ALTER TABLE pitcher_season_command ADD COLUMN IF NOT EXISTS avg_cluster_l numeric`,
    `ALTER TABLE pitcher_season_command ADD COLUMN IF NOT EXISTS cluster_r_plus numeric`,
    `ALTER TABLE pitcher_season_command ADD COLUMN IF NOT EXISTS cluster_l_plus numeric`,
  ]

  for (const sql of statements) {
    const { error } = await supabase.rpc('run_mutation', { query_text: sql })
    if (error) {
      console.error('Migration error:', error.message)
      console.error('SQL:', sql)
      return
    }
    console.log('  OK:', sql.slice(0, 80))
  }

  console.log('Migration complete!')
}

main().catch(console.error)
