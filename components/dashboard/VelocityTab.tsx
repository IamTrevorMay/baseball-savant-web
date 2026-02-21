'use client'
import VelocityDistribution from '../charts/VelocityDistribution'
import RollingAverages from '../charts/RollingAverages'

export default function VelocityTab({ data }: { data: any[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <VelocityDistribution data={data} />
      </div>
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
        <RollingAverages data={data} />
      </div>
    </div>
  )
}
