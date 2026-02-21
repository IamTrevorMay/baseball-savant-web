'use client'
import PitchMovement from '../charts/PitchMovement'
import ReleasePoint from '../charts/ReleasePoint'
import ArmAngleBreak from '../charts/ArmAngleBreak'
import SpinVsVelo from '../charts/SpinVsVelo'

export default function MovementTab({ data }: { data: any[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <PitchMovement data={data} />
      </div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <ReleasePoint data={data} />
      </div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <SpinVsVelo data={data} />
      </div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <ArmAngleBreak data={data} />
      </div>
    </div>
  )
}
