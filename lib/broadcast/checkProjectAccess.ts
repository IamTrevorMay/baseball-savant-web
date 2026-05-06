import { supabaseAdmin } from '@/lib/supabase/admin'
import type { ProjectAccessLevel } from '@/lib/broadcastTypes'
import { isSystemAdmin } from '@/lib/isSystemAdmin'

/**
 * Determine a user's access level for a broadcast project.
 * Returns 'owner' | 'producer' | 'viewer' | 'none'.
 */
export async function checkProjectAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccessLevel> {
  // System admins (owner/admin role in profiles) get producer-level access everywhere
  if (await isSystemAdmin(userId)) return 'producer'

  // Check project ownership
  const { data: project } = await supabaseAdmin
    .from('broadcast_projects')
    .select('user_id')
    .eq('id', projectId)
    .single()

  if (!project) return 'none'
  if (project.user_id === userId) return 'owner'

  // Check membership
  const { data: member } = await supabaseAdmin
    .from('broadcast_project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()

  if (member) return member.role as ProjectAccessLevel
  return 'none'
}

/** Returns true if the access level allows editing (owner or producer). */
export function canEdit(level: ProjectAccessLevel): boolean {
  return level === 'owner' || level === 'producer'
}

/**
 * Resolve project_id from an entity row (scene, asset, scene-asset, etc.)
 * by looking up the entity's table.
 */
export async function resolveProjectId(
  table: 'broadcast_scenes' | 'broadcast_assets' | 'broadcast_scene_assets' | 'broadcast_clip_markers',
  entityId: string,
): Promise<string | null> {
  if (table === 'broadcast_scene_assets') {
    // scene-assets link to scenes, which link to projects
    const { data: sa } = await supabaseAdmin
      .from('broadcast_scene_assets')
      .select('scene_id')
      .eq('id', entityId)
      .single()
    if (!sa) return null
    const { data: scene } = await supabaseAdmin
      .from('broadcast_scenes')
      .select('project_id')
      .eq('id', sa.scene_id)
      .single()
    return scene?.project_id ?? null
  }

  if (table === 'broadcast_clip_markers') {
    const { data: marker } = await supabaseAdmin
      .from('broadcast_clip_markers')
      .select('project_id')
      .eq('id', entityId)
      .single()
    return marker?.project_id ?? null
  }

  // broadcast_scenes and broadcast_assets have project_id directly
  const { data } = await supabaseAdmin
    .from(table)
    .select('project_id')
    .eq('id', entityId)
    .single()
  return data?.project_id ?? null
}
