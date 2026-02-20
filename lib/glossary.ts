import { supabase } from './supabase'

export interface GlossaryEntry {
  column_name: string
  display_name: string
  description: string | null
}

let glossaryCache: Record<string, GlossaryEntry> = {}

export async function loadGlossary() {
  if (Object.keys(glossaryCache).length > 0) return glossaryCache
  const { data } = await supabase.from('glossary').select('*')
  if (data) {
    data.forEach((entry: GlossaryEntry) => {
      glossaryCache[entry.column_name] = entry
    })
  }
  return glossaryCache
}

export function colName(col: string): string {
  return glossaryCache[col]?.display_name || col
}

export function colDesc(col: string): string {
  return glossaryCache[col]?.description || ''
}
