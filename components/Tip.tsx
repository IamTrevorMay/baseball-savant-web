'use client'
import { getTip } from '@/lib/glossary'

/** CSS-only tooltip wrapper for table column headers.
 *  Pass `col` (DB column name) and/or `label` (display text) — whichever resolves first wins. */
export default function Tip({ label, col }: { label: string; col?: string }) {
  const tip = (col && getTip(col)) || getTip(label)
  if (!tip) return <>{label}</>
  return (
    <span className="group/tip relative cursor-help">
      {label}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 hidden group-hover/tip:block bg-zinc-700 text-zinc-200 text-[10px] font-normal normal-case tracking-normal px-2.5 py-1.5 rounded shadow-lg whitespace-normal max-w-[220px] leading-snug border border-zinc-600">
        {tip}
      </span>
    </span>
  )
}
