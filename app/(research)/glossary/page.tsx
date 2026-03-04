'use client'
import { useState, useMemo } from 'react'
import ResearchNav from '@/components/ResearchNav'

interface Metric {
  name: string
  description: string
  formula?: string
}

interface Category {
  title: string
  metrics: Metric[]
}

const CATEGORIES: Category[] = [
  {
    title: 'Pitching — Velocity & Arsenal',
    metrics: [
      { name: 'Velo', description: 'Average release speed of the pitch in mph.' },
      { name: 'Max Velo', description: 'Peak release speed recorded for the pitch type in mph.' },
      { name: 'Spin', description: 'Spin rate measured at release in revolutions per minute (RPM).' },
      { name: 'Extension', description: 'Distance in feet from the pitching rubber at which the ball is released. Higher extension effectively shortens the perceived distance to the plate.' },
      { name: 'Arm Angle', description: 'The angle of the pitcher\'s arm slot at release, measured in degrees from horizontal. 0° = sidearm, 90° = directly overhead.' },
      { name: 'IVB', description: 'Induced Vertical Break — the vertical movement of the pitch due solely to spin, removing the effect of gravity. Measured in inches.', formula: 'pfx_z_in (inches)' },
      { name: 'HBreak', description: 'Horizontal break — the lateral movement of the pitch due to spin, measured in inches from the catcher\'s perspective.', formula: 'pfx_x_in (inches)' },
      { name: 'Usage%', description: 'Percentage of total pitches thrown that were this pitch type.' },
    ],
  },
  {
    title: 'Batting & Batted Ball',
    metrics: [
      { name: 'BA', description: 'Batting average — hits divided by at-bats.', formula: 'H / AB' },
      { name: 'OBP', description: 'On-base percentage — frequency a batter reaches base.', formula: '(H + BB + HBP) / (AB + BB + HBP + SF)' },
      { name: 'SLG', description: 'Slugging percentage — total bases divided by at-bats.', formula: 'Total Bases / AB' },
      { name: 'OPS', description: 'On-base plus slugging — sum of OBP and SLG.', formula: 'OBP + SLG' },
      { name: 'Avg EV', description: 'Average exit velocity on batted balls in mph.' },
      { name: 'Max EV', description: 'Peak exit velocity recorded in mph.' },
      { name: 'Avg LA', description: 'Average launch angle on batted balls in degrees.' },
      { name: 'Hard Hit%', description: 'Percentage of batted balls with exit velocity ≥ 95 mph.' },
      { name: 'Barrel%', description: 'Percentage of batted balls meeting the optimal exit velocity + launch angle combination for high-value outcomes.' },
      { name: 'GB%', description: 'Ground ball rate — percentage of batted balls classified as ground balls.' },
      { name: 'FB%', description: 'Fly ball rate — percentage of batted balls classified as fly balls.' },
      { name: 'LD%', description: 'Line drive rate — percentage of batted balls classified as line drives.' },
      { name: 'PU%', description: 'Pop-up rate — percentage of batted balls classified as pop-ups.' },
      { name: 'Avg Dist', description: 'Average projected distance of batted balls in feet.' },
      { name: 'Bat Speed', description: 'Speed of the bat at the point of contact, measured in mph.' },
      { name: 'Swing Length', description: 'Total length of the swing path from start to contact, measured in feet.' },
    ],
  },
  {
    title: 'Plate Discipline',
    metrics: [
      { name: 'K%', description: 'Strikeout rate — percentage of plate appearances ending in a strikeout.', formula: 'K / PA' },
      { name: 'BB%', description: 'Walk rate — percentage of plate appearances ending in a walk.', formula: 'BB / PA' },
      { name: 'K-BB%', description: 'Strikeout minus walk rate — a quick measure of a pitcher\'s command advantage.', formula: 'K% - BB%' },
      { name: 'Whiff%', description: 'Whiff rate — percentage of swings that result in a miss.', formula: 'Swings & Misses / Swings' },
      { name: 'SwStr%', description: 'Swinging strike rate — percentage of total pitches that are swinging strikes.', formula: 'Swings & Misses / Total Pitches' },
      { name: 'CSW%', description: 'Called strikes + whiffs rate — percentage of total pitches that are either called strikes or swinging strikes.', formula: '(Called Strikes + Whiffs) / Total Pitches' },
      { name: 'Zone%', description: 'Percentage of pitches thrown inside the strike zone.' },
      { name: 'Chase%', description: 'Percentage of pitches outside the zone that the batter swings at.' },
      { name: 'Contact%', description: 'Percentage of swings that result in contact.' },
      { name: 'Z-Swing%', description: 'Percentage of in-zone pitches that the batter swings at.' },
      { name: 'O-Contact%', description: 'Percentage of swings on pitches outside the zone that result in contact.' },
      { name: 'Swing%', description: 'Percentage of total pitches the batter swings at.' },
    ],
  },
  {
    title: 'Expected & Advanced',
    metrics: [
      { name: 'xBA', description: 'Expected batting average — predicted BA based on exit velocity and launch angle of each batted ball.' },
      { name: 'xSLG', description: 'Expected slugging — predicted SLG based on exit velocity and launch angle.' },
      { name: 'xwOBA', description: 'Expected weighted on-base average — predicted wOBA based on exit velocity, launch angle, and sprint speed.' },
      { name: 'wOBA', description: 'Weighted on-base average — offensive value metric that weights each outcome by its run value. Scale: league average ~.310–.320.' },
      { name: 'RE24', description: 'Run expectancy based on 24 base-out states — measures how a batter changes the expected runs in an inning.' },
      { name: 'ERA', description: 'Earned run average — earned runs allowed per nine innings pitched.', formula: '(ER / IP) × 9' },
      { name: 'FIP', description: 'Fielding independent pitching — estimates ERA based only on outcomes the pitcher controls (K, BB, HBP, HR).', formula: '(13×HR + 3×(BB+HBP) - 2×K) / IP + constant' },
      { name: 'xERA', description: 'Expected ERA — derived from quality of contact allowed (exit velocity, launch angle).' },
      { name: 'WHIP', description: 'Walks + hits per inning pitched — measures baserunners allowed.', formula: '(BB + H) / IP' },
    ],
  },
  {
    title: 'Triton Command (Raw)',
    metrics: [
      { name: 'Brink', description: 'Measures how close pitches land to the edge of the strike zone. Lower values mean pitches are nibbling corners more effectively. Calculated as the average distance from each pitch\'s plate location to the nearest zone edge.', formula: 'avg(min_distance_to_zone_edge) in inches' },
      { name: 'Cluster', description: 'Measures location consistency — how tightly grouped a pitcher\'s pitches are within each pitch type. Lower values indicate better repeatability.', formula: 'avg(distance_from_pitch_type_centroid) in inches' },
      { name: 'HDev', description: 'Horizontal deviation — the average horizontal distance in inches between where a pitch crossed the plate and the pitch-type centroid. Lower is better.', formula: 'avg(|px - pitch_type_mean_px|) in inches' },
      { name: 'VDev', description: 'Vertical deviation — the average vertical distance in inches between where a pitch crossed the plate and the pitch-type centroid. Lower is better.', formula: 'avg(|pz - pitch_type_mean_pz|) in inches' },
      { name: 'Missfire', description: 'Distance of pitches that land far from the pitch-type target, identifying errant deliveries. Measures the average distance of mislocated pitches from their intended cluster centroid.', formula: 'avg(distance_from_centroid) for outlier pitches, in inches' },
      { name: 'Waste%', description: 'Percentage of pitches that land 10+ inches outside the strike zone — truly wasted pitches with no strategic value. Lower is better.', formula: 'count(pitches > 10in outside zone) / total pitches' },
    ],
  },
  {
    title: 'Triton Command (Plus)',
    metrics: [
      { name: 'Brink+', description: 'Normalized Brink score on a plus scale. Mean of 100, standard deviation of 10, calculated per pitch type and season. Higher is better (inverted from raw).', formula: '100 + (league_mean - raw) / stddev × 10' },
      { name: 'Cluster+', description: 'Normalized Cluster score on a plus scale. Mean 100, stddev 10. Higher values indicate tighter clustering relative to peers throwing the same pitch type.', formula: '100 + (league_mean - raw) / stddev × 10' },
      { name: 'HDev+', description: 'Normalized horizontal deviation on a plus scale. Mean 100, stddev 10. Higher is better.', formula: '100 + (league_mean - raw) / stddev × 10' },
      { name: 'VDev+', description: 'Normalized vertical deviation on a plus scale. Mean 100, stddev 10. Higher is better.', formula: '100 + (league_mean - raw) / stddev × 10' },
      { name: 'Missfire+', description: 'Normalized Missfire score on a plus scale. Mean 100, stddev 10. Higher is better (fewer errant pitches).', formula: '100 + (league_mean - raw) / stddev × 10' },
      { name: 'Cmd+', description: 'Composite command score combining all Triton command components into a single plus-scale number. Weighted average of Brink+, Cluster+, HDev+, VDev+, and Missfire+.', formula: 'weighted_avg(Brink+, Cluster+, HDev+, VDev+, Missfire+)' },
      { name: 'RPCom+', description: 'Run-prevention command — a composite plus metric that blends Cmd+ with outcome-based metrics to estimate a pitcher\'s overall command contribution to run prevention. Mean 100, stddev 10.' },
    ],
  },
  {
    title: 'Deception',
    metrics: [
      { name: 'VAA', description: 'Vertical approach angle — the angle at which the pitch arrives at the plate in the vertical plane. Flatter (less negative) VAA on fastballs creates the illusion of "rise." Calculated from Statcast trajectory data.', formula: 'atan2(vz0 + az×t, vy0 + ay×t) at plate crossing' },
      { name: 'HAA', description: 'Horizontal approach angle — the angle at which the pitch arrives at the plate in the horizontal plane. Contributes to perceived lateral movement.', formula: 'atan2(vx0 + ax×t, vy0 + ay×t) at plate crossing' },
      { name: 'Unique', description: 'Uniqueness score — a z-score measuring how different a pitch\'s movement profile is from league average for that pitch type. Higher values indicate more unusual movement characteristics.' },
      { name: 'Deception', description: 'Composite deception score combining tunneling, movement deviation, and approach angle differences between pitch types. For fastballs: weighted by VAA flatness and spin efficiency. For breaking/offspeed: weighted by movement differential and tunnel distance.', formula: 'z-score composite of VAA, movement diff, tunnel metrics' },
      { name: 'xDeception', description: 'Expected deception — the predicted deception value based on pitch characteristics, normalized for context. Correlates with future whiff rates and chase rates.' },
    ],
  },
  {
    title: 'Counting & Traditional',
    metrics: [
      { name: 'IP', description: 'Innings pitched — each full inning equals 3 outs recorded.' },
      { name: 'PA', description: 'Plate appearances — total times a batter completes a turn at bat (includes walks, HBP, sacrifices).' },
      { name: 'H', description: 'Hits — times the batter safely reaches base via a batted ball.' },
      { name: '2B', description: 'Doubles — hits where the batter reaches second base.' },
      { name: '3B', description: 'Triples — hits where the batter reaches third base.' },
      { name: 'HR', description: 'Home runs — hits where the batter circles all bases and scores.' },
      { name: 'BB', description: 'Walks (bases on balls) — batter reaches first base after four balls.' },
      { name: 'K', description: 'Strikeouts — batter is out after three strikes.' },
      { name: 'HBP', description: 'Hit by pitch — batter is awarded first base after being hit by a pitch.' },
      { name: 'R', description: 'Runs — times a runner crosses home plate to score.' },
      { name: 'ER', description: 'Earned runs — runs that score without the aid of defensive errors.' },
      { name: 'W', description: 'Wins — credited to the pitcher of record when their team takes and holds the lead.' },
      { name: 'L', description: 'Losses — charged to the pitcher of record when the opposing team takes the permanent lead.' },
      { name: 'SV', description: 'Saves — credited to a relief pitcher who finishes a game with a lead of 3 runs or fewer (or the tying run on base/at bat/on deck).' },
      { name: 'G', description: 'Games — total games in which the pitcher appeared.' },
      { name: 'GS', description: 'Games started — total games in which the pitcher was the starting pitcher.' },
    ],
  },
]

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return CATEGORIES
    return CATEGORIES.map(cat => ({
      ...cat,
      metrics: cat.metrics.filter(
        m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
      ),
    })).filter(cat => cat.metrics.length > 0)
  }, [search])

  const toggle = (title: string) =>
    setCollapsed(prev => ({ ...prev, [title]: !prev[title] }))

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <ResearchNav active="/glossary" />

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 md:px-6 py-8">
        <h1 className="text-2xl font-bold mb-1">Glossary</h1>
        <p className="text-zinc-500 text-sm mb-6">Definitions for every metric on the platform.</p>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search metrics…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 mb-8"
        />

        {/* Categories */}
        {filtered.map(cat => {
          const isCollapsed = collapsed[cat.title]
          return (
            <div key={cat.title} className="mb-6">
              <button
                onClick={() => toggle(cat.title)}
                className="w-full flex items-center justify-between bg-zinc-900 rounded-lg px-4 py-3 text-left hover:bg-zinc-800/80 transition"
              >
                <span className="text-sm font-semibold text-zinc-200">{cat.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600">{cat.metrics.length}</span>
                  <svg
                    className={`w-4 h-4 text-zinc-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {!isCollapsed && (
                <div className="mt-1 space-y-px">
                  {cat.metrics.map(m => (
                    <div key={m.name} className="px-4 py-3 border-b border-zinc-900/50">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm text-emerald-400">{m.name}</span>
                      </div>
                      <p className="text-sm text-zinc-400 mt-1">{m.description}</p>
                      {m.formula && (
                        <code className="block text-xs text-zinc-500 mt-1.5 font-mono bg-zinc-900/50 rounded px-2 py-1 w-fit">
                          {m.formula}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="text-zinc-600 text-sm text-center py-12">No metrics match &quot;{search}&quot;</p>
        )}
      </div>
    </div>
  )
}
