'use client'
import StrikeZoneHeatmap from '../charts/StrikeZoneHeatmap'
import WhiffByZone from '../charts/WhiffByZone'

export default function LocationTab({ data }: { data: any[] }) {
  const pitchTypes = [...new Set(data.map(d => d.pitch_name).filter(Boolean))].sort()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <StrikeZoneHeatmap data={data} />
        </div>
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <WhiffByZone data={data} />
        </div>
      </div>
      {/* Per pitch type zones */}
      <h3 className="text-sm font-semibold text-zinc-400">By Pitch Type</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pitchTypes.map(pt => (
          <div key={pt} className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h4 className="text-xs text-zinc-400 mb-2 font-medium">{pt}</h4>
            <StrikeZoneHeatmap data={data.filter(d => d.pitch_name === pt)} />
          </div>
        ))}
      </div>
    </div>
  )
}
