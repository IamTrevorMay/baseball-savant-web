/**
 * Central roles + access model for Triton Apex.
 *
 * `profiles.role` is the single source of truth for a user's role. Tool access
 * is then resolved from the role plus any explicit `tool_permissions` grants:
 *
 *   - owner / admin  → all tools (all-access, no grants needed)
 *   - athlete        → Compete only (implicit, no grants needed); locked out of
 *                      the launcher and every other app
 *   - user           → exactly the tools granted in `tool_permissions`
 *
 * This module is the one place that encodes those rules so layouts, the
 * launcher, `/api/me`, and the admin UI stay in sync.
 */

export type AppRole = 'owner' | 'admin' | 'user' | 'athlete'

/** Roles selectable when inviting/editing a user, in display order. */
export const ASSIGNABLE_ROLES: AppRole[] = ['user', 'athlete', 'admin', 'owner']

/** Every tool id an all-access (owner/admin) user can reach. */
export const ALL_TOOLS = [
  'research', 'mechanics', 'models', 'compete', 'visualize', 'work', 'design', 'data',
] as const

/** Tools an athlete is scoped to. Athletes only ever see Compete. */
export const ATHLETE_TOOLS = ['compete'] as const

/** owner/admin have full access to every tool. */
export function isAdminRole(role?: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

/** Athlete = Compete-only, launcher-less role. */
export function isAthleteRole(role?: string | null): boolean {
  return role === 'athlete'
}

/**
 * Resolve the effective tool permissions for a user, given their role and any
 * explicit `tool_permissions` grants. Role-derived access (admin all-access,
 * athlete Compete-only) takes precedence over grants.
 */
export function resolvePermissions(role: string | null | undefined, grants: string[]): string[] {
  if (isAdminRole(role)) return [...ALL_TOOLS]
  if (isAthleteRole(role)) return [...ATHLETE_TOOLS]
  return grants
}

/**
 * Roles whose tool access is implicit (derived from the role) rather than from
 * `tool_permissions` rows. The admin UI hides the tool toggles for these and
 * never writes grant rows for them.
 */
export function hasImplicitTools(role?: string | null): boolean {
  return isAdminRole(role) || isAthleteRole(role)
}

/**
 * Where a role should land at the launcher root ("/"). Athletes are bounced
 * straight into Compete; everyone else gets the normal launcher grid.
 */
export function roleLandingPath(role?: string | null): string | null {
  if (isAthleteRole(role)) return '/compete'
  return null
}
