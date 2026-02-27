/**
 * Import Lahman baseball database into Supabase.
 *
 * Usage: npx tsx scripts/import-lahman.ts
 *
 * Fetches CSVs from chadwickbureau/baseballdatabank on GitHub,
 * plus the Chadwick register for lahman_id <-> mlb_id crosswalk.
 */

import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const LAHMAN_CORE = 'https://raw.githubusercontent.com/cbwinslow/baseballdatabank/master/core'
const LAHMAN_CONTRIB = 'https://raw.githubusercontent.com/cbwinslow/baseballdatabank/master/contrib'
const REGISTER_BASE = 'https://raw.githubusercontent.com/chadwickbureau/register/master/data'
const REGISTER_SHARDS = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f']

const BATCH_SIZE = 500

async function fetchCSV(url: string): Promise<any[]> {
  console.log(`  Fetching ${url.split('/').pop()}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const text = await res.text()
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true })
}

function int(v: string | undefined): number | null {
  if (!v || v === '') return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

function real(v: string | undefined): number | null {
  if (!v || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function str(v: string | undefined): string | null {
  return v && v !== '' ? v : null
}

function dateStr(y: string | undefined, m: string | undefined, d: string | undefined): string | null {
  const year = int(y)
  const month = int(m)
  const day = int(d)
  if (!year) return null
  return `${year}-${String(month || 1).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`
}

async function batchUpsert(table: string, rows: any[], conflictCols: string) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictCols, ignoreDuplicates: false })
    if (error) {
      console.error(`  Error in ${table} batch ${i}: ${error.message}`)
      // Try individual inserts for debugging
      for (const row of batch) {
        const { error: rowErr } = await supabase.from(table).upsert(row, { onConflict: conflictCols, ignoreDuplicates: true })
        if (rowErr) console.error(`    Row error (${JSON.stringify(row).slice(0, 100)}): ${rowErr.message}`)
        else inserted++
      }
    } else {
      inserted += batch.length
    }
    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  ${table}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
    }
  }
  console.log(`  ${table}: ${inserted} rows upserted`)
}

async function main() {
  console.log('=== Lahman Database Import ===\n')

  // Step 1: Build crosswalk from Chadwick register (sharded files)
  console.log('1. Building crosswalk from Chadwick register...')
  const bbrefToMlb: Record<string, number> = {}
  for (const shard of REGISTER_SHARDS) {
    try {
      const register = await fetchCSV(`${REGISTER_BASE}/people-${shard}.csv`)
      for (const row of register) {
        const bbref = str(row.key_bbref)
        const mlb = int(row.key_mlbam)
        if (bbref && mlb) bbrefToMlb[bbref] = mlb
      }
    } catch (e: any) {
      console.log(`  Skipping shard ${shard}: ${e.message}`)
    }
  }
  console.log(`  Crosswalk: ${Object.keys(bbrefToMlb).length} bbref->mlb mappings\n`)

  // Step 2: Import People
  console.log('2. Importing People...')
  const people = await fetchCSV(`${LAHMAN_CORE}/People.csv`)
  const peopleRows = people.map(r => ({
    lahman_id: r.playerID,
    mlb_id: bbrefToMlb[r.playerID] || null,
    bbref_id: str(r.bbrefID) || r.playerID,
    retro_id: str(r.retroID),
    name_first: str(r.nameFirst),
    name_last: str(r.nameLast),
    name_given: str(r.nameGiven),
    birth_year: int(r.birthYear),
    birth_month: int(r.birthMonth),
    birth_day: int(r.birthDay),
    birth_country: str(r.birthCountry),
    birth_state: str(r.birthState),
    birth_city: str(r.birthCity),
    death_year: int(r.deathYear),
    weight: int(r.weight),
    height: int(r.height),
    bats: str(r.bats),
    throws: str(r.throws),
    debut: str(r.debut),
    final_game: str(r.finalGame),
  }))
  await batchUpsert('lahman_people', peopleRows, 'lahman_id')
  console.log(`  People: ${peopleRows.length} total\n`)

  // Step 3: Import Batting
  console.log('3. Importing Batting...')
  const batting = await fetchCSV(`${LAHMAN_CORE}/Batting.csv`)
  const battingRows = batting.map(r => ({
    lahman_id: r.playerID,
    year: int(r.yearID)!,
    stint: int(r.stint) || 1,
    team_id: str(r.teamID),
    lg_id: str(r.lgID),
    g: int(r.G), ab: int(r.AB), r: int(r.R), h: int(r.H),
    doubles: int(r['2B']), triples: int(r['3B']), hr: int(r.HR),
    rbi: int(r.RBI), sb: int(r.SB), cs: int(r.CS),
    bb: int(r.BB), so: int(r.SO), ibb: int(r.IBB),
    hbp: int(r.HBP), sh: int(r.SH), sf: int(r.SF), gidp: int(r.GIDP),
  })).filter(r => r.lahman_id && r.year)
  await batchUpsert('lahman_batting', battingRows, 'lahman_id,year,stint')
  console.log(`  Batting: ${battingRows.length} total\n`)

  // Step 4: Import Pitching
  console.log('4. Importing Pitching...')
  const pitching = await fetchCSV(`${LAHMAN_CORE}/Pitching.csv`)
  const pitchingRows = pitching.map(r => ({
    lahman_id: r.playerID,
    year: int(r.yearID)!,
    stint: int(r.stint) || 1,
    team_id: str(r.teamID),
    lg_id: str(r.lgID),
    w: int(r.W), l: int(r.L), g: int(r.G), gs: int(r.GS),
    cg: int(r.CG), sho: int(r.SHO), sv: int(r.SV),
    ipouts: int(r.IPouts), h: int(r.H), er: int(r.ER), hr: int(r.HR),
    bb: int(r.BB), so: int(r.SO), era: real(r.ERA),
    ibb: int(r.IBB), wp: int(r.WP), hbp: int(r.HBP), bk: int(r.BK),
    bfp: int(r.BFP), gf: int(r.GF), r: int(r.R),
    sh: int(r.SH), sf: int(r.SF), gidp: int(r.GIDP),
  })).filter(r => r.lahman_id && r.year)
  await batchUpsert('lahman_pitching', pitchingRows, 'lahman_id,year,stint')
  console.log(`  Pitching: ${pitchingRows.length} total\n`)

  // Step 5: Import Fielding
  console.log('5. Importing Fielding...')
  const fielding = await fetchCSV(`${LAHMAN_CORE}/Fielding.csv`)
  const fieldingRows = fielding.map(r => ({
    lahman_id: r.playerID,
    year: int(r.yearID)!,
    stint: int(r.stint) || 1,
    team_id: str(r.teamID),
    lg_id: str(r.lgID),
    pos: str(r.POS),
    g: int(r.G), gs: int(r.GS),
    inn_outs: int(r.InnOuts),
    po: int(r.PO), a: int(r.A), e: int(r.E), dp: int(r.DP),
  })).filter(r => r.lahman_id && r.year)
  await batchUpsert('lahman_fielding', fieldingRows, 'lahman_id,year,stint,pos')
  console.log(`  Fielding: ${fieldingRows.length} total\n`)

  // Step 6: Import Awards
  console.log('6. Importing Awards...')
  const awards = await fetchCSV(`${LAHMAN_CONTRIB}/AwardsPlayers.csv`)
  const awardsRows = awards.map(r => ({
    lahman_id: r.playerID,
    award_id: r.awardID,
    year: int(r.yearID)!,
    lg_id: str(r.lgID) || 'ML',
    notes: str(r.notes),
  })).filter(r => r.lahman_id && r.award_id && r.year)
  await batchUpsert('lahman_awards', awardsRows, 'lahman_id,award_id,year,lg_id')
  console.log(`  Awards: ${awardsRows.length} total\n`)

  // Step 7: Import AllStars
  console.log('7. Importing AllStars...')
  const allstars = await fetchCSV(`${LAHMAN_CORE}/AllstarFull.csv`)
  const allstarRows = allstars.map(r => ({
    lahman_id: r.playerID,
    year: int(r.yearID)!,
    lg_id: str(r.lgID) || 'ML',
    team_id: str(r.teamID),
  })).filter(r => r.lahman_id && r.year)
  await batchUpsert('lahman_allstars', allstarRows, 'lahman_id,year,lg_id')
  console.log(`  AllStars: ${allstarRows.length} total\n`)

  // Step 8: Import Hall of Fame
  console.log('8. Importing Hall of Fame...')
  const hof = await fetchCSV(`${LAHMAN_CONTRIB}/HallOfFame.csv`)
  const hofRows = hof.map(r => ({
    lahman_id: r.playerID,
    year: int(r.yearid || r.yearID)!,
    voted_by: str(r.votedBy) || 'Unknown',
    ballots: int(r.ballots),
    needed: int(r.needed),
    votes: int(r.votes),
    inducted: str(r.inducted),
    category: str(r.category),
  })).filter(r => r.lahman_id && r.year)
  await batchUpsert('lahman_halloffame', hofRows, 'lahman_id,year,voted_by')
  console.log(`  HallOfFame: ${hofRows.length} total\n`)

  // Step 9: Backfill players.lahman_id
  console.log('9. Backfilling players.lahman_id...')
  const { data: playersWithMlb, error: pErr } = await supabase
    .from('lahman_people')
    .select('lahman_id, mlb_id')
    .not('mlb_id', 'is', null)
  if (pErr) {
    console.error('  Error fetching crosswalk:', pErr.message)
  } else if (playersWithMlb) {
    let updated = 0
    for (let i = 0; i < playersWithMlb.length; i += BATCH_SIZE) {
      const batch = playersWithMlb.slice(i, i + BATCH_SIZE)
      for (const p of batch) {
        const { error } = await supabase
          .from('players')
          .update({ lahman_id: p.lahman_id })
          .eq('id', p.mlb_id)
        if (!error) updated++
      }
      if ((i + BATCH_SIZE) % 2000 === 0) console.log(`  Backfill: ${Math.min(i + BATCH_SIZE, playersWithMlb.length)}/${playersWithMlb.length}`)
    }
    console.log(`  Backfilled ${updated} players\n`)
  }

  console.log('=== Import Complete ===')
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1) })
