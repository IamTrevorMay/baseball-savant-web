// Seed assessment_norms from the metric registry (v1 / OpenBiomechanics stand-in).
// Emits an idempotent upsert SQL to stdout. Run: npx tsx scripts/seed-assessment-norms.ts
// Re-runnable — swap the registry values for in-house percentiles later and re-seed.

import { buildNormRows } from '../lib/mechanics/norms'

const rows = buildNormRows()
const esc = (s: unknown) => `'${String(s).replace(/'/g, "''")}'`
const num = (n: unknown) => (n === null || n === undefined ? 'null' : String(n))
const bool = (b: unknown) => (b ? 'true' : 'false')

const values = rows.map(r =>
  `(${esc(r.metric)}, ${esc(r.label)}, ${esc(r.level)}, ${esc(r.unit)}, ` +
  `${num(r.pctl_10)}, ${num(r.pctl_25)}, ${num(r.pctl_50)}, ${num(r.pctl_75)}, ${num(r.pctl_90)}, ` +
  `${bool(r.higher_is_better)}, ${num(r.correlation_to_velo)}, ${bool(r.directional)}, ${esc(r.source)})`
).join(',\n')

console.log(`insert into public.assessment_norms
  (metric, label, level, unit, pctl_10, pctl_25, pctl_50, pctl_75, pctl_90,
   higher_is_better, correlation_to_velo, directional, source)
values
${values}
on conflict (metric, level, source) do update set
  label = excluded.label, unit = excluded.unit,
  pctl_10 = excluded.pctl_10, pctl_25 = excluded.pctl_25, pctl_50 = excluded.pctl_50,
  pctl_75 = excluded.pctl_75, pctl_90 = excluded.pctl_90,
  higher_is_better = excluded.higher_is_better,
  correlation_to_velo = excluded.correlation_to_velo,
  directional = excluded.directional;`)
