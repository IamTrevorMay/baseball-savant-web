export interface TemplateEntry {
  slug: string
  name: string
  description: string
  isCanvas: boolean
  isAnimated: boolean
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
]
