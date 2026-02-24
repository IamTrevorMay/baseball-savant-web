export interface TemplateEntry {
  slug: string
  name: string
  description: string
  isCanvas: boolean
  isAnimated: boolean
  requiresData?: boolean  // default true; false for tools like pitch simulation
}

export const TEMPLATE_REGISTRY: TemplateEntry[] = [
  {
    slug: 'velocity-animation',
    name: 'Velocity Animation',
    description: 'Track velocity trends over time with animated pitch traces',
    isCanvas: false,
    isAnimated: true,
  },
  {
    slug: 'pitch-flight-3d',
    name: '3D Pitch Flight',
    description: 'Visualize pitch trajectories in 3D space from release to plate',
    isCanvas: true,
    isAnimated: true,
  },
  {
    slug: 'strike-zone-heatmap',
    name: 'Strike Zone Heatmap',
    description: 'Density and metric heatmaps with configurable overlays',
    isCanvas: false,
    isAnimated: false,
  },
  {
    slug: 'pitch-characteristics',
    name: 'Pitch Characteristics',
    description: 'Scatter plots with selectable axes for any pitch metric',
    isCanvas: false,
    isAnimated: false,
  },
  {
    slug: 'incoming-pitch-view',
    name: 'Incoming Pitch View',
    description: "Catcher's perspective animation of pitches approaching the plate",
    isCanvas: true,
    isAnimated: true,
  },
  {
    slug: 'arsenal-overlay',
    name: 'Arsenal Overlay',
    description: 'Compare pitch types with movement spread ellipses',
    isCanvas: false,
    isAnimated: false,
  },
  {
    slug: 'pitch-tunneling',
    name: 'Pitch Tunneling',
    description: "Batter's-eye view of average pitch trajectories showing tunnel divergence",
    isCanvas: true,
    isAnimated: true,
  },
  {
    slug: 'rolling-averages',
    name: 'Rolling Averages',
    description: 'Line charts of rolling pitch metric averages over game dates',
    isCanvas: false,
    isAnimated: false,
  },
  {
    slug: 'spray-chart',
    name: 'Spray Chart',
    description: 'Batted ball locations on a field diagram colored by outcome or exit velo',
    isCanvas: true,
    isAnimated: false,
  },
  {
    slug: 'release-point',
    name: 'Release Point',
    description: 'Release point consistency scatter with spread ellipses per pitch type',
    isCanvas: false,
    isAnimated: false,
  },
  {
    slug: 'percentile-rankings',
    name: 'Percentile Rankings',
    description: 'Horizontal bar chart of player metrics vs 2024 league percentiles',
    isCanvas: false,
    isAnimated: false,
  },
  {
    slug: 'pitch-simulation',
    name: 'Pitch Simulation',
    description: 'Design custom pitches and simulate trajectories with a drag target',
    isCanvas: true,
    isAnimated: true,
    requiresData: false,
  },
]
