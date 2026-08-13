/**
 * Validator for user-supplied SQL *expressions* (model formulas).
 *
 * These are interpolated into a SELECT list and executed through `run_query` on the
 * service_role client, which bypasses RLS — so the expression is a direct path to every
 * table in the database if it is not constrained.
 *
 * **This is an allowlist on purpose.** The previous guard was a keyword denylist
 * (`/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i` plus `--` and `;`)
 * which blocked writes but not reads: `(SELECT email FROM profiles LIMIT 1)` contains no
 * forbidden keyword, no comment and no semicolon, so it passed and returned the value in the
 * result set. A denylist cannot work here — every unlisted keyword is a bypass.
 *
 * The rule is inverted: every identifier in the expression must be a known numeric column or
 * a known-safe function. `select`, `from`, `union`, and every table name in the database are
 * rejected by not being on the list.
 */

/** Numeric columns of `pitches` that a formula may reference (subset of the route's BASE_COLUMNS). */
export const FORMULA_COLUMNS = new Set([
  'release_speed', 'effective_speed', 'release_spin_rate', 'spin_axis',
  'pfx_x', 'pfx_z', 'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'zone',
  'balls', 'strikes', 'outs_when_up', 'inning',
  'launch_speed', 'launch_angle', 'launch_speed_angle', 'hit_distance_sc',
  'release_extension', 'arm_angle', 'release_pos_x', 'release_pos_z',
  'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az',
  'bat_speed', 'swing_length', 'attack_angle', 'attack_direction', 'swing_path_tilt',
  'estimated_ba_using_speedangle', 'estimated_woba_using_speedangle',
  'estimated_slg_using_speedangle', 'woba_value', 'delta_run_exp',
  'at_bat_number', 'pitch_number', 'home_score', 'away_score',
  'n_thruorder_pitcher', 'hc_x', 'hc_y', 'stuff_plus',
  'game_year', 'game_pk', 'pitcher', 'batter',
])

/** Pure/scalar functions and operator keywords a formula may use. */
const ALLOWED_TOKENS = new Set([
  // math
  'abs', 'round', 'ceil', 'ceiling', 'floor', 'sqrt', 'power', 'pow', 'exp', 'ln', 'log',
  'mod', 'sign', 'trunc', 'greatest', 'least', 'degrees', 'radians', 'pi',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  // null handling
  'coalesce', 'nullif', 'is', 'null', 'not',
  // conditional + boolean
  'case', 'when', 'then', 'else', 'end', 'and', 'or', 'between', 'in',
  // casts we allow by name (via CAST(x AS numeric) or ::numeric)
  'cast', 'as', 'numeric', 'float', 'double', 'precision', 'int', 'integer', 'real',
  'true', 'false',
])

export type FormulaCheck = { ok: true } | { ok: false; error: string }

/**
 * Validate a formula expression.
 * @param raw        the user-supplied expression
 * @param extraCols  additional allowed identifiers (e.g. deployed model column names)
 */
export function validateFormula(raw: string, extraCols: Iterable<string> = []): FormulaCheck {
  const formula = String(raw ?? '').trim()

  if (!formula) return { ok: false, error: 'Formula is required.' }
  if (formula.length > 2000) return { ok: false, error: 'Formula is too long (max 2000 chars).' }

  // Structural rejects — statement breaks, comments, strings, dollar-quoting, casts to text.
  if (/;/.test(formula)) return { ok: false, error: 'Statement separators are not allowed.' }
  if (/--|\/\*|\*\//.test(formula)) return { ok: false, error: 'Comments are not allowed.' }
  if (/['"`]/.test(formula)) return { ok: false, error: 'String literals and quoted identifiers are not allowed.' }
  if (/\$/.test(formula)) return { ok: false, error: 'Dollar-quoting and parameters are not allowed.' }
  if (/\\/.test(formula)) return { ok: false, error: 'Escapes are not allowed.' }

  // Character allowlist: identifiers, digits, operators, parens, commas, dots, colons (::).
  if (/[^A-Za-z0-9_\s+\-*/%().,<>=!:]/.test(formula)) {
    return { ok: false, error: 'Formula contains unsupported characters.' }
  }

  // Balanced parentheses — an unbalanced expression can only break out of the SELECT list.
  let depth = 0
  for (const ch of formula) {
    if (ch === '(') depth++
    else if (ch === ')' && --depth < 0) return { ok: false, error: 'Unbalanced parentheses.' }
  }
  if (depth !== 0) return { ok: false, error: 'Unbalanced parentheses.' }

  // Identifier allowlist — this is what actually stops `(SELECT … FROM profiles)`.
  const extra = new Set(Array.from(extraCols, c => String(c).toLowerCase()))
  for (const m of formula.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const tok = m[0].toLowerCase()
    if (FORMULA_COLUMNS.has(tok) || ALLOWED_TOKENS.has(tok) || extra.has(tok)) continue
    return { ok: false, error: `Unknown identifier in formula: ${m[0]}` }
  }

  return { ok: true }
}
