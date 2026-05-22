'use client'
import Link from 'next/link'
import MobileWorkShell from './MobileWorkShell'

export default function MobileWorkDashboard() {
  return (
    <MobileWorkShell title="Work">
      <div className="p-4 space-y-3">
        <Link href="/work/myboard" className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">My Board</div>
          <div className="text-lg text-sky-300 font-semibold mt-1">Today's tasks →</div>
        </Link>
        <Link href="/work/athletes" className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Athletes</div>
          <div className="text-lg text-emerald-300 font-semibold mt-1">Pipeline →</div>
        </Link>
        <Link href="/work/sprints" className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Sprint</div>
          <div className="text-lg text-indigo-300 font-semibold mt-1">This week →</div>
        </Link>
        <Link href="/work/calendar" className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Calendar</div>
          <div className="text-lg text-rose-300 font-semibold mt-1">Upcoming →</div>
        </Link>
        <Link href="/work/goals" className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Goals</div>
          <div className="text-lg text-amber-300 font-semibold mt-1">Targets →</div>
        </Link>
      </div>
    </MobileWorkShell>
  )
}
