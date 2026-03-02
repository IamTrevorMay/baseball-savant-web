// League-level pitcher distributions by year (2015-2025, min 50 pitches per pitcher per pitch type)
// Mean and stddev of pitcher-level averages, used for plus-stat normalization
// Year-partitioned centroids for Cluster/HDev/VDev

type LeagueEntry = { mean: number; stddev: number }
type YearLeague = Record<number, Record<string, LeagueEntry>>
type MetricName = 'brink' | 'cluster' | 'hdev' | 'vdev' | 'missfire'

// ── BRINK ────────────────────────────────────────────────────────────────────
export const BRINK_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: -0.90, stddev: 0.71 }, 'Slider': { mean: -2.81, stddev: 1.42 },
    'Sinker': { mean: -1.47, stddev: 1.07 }, 'Changeup': { mean: -3.45, stddev: 1.50 },
    'Curveball': { mean: -3.51, stddev: 1.61 }, 'Cutter': { mean: -1.50, stddev: 1.02 },
    'Split-Finger': { mean: -3.93, stddev: 1.25 }, 'Knuckle Curve': { mean: -3.65, stddev: 1.85 },
  },
  2016: {
    '4-Seam Fastball': { mean: -0.90, stddev: 0.75 }, 'Slider': { mean: -2.69, stddev: 1.39 },
    'Sinker': { mean: -1.42, stddev: 1.09 }, 'Changeup': { mean: -3.46, stddev: 1.59 },
    'Curveball': { mean: -3.54, stddev: 1.64 }, 'Cutter': { mean: -1.63, stddev: 1.10 },
    'Split-Finger': { mean: -4.15, stddev: 1.13 }, 'Knuckle Curve': { mean: -3.35, stddev: 1.61 },
  },
  2017: {
    '4-Seam Fastball': { mean: -0.99, stddev: 0.82 }, 'Slider': { mean: -2.70, stddev: 1.38 },
    'Sinker': { mean: -1.22, stddev: 0.93 }, 'Changeup': { mean: -3.03, stddev: 1.37 },
    'Curveball': { mean: -3.19, stddev: 1.64 }, 'Cutter': { mean: -2.03, stddev: 1.16 },
    'Sweeper': { mean: -3.25, stddev: 1.42 }, 'Split-Finger': { mean: -3.86, stddev: 1.54 },
    'Knuckle Curve': { mean: -3.32, stddev: 1.43 },
  },
  2018: {
    '4-Seam Fastball': { mean: -1.00, stddev: 0.78 }, 'Slider': { mean: -2.88, stddev: 1.40 },
    'Sinker': { mean: -1.27, stddev: 1.00 }, 'Changeup': { mean: -3.26, stddev: 1.40 },
    'Curveball': { mean: -3.22, stddev: 1.52 }, 'Cutter': { mean: -1.94, stddev: 1.23 },
    'Sweeper': { mean: -2.90, stddev: 1.64 }, 'Split-Finger': { mean: -4.42, stddev: 1.66 },
    'Knuckle Curve': { mean: -3.29, stddev: 1.55 },
  },
  2019: {
    '4-Seam Fastball': { mean: -1.14, stddev: 0.82 }, 'Slider': { mean: -3.11, stddev: 1.42 },
    'Sinker': { mean: -1.36, stddev: 0.94 }, 'Changeup': { mean: -3.50, stddev: 1.45 },
    'Curveball': { mean: -3.66, stddev: 1.72 }, 'Cutter': { mean: -2.01, stddev: 1.31 },
    'Sweeper': { mean: -3.39, stddev: 1.40 }, 'Split-Finger': { mean: -4.34, stddev: 1.56 },
    'Knuckle Curve': { mean: -3.91, stddev: 1.66 },
  },
  2020: {
    '4-Seam Fastball': { mean: -1.05, stddev: 0.92 }, 'Slider': { mean: -3.22, stddev: 1.63 },
    'Sinker': { mean: -1.12, stddev: 0.99 }, 'Changeup': { mean: -3.20, stddev: 1.45 },
    'Curveball': { mean: -3.94, stddev: 1.79 }, 'Cutter': { mean: -1.86, stddev: 1.44 },
    'Sweeper': { mean: -3.05, stddev: 1.33 }, 'Split-Finger': { mean: -3.81, stddev: 1.70 },
    'Knuckle Curve': { mean: -3.81, stddev: 1.83 },
  },
  2021: {
    '4-Seam Fastball': { mean: -1.01, stddev: 0.81 }, 'Slider': { mean: -2.98, stddev: 1.39 },
    'Sinker': { mean: -0.97, stddev: 1.02 }, 'Changeup': { mean: -3.38, stddev: 1.40 },
    'Curveball': { mean: -3.84, stddev: 1.83 }, 'Cutter': { mean: -1.56, stddev: 1.21 },
    'Sweeper': { mean: -2.87, stddev: 1.46 }, 'Split-Finger': { mean: -4.47, stddev: 1.37 },
    'Knuckle Curve': { mean: -4.17, stddev: 1.53 },
  },
  2022: {
    '4-Seam Fastball': { mean: -1.06, stddev: 0.86 }, 'Slider': { mean: -2.96, stddev: 1.31 },
    'Sinker': { mean: -0.80, stddev: 0.95 }, 'Changeup': { mean: -3.53, stddev: 1.54 },
    'Curveball': { mean: -3.42, stddev: 1.74 }, 'Cutter': { mean: -1.49, stddev: 1.14 },
    'Sweeper': { mean: -2.91, stddev: 1.30 }, 'Split-Finger': { mean: -4.26, stddev: 1.42 },
    'Knuckle Curve': { mean: -3.61, stddev: 1.33 },
  },
  2023: {
    '4-Seam Fastball': { mean: -1.02, stddev: 0.93 }, 'Slider': { mean: -2.80, stddev: 1.35 },
    'Sinker': { mean: -0.67, stddev: 0.96 }, 'Changeup': { mean: -3.55, stddev: 1.58 },
    'Curveball': { mean: -3.46, stddev: 1.68 }, 'Cutter': { mean: -1.28, stddev: 1.09 },
    'Sweeper': { mean: -3.01, stddev: 1.38 }, 'Split-Finger': { mean: -4.22, stddev: 1.55 },
    'Knuckle Curve': { mean: -3.76, stddev: 1.61 }, 'Slurve': { mean: -2.89, stddev: 1.29 },
  },
  2024: {
    '4-Seam Fastball': { mean: -0.90, stddev: 0.90 }, 'Slider': { mean: -2.67, stddev: 1.30 },
    'Sinker': { mean: -0.49, stddev: 0.97 }, 'Changeup': { mean: -3.51, stddev: 1.46 },
    'Curveball': { mean: -3.43, stddev: 1.67 }, 'Cutter': { mean: -1.26, stddev: 1.07 },
    'Sweeper': { mean: -2.89, stddev: 1.40 }, 'Split-Finger': { mean: -4.01, stddev: 1.47 },
    'Knuckle Curve': { mean: -4.17, stddev: 1.59 }, 'Slurve': { mean: -3.27, stddev: 1.31 },
  },
  2025: {
    '4-Seam Fastball': { mean: -0.71, stddev: 0.95 }, 'Slider': { mean: -2.38, stddev: 1.35 },
    'Sinker': { mean: -0.28, stddev: 0.97 }, 'Changeup': { mean: -3.45, stddev: 1.49 },
    'Curveball': { mean: -3.41, stddev: 1.75 }, 'Cutter': { mean: -0.96, stddev: 1.12 },
    'Sweeper': { mean: -2.77, stddev: 1.47 }, 'Split-Finger': { mean: -3.96, stddev: 1.53 },
    'Knuckle Curve': { mean: -3.72, stddev: 1.53 }, 'Slurve': { mean: -3.02, stddev: 0.86 },
  },
}

// ── CLUSTER ──────────────────────────────────────────────────────────────────
export const CLUSTER_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 12.26, stddev: 0.79 }, 'Slider': { mean: 12.45, stddev: 1.19 },
    'Sinker': { mean: 11.86, stddev: 0.92 }, 'Changeup': { mean: 12.24, stddev: 1.28 },
    'Curveball': { mean: 13.84, stddev: 1.58 }, 'Cutter': { mean: 11.94, stddev: 0.90 },
    'Split-Finger': { mean: 12.46, stddev: 1.85 }, 'Knuckle Curve': { mean: 13.52, stddev: 1.40 },
  },
  2016: {
    '4-Seam Fastball': { mean: 12.28, stddev: 0.82 }, 'Slider': { mean: 12.38, stddev: 1.19 },
    'Sinker': { mean: 11.85, stddev: 0.88 }, 'Changeup': { mean: 12.24, stddev: 1.34 },
    'Curveball': { mean: 13.79, stddev: 1.32 }, 'Cutter': { mean: 11.98, stddev: 0.86 },
    'Split-Finger': { mean: 12.98, stddev: 1.61 }, 'Knuckle Curve': { mean: 13.34, stddev: 1.19 },
  },
  2017: {
    '4-Seam Fastball': { mean: 12.17, stddev: 0.82 }, 'Slider': { mean: 12.39, stddev: 1.25 },
    'Sinker': { mean: 11.73, stddev: 0.88 }, 'Changeup': { mean: 11.94, stddev: 1.17 },
    'Curveball': { mean: 13.56, stddev: 1.42 }, 'Cutter': { mean: 11.94, stddev: 1.02 },
    'Sweeper': { mean: 13.16, stddev: 1.09 }, 'Split-Finger': { mean: 12.61, stddev: 1.48 },
    'Knuckle Curve': { mean: 13.47, stddev: 1.40 },
  },
  2018: {
    '4-Seam Fastball': { mean: 12.14, stddev: 0.78 }, 'Slider': { mean: 12.54, stddev: 1.32 },
    'Sinker': { mean: 11.48, stddev: 0.95 }, 'Changeup': { mean: 11.92, stddev: 1.28 },
    'Curveball': { mean: 13.73, stddev: 1.59 }, 'Cutter': { mean: 11.93, stddev: 1.09 },
    'Sweeper': { mean: 13.05, stddev: 0.73 }, 'Split-Finger': { mean: 12.92, stddev: 1.80 },
    'Knuckle Curve': { mean: 13.55, stddev: 1.44 },
  },
  2019: {
    '4-Seam Fastball': { mean: 12.09, stddev: 0.84 }, 'Slider': { mean: 12.35, stddev: 1.21 },
    'Sinker': { mean: 11.42, stddev: 0.92 }, 'Changeup': { mean: 11.97, stddev: 1.38 },
    'Curveball': { mean: 13.68, stddev: 1.60 }, 'Cutter': { mean: 11.69, stddev: 0.99 },
    'Sweeper': { mean: 12.84, stddev: 1.08 }, 'Split-Finger': { mean: 12.61, stddev: 1.46 },
    'Knuckle Curve': { mean: 13.56, stddev: 1.66 },
  },
  2020: {
    '4-Seam Fastball': { mean: 11.89, stddev: 0.88 }, 'Slider': { mean: 12.31, stddev: 1.30 },
    'Sinker': { mean: 11.31, stddev: 0.99 }, 'Changeup': { mean: 11.59, stddev: 1.36 },
    'Curveball': { mean: 13.56, stddev: 1.69 }, 'Cutter': { mean: 11.61, stddev: 0.99 },
    'Sweeper': { mean: 12.82, stddev: 1.44 }, 'Split-Finger': { mean: 12.36, stddev: 1.46 },
    'Knuckle Curve': { mean: 13.32, stddev: 1.62 },
  },
  2021: {
    '4-Seam Fastball': { mean: 12.01, stddev: 0.86 }, 'Slider': { mean: 12.63, stddev: 1.22 },
    'Sinker': { mean: 11.46, stddev: 1.04 }, 'Changeup': { mean: 12.17, stddev: 1.35 },
    'Curveball': { mean: 14.01, stddev: 1.73 }, 'Cutter': { mean: 11.78, stddev: 0.89 },
    'Sweeper': { mean: 12.85, stddev: 1.25 }, 'Split-Finger': { mean: 13.42, stddev: 1.86 },
    'Knuckle Curve': { mean: 14.33, stddev: 1.89 },
  },
  2022: {
    '4-Seam Fastball': { mean: 11.82, stddev: 0.86 }, 'Slider': { mean: 12.28, stddev: 1.17 },
    'Sinker': { mean: 11.04, stddev: 0.97 }, 'Changeup': { mean: 11.99, stddev: 1.53 },
    'Curveball': { mean: 13.42, stddev: 1.39 }, 'Cutter': { mean: 11.48, stddev: 0.97 },
    'Sweeper': { mean: 12.80, stddev: 1.12 }, 'Split-Finger': { mean: 12.60, stddev: 1.53 },
    'Knuckle Curve': { mean: 13.49, stddev: 1.22 },
  },
  2023: {
    '4-Seam Fastball': { mean: 11.64, stddev: 0.87 }, 'Slider': { mean: 12.22, stddev: 1.20 },
    'Sinker': { mean: 11.04, stddev: 1.01 }, 'Changeup': { mean: 11.86, stddev: 1.61 },
    'Curveball': { mean: 13.44, stddev: 1.47 }, 'Cutter': { mean: 11.46, stddev: 1.01 },
    'Sweeper': { mean: 12.79, stddev: 1.20 }, 'Split-Finger': { mean: 12.81, stddev: 1.69 },
    'Knuckle Curve': { mean: 13.44, stddev: 1.30 }, 'Slurve': { mean: 12.30, stddev: 1.19 },
  },
  2024: {
    '4-Seam Fastball': { mean: 11.65, stddev: 0.82 }, 'Slider': { mean: 12.21, stddev: 1.18 },
    'Sinker': { mean: 11.03, stddev: 0.81 }, 'Changeup': { mean: 11.89, stddev: 1.45 },
    'Curveball': { mean: 13.28, stddev: 1.40 }, 'Cutter': { mean: 11.59, stddev: 0.94 },
    'Sweeper': { mean: 12.76, stddev: 1.18 }, 'Split-Finger': { mean: 12.38, stddev: 1.36 },
    'Knuckle Curve': { mean: 13.49, stddev: 1.63 }, 'Slurve': { mean: 12.99, stddev: 1.02 },
  },
  2025: {
    '4-Seam Fastball': { mean: 11.49, stddev: 0.85 }, 'Slider': { mean: 12.05, stddev: 1.11 },
    'Sinker': { mean: 10.96, stddev: 0.82 }, 'Changeup': { mean: 11.86, stddev: 1.30 },
    'Curveball': { mean: 13.30, stddev: 1.49 }, 'Cutter': { mean: 11.44, stddev: 0.96 },
    'Sweeper': { mean: 12.70, stddev: 1.11 }, 'Split-Finger': { mean: 12.57, stddev: 1.51 },
    'Knuckle Curve': { mean: 13.16, stddev: 1.50 }, 'Slurve': { mean: 13.15, stddev: 1.26 },
  },
}

// ── HDEV ─────────────────────────────────────────────────────────────────────
export const HDEV_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 7.91, stddev: 0.78 }, 'Slider': { mean: 7.66, stddev: 1.18 },
    'Sinker': { mean: 7.77, stddev: 0.97 }, 'Changeup': { mean: 7.20, stddev: 0.94 },
    'Curveball': { mean: 8.19, stddev: 1.34 }, 'Cutter': { mean: 7.49, stddev: 1.06 },
    'Split-Finger': { mean: 7.05, stddev: 1.30 }, 'Knuckle Curve': { mean: 7.68, stddev: 1.10 },
  },
  2016: {
    '4-Seam Fastball': { mean: 7.86, stddev: 0.78 }, 'Slider': { mean: 7.57, stddev: 1.11 },
    'Sinker': { mean: 7.73, stddev: 0.83 }, 'Changeup': { mean: 7.23, stddev: 1.01 },
    'Curveball': { mean: 8.04, stddev: 1.19 }, 'Cutter': { mean: 7.53, stddev: 0.90 },
    'Split-Finger': { mean: 7.28, stddev: 1.02 }, 'Knuckle Curve': { mean: 7.47, stddev: 0.90 },
  },
  2017: {
    '4-Seam Fastball': { mean: 7.71, stddev: 0.82 }, 'Slider': { mean: 7.64, stddev: 1.14 },
    'Sinker': { mean: 7.64, stddev: 0.88 }, 'Changeup': { mean: 7.17, stddev: 0.97 },
    'Curveball': { mean: 8.04, stddev: 1.11 }, 'Cutter': { mean: 7.40, stddev: 1.09 },
    'Sweeper': { mean: 9.03, stddev: 1.32 }, 'Split-Finger': { mean: 7.04, stddev: 0.83 },
    'Knuckle Curve': { mean: 7.75, stddev: 1.13 },
  },
  2018: {
    '4-Seam Fastball': { mean: 7.59, stddev: 0.73 }, 'Slider': { mean: 7.72, stddev: 1.17 },
    'Sinker': { mean: 7.48, stddev: 0.92 }, 'Changeup': { mean: 7.12, stddev: 1.02 },
    'Curveball': { mean: 8.16, stddev: 1.35 }, 'Cutter': { mean: 7.45, stddev: 1.07 },
    'Sweeper': { mean: 8.99, stddev: 0.92 }, 'Split-Finger': { mean: 7.14, stddev: 0.97 },
    'Knuckle Curve': { mean: 7.57, stddev: 0.94 },
  },
  2019: {
    '4-Seam Fastball': { mean: 7.49, stddev: 0.79 }, 'Slider': { mean: 7.65, stddev: 1.22 },
    'Sinker': { mean: 7.40, stddev: 0.88 }, 'Changeup': { mean: 7.15, stddev: 1.04 },
    'Curveball': { mean: 8.06, stddev: 1.27 }, 'Cutter': { mean: 7.27, stddev: 0.98 },
    'Sweeper': { mean: 8.69, stddev: 1.41 }, 'Split-Finger': { mean: 7.03, stddev: 0.96 },
    'Knuckle Curve': { mean: 7.52, stddev: 1.09 },
  },
  2020: {
    '4-Seam Fastball': { mean: 7.31, stddev: 0.86 }, 'Slider': { mean: 7.50, stddev: 1.28 },
    'Sinker': { mean: 7.34, stddev: 0.97 }, 'Changeup': { mean: 6.89, stddev: 1.09 },
    'Curveball': { mean: 7.87, stddev: 1.42 }, 'Cutter': { mean: 7.15, stddev: 0.99 },
    'Sweeper': { mean: 8.52, stddev: 1.45 }, 'Split-Finger': { mean: 7.13, stddev: 0.98 },
    'Knuckle Curve': { mean: 7.39, stddev: 1.17 },
  },
  2021: {
    '4-Seam Fastball': { mean: 7.28, stddev: 0.78 }, 'Slider': { mean: 7.70, stddev: 1.25 },
    'Sinker': { mean: 7.44, stddev: 0.91 }, 'Changeup': { mean: 7.14, stddev: 0.99 },
    'Curveball': { mean: 8.00, stddev: 1.43 }, 'Cutter': { mean: 7.21, stddev: 0.96 },
    'Sweeper': { mean: 8.43, stddev: 1.37 }, 'Split-Finger': { mean: 7.34, stddev: 1.18 },
    'Knuckle Curve': { mean: 7.60, stddev: 1.37 },
  },
  2022: {
    '4-Seam Fastball': { mean: 7.19, stddev: 0.80 }, 'Slider': { mean: 7.52, stddev: 1.20 },
    'Sinker': { mean: 7.17, stddev: 0.92 }, 'Changeup': { mean: 7.18, stddev: 1.14 },
    'Curveball': { mean: 7.73, stddev: 1.16 }, 'Cutter': { mean: 6.98, stddev: 0.92 },
    'Sweeper': { mean: 8.55, stddev: 1.25 }, 'Split-Finger': { mean: 7.23, stddev: 0.95 },
    'Knuckle Curve': { mean: 7.42, stddev: 0.94 },
  },
  2023: {
    '4-Seam Fastball': { mean: 7.07, stddev: 0.78 }, 'Slider': { mean: 7.47, stddev: 1.17 },
    'Sinker': { mean: 7.19, stddev: 0.92 }, 'Changeup': { mean: 7.13, stddev: 0.99 },
    'Curveball': { mean: 7.79, stddev: 1.20 }, 'Cutter': { mean: 6.94, stddev: 0.96 },
    'Sweeper': { mean: 8.58, stddev: 1.41 }, 'Split-Finger': { mean: 7.41, stddev: 1.15 },
    'Knuckle Curve': { mean: 7.51, stddev: 1.13 }, 'Slurve': { mean: 7.84, stddev: 0.95 },
  },
  2024: {
    '4-Seam Fastball': { mean: 7.11, stddev: 0.74 }, 'Slider': { mean: 7.50, stddev: 1.18 },
    'Sinker': { mean: 7.22, stddev: 0.79 }, 'Changeup': { mean: 7.25, stddev: 1.07 },
    'Curveball': { mean: 7.66, stddev: 1.26 }, 'Cutter': { mean: 7.12, stddev: 0.90 },
    'Sweeper': { mean: 8.69, stddev: 1.34 }, 'Split-Finger': { mean: 7.29, stddev: 1.02 },
    'Knuckle Curve': { mean: 7.47, stddev: 1.20 }, 'Slurve': { mean: 8.11, stddev: 1.05 },
  },
  2025: {
    '4-Seam Fastball': { mean: 6.99, stddev: 0.80 }, 'Slider': { mean: 7.30, stddev: 1.07 },
    'Sinker': { mean: 7.14, stddev: 0.77 }, 'Changeup': { mean: 7.18, stddev: 1.02 },
    'Curveball': { mean: 7.66, stddev: 1.25 }, 'Cutter': { mean: 7.08, stddev: 0.85 },
    'Sweeper': { mean: 8.64, stddev: 1.23 }, 'Split-Finger': { mean: 7.27, stddev: 1.21 },
    'Knuckle Curve': { mean: 7.52, stddev: 1.27 }, 'Slurve': { mean: 8.83, stddev: 1.43 },
  },
}

// ── VDEV ─────────────────────────────────────────────────────────────────────
export const VDEV_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 7.75, stddev: 0.83 }, 'Slider': { mean: 8.37, stddev: 1.29 },
    'Sinker': { mean: 7.36, stddev: 0.92 }, 'Changeup': { mean: 8.51, stddev: 1.34 },
    'Curveball': { mean: 9.72, stddev: 1.58 }, 'Cutter': { mean: 7.79, stddev: 1.01 },
    'Split-Finger': { mean: 8.90, stddev: 1.77 }, 'Knuckle Curve': { mean: 9.75, stddev: 1.50 },
  },
  2016: {
    '4-Seam Fastball': { mean: 7.81, stddev: 0.83 }, 'Slider': { mean: 8.37, stddev: 1.31 },
    'Sinker': { mean: 7.40, stddev: 0.90 }, 'Changeup': { mean: 8.49, stddev: 1.33 },
    'Curveball': { mean: 9.76, stddev: 1.46 }, 'Cutter': { mean: 7.82, stddev: 0.94 },
    'Split-Finger': { mean: 9.35, stddev: 1.84 }, 'Knuckle Curve': { mean: 9.77, stddev: 1.35 },
  },
  2017: {
    '4-Seam Fastball': { mean: 7.81, stddev: 0.85 }, 'Slider': { mean: 8.33, stddev: 1.33 },
    'Sinker': { mean: 7.32, stddev: 0.86 }, 'Changeup': { mean: 8.17, stddev: 1.18 },
    'Curveball': { mean: 9.49, stddev: 1.59 }, 'Cutter': { mean: 7.88, stddev: 1.03 },
    'Sweeper': { mean: 7.96, stddev: 1.37 }, 'Split-Finger': { mean: 9.09, stddev: 1.63 },
    'Knuckle Curve': { mean: 9.68, stddev: 1.49 },
  },
  2018: {
    '4-Seam Fastball': { mean: 7.92, stddev: 0.86 }, 'Slider': { mean: 8.43, stddev: 1.41 },
    'Sinker': { mean: 7.18, stddev: 0.94 }, 'Changeup': { mean: 8.19, stddev: 1.29 },
    'Curveball': { mean: 9.62, stddev: 1.60 }, 'Cutter': { mean: 7.81, stddev: 1.14 },
    'Sweeper': { mean: 7.86, stddev: 1.23 }, 'Split-Finger': { mean: 9.45, stddev: 1.75 },
    'Knuckle Curve': { mean: 9.95, stddev: 1.60 },
  },
  2019: {
    '4-Seam Fastball': { mean: 7.96, stddev: 0.89 }, 'Slider': { mean: 8.28, stddev: 1.23 },
    'Sinker': { mean: 7.19, stddev: 0.97 }, 'Changeup': { mean: 8.26, stddev: 1.36 },
    'Curveball': { mean: 9.65, stddev: 1.71 }, 'Cutter': { mean: 7.73, stddev: 1.02 },
    'Sweeper': { mean: 7.92, stddev: 1.00 }, 'Split-Finger': { mean: 9.18, stddev: 1.53 },
    'Knuckle Curve': { mean: 10.00, stddev: 1.77 },
  },
  2020: {
    '4-Seam Fastball': { mean: 7.88, stddev: 0.94 }, 'Slider': { mean: 8.38, stddev: 1.33 },
    'Sinker': { mean: 7.12, stddev: 0.94 }, 'Changeup': { mean: 8.01, stddev: 1.35 },
    'Curveball': { mean: 9.65, stddev: 1.76 }, 'Cutter': { mean: 7.73, stddev: 1.08 },
    'Sweeper': { mean: 8.06, stddev: 1.56 }, 'Split-Finger': { mean: 8.79, stddev: 1.33 },
    'Knuckle Curve': { mean: 9.81, stddev: 1.78 },
  },
  2021: {
    '4-Seam Fastball': { mean: 8.08, stddev: 0.95 }, 'Slider': { mean: 8.59, stddev: 1.37 },
    'Sinker': { mean: 7.24, stddev: 1.02 }, 'Changeup': { mean: 8.49, stddev: 1.45 },
    'Curveball': { mean: 10.12, stddev: 1.94 }, 'Cutter': { mean: 7.89, stddev: 1.01 },
    'Sweeper': { mean: 8.19, stddev: 1.34 }, 'Split-Finger': { mean: 9.93, stddev: 1.85 },
    'Knuckle Curve': { mean: 10.87, stddev: 1.83 },
  },
  2022: {
    '4-Seam Fastball': { mean: 7.91, stddev: 0.87 }, 'Slider': { mean: 8.31, stddev: 1.30 },
    'Sinker': { mean: 6.96, stddev: 0.92 }, 'Changeup': { mean: 8.25, stddev: 1.49 },
    'Curveball': { mean: 9.59, stddev: 1.74 }, 'Cutter': { mean: 7.74, stddev: 0.96 },
    'Sweeper': { mean: 7.97, stddev: 1.36 }, 'Split-Finger': { mean: 8.98, stddev: 1.66 },
    'Knuckle Curve': { mean: 10.01, stddev: 1.34 },
  },
  2023: {
    '4-Seam Fastball': { mean: 7.81, stddev: 0.87 }, 'Slider': { mean: 8.30, stddev: 1.33 },
    'Sinker': { mean: 6.93, stddev: 0.99 }, 'Changeup': { mean: 8.14, stddev: 1.61 },
    'Curveball': { mean: 9.57, stddev: 1.69 }, 'Cutter': { mean: 7.77, stddev: 1.02 },
    'Sweeper': { mean: 7.91, stddev: 1.32 }, 'Split-Finger': { mean: 9.11, stddev: 1.53 },
    'Knuckle Curve': { mean: 9.87, stddev: 1.39 }, 'Slurve': { mean: 8.07, stddev: 1.07 },
  },
  2024: {
    '4-Seam Fastball': { mean: 7.78, stddev: 0.88 }, 'Slider': { mean: 8.25, stddev: 1.25 },
    'Sinker': { mean: 6.91, stddev: 0.89 }, 'Changeup': { mean: 8.06, stddev: 1.48 },
    'Curveball': { mean: 9.48, stddev: 1.62 }, 'Cutter': { mean: 7.77, stddev: 1.04 },
    'Sweeper': { mean: 7.78, stddev: 1.25 }, 'Split-Finger': { mean: 8.67, stddev: 1.37 },
    'Knuckle Curve': { mean: 9.95, stddev: 1.76 }, 'Slurve': { mean: 8.72, stddev: 1.39 },
  },
  2025: {
    '4-Seam Fastball': { mean: 7.69, stddev: 0.91 }, 'Slider': { mean: 8.22, stddev: 1.24 },
    'Sinker': { mean: 6.89, stddev: 0.91 }, 'Changeup': { mean: 8.08, stddev: 1.38 },
    'Curveball': { mean: 9.49, stddev: 1.72 }, 'Cutter': { mean: 7.62, stddev: 1.04 },
    'Sweeper': { mean: 7.75, stddev: 1.29 }, 'Split-Finger': { mean: 8.91, stddev: 1.46 },
    'Knuckle Curve': { mean: 9.50, stddev: 1.50 }, 'Slurve': { mean: 8.29, stddev: 1.13 },
  },
}

// ── MISSFIRE ─────────────────────────────────────────────────────────────────
export const MISSFIRE_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 5.71, stddev: 0.69 }, 'Slider': { mean: 7.40, stddev: 1.33 },
    'Sinker': { mean: 5.93, stddev: 0.78 }, 'Changeup': { mean: 7.34, stddev: 1.26 },
    'Curveball': { mean: 8.21, stddev: 1.49 }, 'Cutter': { mean: 6.09, stddev: 1.03 },
    'Split-Finger': { mean: 8.03, stddev: 1.67 }, 'Knuckle Curve': { mean: 8.27, stddev: 1.73 },
  },
  2016: {
    '4-Seam Fastball': { mean: 5.78, stddev: 0.72 }, 'Slider': { mean: 7.37, stddev: 1.35 },
    'Sinker': { mean: 5.93, stddev: 0.83 }, 'Changeup': { mean: 7.37, stddev: 1.30 },
    'Curveball': { mean: 8.37, stddev: 1.61 }, 'Cutter': { mean: 6.35, stddev: 1.27 },
    'Split-Finger': { mean: 8.56, stddev: 3.72 }, 'Knuckle Curve': { mean: 8.46, stddev: 1.69 },
  },
  2017: {
    '4-Seam Fastball': { mean: 5.80, stddev: 0.76 }, 'Slider': { mean: 7.39, stddev: 1.22 },
    'Sinker': { mean: 5.84, stddev: 0.74 }, 'Changeup': { mean: 7.31, stddev: 1.28 },
    'Curveball': { mean: 8.15, stddev: 1.57 }, 'Cutter': { mean: 6.52, stddev: 1.10 },
    'Sweeper': { mean: 8.10, stddev: 1.50 }, 'Split-Finger': { mean: 8.14, stddev: 1.26 },
    'Knuckle Curve': { mean: 8.26, stddev: 1.44 },
  },
  2018: {
    '4-Seam Fastball': { mean: 5.85, stddev: 0.76 }, 'Slider': { mean: 7.59, stddev: 1.39 },
    'Sinker': { mean: 5.82, stddev: 0.80 }, 'Changeup': { mean: 7.34, stddev: 1.34 },
    'Curveball': { mean: 8.08, stddev: 1.45 }, 'Cutter': { mean: 6.37, stddev: 1.07 },
    'Sweeper': { mean: 7.83, stddev: 1.42 }, 'Split-Finger': { mean: 8.62, stddev: 1.61 },
    'Knuckle Curve': { mean: 8.39, stddev: 1.26 },
  },
  2019: {
    '4-Seam Fastball': { mean: 5.92, stddev: 0.84 }, 'Slider': { mean: 7.58, stddev: 1.35 },
    'Sinker': { mean: 5.74, stddev: 0.76 }, 'Changeup': { mean: 7.33, stddev: 1.30 },
    'Curveball': { mean: 8.31, stddev: 1.75 }, 'Cutter': { mean: 6.32, stddev: 1.14 },
    'Sweeper': { mean: 8.01, stddev: 1.10 }, 'Split-Finger': { mean: 8.38, stddev: 1.48 },
    'Knuckle Curve': { mean: 8.83, stddev: 1.56 },
  },
  2020: {
    '4-Seam Fastball': { mean: 5.91, stddev: 0.94 }, 'Slider': { mean: 7.74, stddev: 1.39 },
    'Sinker': { mean: 5.63, stddev: 0.85 }, 'Changeup': { mean: 7.14, stddev: 1.47 },
    'Curveball': { mean: 8.56, stddev: 1.82 }, 'Cutter': { mean: 6.36, stddev: 1.29 },
    'Sweeper': { mean: 7.98, stddev: 1.35 }, 'Split-Finger': { mean: 7.96, stddev: 1.47 },
    'Knuckle Curve': { mean: 8.69, stddev: 1.57 },
  },
  2021: {
    '4-Seam Fastball': { mean: 6.01, stddev: 0.82 }, 'Slider': { mean: 7.71, stddev: 1.31 },
    'Sinker': { mean: 5.67, stddev: 0.88 }, 'Changeup': { mean: 7.32, stddev: 1.30 },
    'Curveball': { mean: 8.74, stddev: 1.87 }, 'Cutter': { mean: 6.21, stddev: 1.11 },
    'Sweeper': { mean: 7.73, stddev: 1.47 }, 'Split-Finger': { mean: 8.60, stddev: 1.52 },
    'Knuckle Curve': { mean: 9.06, stddev: 1.78 },
  },
  2022: {
    '4-Seam Fastball': { mean: 5.89, stddev: 0.86 }, 'Slider': { mean: 7.46, stddev: 1.18 },
    'Sinker': { mean: 5.38, stddev: 0.75 }, 'Changeup': { mean: 7.24, stddev: 1.31 },
    'Curveball': { mean: 8.20, stddev: 1.67 }, 'Cutter': { mean: 6.00, stddev: 1.01 },
    'Sweeper': { mean: 7.46, stddev: 1.23 }, 'Split-Finger': { mean: 7.90, stddev: 1.37 },
    'Knuckle Curve': { mean: 8.52, stddev: 1.34 },
  },
  2023: {
    '4-Seam Fastball': { mean: 5.85, stddev: 0.89 }, 'Slider': { mean: 7.36, stddev: 1.21 },
    'Sinker': { mean: 5.39, stddev: 0.78 }, 'Changeup': { mean: 7.32, stddev: 1.41 },
    'Curveball': { mean: 8.22, stddev: 1.73 }, 'Cutter': { mean: 5.87, stddev: 0.99 },
    'Sweeper': { mean: 7.54, stddev: 1.33 }, 'Split-Finger': { mean: 8.27, stddev: 1.61 },
    'Knuckle Curve': { mean: 8.60, stddev: 1.56 }, 'Slurve': { mean: 7.30, stddev: 1.19 },
  },
  2024: {
    '4-Seam Fastball': { mean: 5.82, stddev: 0.86 }, 'Slider': { mean: 7.37, stddev: 1.31 },
    'Sinker': { mean: 5.31, stddev: 0.76 }, 'Changeup': { mean: 7.22, stddev: 1.31 },
    'Curveball': { mean: 8.18, stddev: 1.60 }, 'Cutter': { mean: 5.92, stddev: 0.96 },
    'Sweeper': { mean: 7.58, stddev: 1.24 }, 'Split-Finger': { mean: 7.77, stddev: 1.14 },
    'Knuckle Curve': { mean: 8.86, stddev: 1.75 }, 'Slurve': { mean: 7.80, stddev: 1.18 },
  },
  2025: {
    '4-Seam Fastball': { mean: 5.70, stddev: 0.91 }, 'Slider': { mean: 7.15, stddev: 1.25 },
    'Sinker': { mean: 5.26, stddev: 0.83 }, 'Changeup': { mean: 7.33, stddev: 1.33 },
    'Curveball': { mean: 8.15, stddev: 1.64 }, 'Cutter': { mean: 5.87, stddev: 1.07 },
    'Sweeper': { mean: 7.46, stddev: 1.22 }, 'Split-Finger': { mean: 7.94, stddev: 1.33 },
    'Knuckle Curve': { mean: 8.38, stddev: 1.48 }, 'Slurve': { mean: 7.98, stddev: 2.10 },
  },
}

// ── METRIC TABLE MAP ─────────────────────────────────────────────────────────
const METRIC_TABLES: Record<MetricName, YearLeague> = {
  brink: BRINK_LEAGUE_BY_YEAR,
  cluster: CLUSTER_LEAGUE_BY_YEAR,
  hdev: HDEV_LEAGUE_BY_YEAR,
  vdev: VDEV_LEAGUE_BY_YEAR,
  missfire: MISSFIRE_LEAGUE_BY_YEAR,
}

// Available years in the data, sorted
const AVAILABLE_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]

/**
 * Get year-specific league baseline for a metric+pitchName combo.
 * Falls back to nearest available year if exact year is missing.
 * Returns undefined if pitch type has no data in any year.
 */
export function getLeagueBaseline(
  metric: MetricName,
  pitchName: string,
  year?: number
): LeagueEntry | undefined {
  const table = METRIC_TABLES[metric]
  if (!table) return undefined

  // If year provided, try exact match
  if (year != null) {
    const exact = table[year]?.[pitchName]
    if (exact) return exact

    // Fall back to nearest year that has this pitch type
    let bestYear: number | undefined
    let bestDist = Infinity
    for (const y of AVAILABLE_YEARS) {
      if (table[y]?.[pitchName] && Math.abs(y - year) < bestDist) {
        bestDist = Math.abs(y - year)
        bestYear = y
      }
    }
    if (bestYear != null) return table[bestYear]![pitchName]
  }

  // No year: average across all available years for this pitch type
  let sum_mean = 0, sum_stddev = 0, count = 0
  for (const y of AVAILABLE_YEARS) {
    const entry = table[y]?.[pitchName]
    if (entry) { sum_mean += entry.mean; sum_stddev += entry.stddev; count++ }
  }
  if (count === 0) return undefined
  return { mean: sum_mean / count, stddev: sum_stddev / count }
}

// ── Legacy flat exports (for backward compat — averaged across all years) ────
// These are used nowhere now but kept for safety during migration
export const BRINK_LEAGUE: Record<string, LeagueEntry> = _buildPooled(BRINK_LEAGUE_BY_YEAR)
export const CLUSTER_LEAGUE: Record<string, LeagueEntry> = _buildPooled(CLUSTER_LEAGUE_BY_YEAR)
export const HDEV_LEAGUE: Record<string, LeagueEntry> = _buildPooled(HDEV_LEAGUE_BY_YEAR)
export const VDEV_LEAGUE: Record<string, LeagueEntry> = _buildPooled(VDEV_LEAGUE_BY_YEAR)
export const MISSFIRE_LEAGUE: Record<string, LeagueEntry> = _buildPooled(MISSFIRE_LEAGUE_BY_YEAR)

function _buildPooled(table: YearLeague): Record<string, LeagueEntry> {
  const pitchSet = new Set<string>()
  for (const y of AVAILABLE_YEARS) {
    if (table[y]) for (const p of Object.keys(table[y])) pitchSet.add(p)
  }
  const result: Record<string, LeagueEntry> = {}
  for (const p of pitchSet) {
    let sm = 0, ss = 0, n = 0
    for (const y of AVAILABLE_YEARS) {
      const e = table[y]?.[p]
      if (e) { sm += e.mean; ss += e.stddev; n++ }
    }
    if (n > 0) result[p] = { mean: sm / n, stddev: ss / n }
  }
  return result
}

// Savant-style percentile breakpoints [p10, p25, p50, p75, p90]
export const SAVANT_PERCENTILES: Record<string, { label: string; percentiles: number[]; higherBetter: boolean; unit: string }> = {
  avg_velo:   { label: 'Avg Velocity',  unit: 'mph', percentiles: [88.5, 90.8, 93.2, 95.1, 97.0], higherBetter: true },
  max_velo:   { label: 'Max Velocity',  unit: 'mph', percentiles: [91.2, 93.5, 96.0, 97.8, 99.5], higherBetter: true },
  k_pct:      { label: 'K%',            unit: '%',   percentiles: [16.4, 18.9, 21.9, 25.0, 28.4], higherBetter: true },
  bb_pct:     { label: 'BB%',           unit: '%',   percentiles: [6.2, 7.4, 9.0, 10.8, 12.8],    higherBetter: false },
  whiff_pct:  { label: 'Whiff%',        unit: '%',   percentiles: [18.0, 22.0, 26.0, 31.0, 36.0], higherBetter: true },
  chase_pct:  { label: 'Chase%',        unit: '%',   percentiles: [24.0, 27.0, 30.0, 34.0, 38.0], higherBetter: true },
  barrel_pct: { label: 'Barrel%',       unit: '%',   percentiles: [0.7, 1.1, 1.5, 1.8, 2.3],      higherBetter: false },
  hard_hit:   { label: 'Hard Hit%',     unit: '%',   percentiles: [20.3, 22.2, 24.1, 26.3, 28.7], higherBetter: false },
  avg_ev:     { label: 'Avg EV',        unit: 'mph', percentiles: [81.1, 81.9, 82.6, 83.4, 84.1], higherBetter: false },
  xba:        { label: 'xBA',           unit: '',    percentiles: [0.295, 0.308, 0.319, 0.330, 0.344], higherBetter: false },
  gb_pct:     { label: 'GB%',           unit: '%',   percentiles: [16.5, 19.0, 22.2, 25.6, 29.6], higherBetter: true },
  avg_spin:   { label: 'Spin Rate',     unit: 'rpm', percentiles: [2050, 2180, 2320, 2450, 2600],  higherBetter: true },
  extension:  { label: 'Extension',     unit: 'ft',  percentiles: [5.8, 6.1, 6.3, 6.6, 6.9],      higherBetter: true },
  ivb_ff:     { label: 'IVB (FF)',      unit: 'in',  percentiles: [12.0, 14.0, 16.0, 18.0, 20.5], higherBetter: true },
  vaa_ff:     { label: 'VAA (FF)',      unit: '°',   percentiles: [-6.8, -6.2, -5.5, -4.9, -4.2], higherBetter: true },
  unique_score:     { label: 'Unique',      unit: '',  percentiles: [0.44, 0.56, 0.73, 0.93, 1.21], higherBetter: true },
  deception_score:  { label: 'Deception',   unit: '',  percentiles: [-0.45, -0.22, 0.02, 0.25, 0.48], higherBetter: true },
  xdeception_score: { label: 'xDeception',  unit: '',  percentiles: [-1.31, -0.58, -0.03, 0.58, 1.11], higherBetter: true },
}

export function computePercentile(value: number, percentiles: number[], higherBetter: boolean): number {
  const pcts = [10, 25, 50, 75, 90]
  const vals = higherBetter ? percentiles : [...percentiles].reverse()
  const pctsUsed = higherBetter ? pcts : [90, 75, 50, 25, 10]

  if (value <= vals[0]) return pctsUsed[0]
  if (value >= vals[vals.length - 1]) return pctsUsed[pctsUsed.length - 1]

  for (let i = 0; i < vals.length - 1; i++) {
    if (value >= vals[i] && value <= vals[i + 1]) {
      const frac = (value - vals[i]) / (vals[i + 1] - vals[i])
      return pctsUsed[i] + frac * (pctsUsed[i + 1] - pctsUsed[i])
    }
  }
  return 50
}

export function percentileColor(pct: number): string {
  // red (0) → yellow (50) → blue (100)
  if (pct <= 50) {
    const t = pct / 50
    const r = Math.round(220 - t * 100)
    const g = Math.round(50 + t * 170)
    const b = Math.round(50 + t * 20)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (pct - 50) / 50
    const r = Math.round(120 - t * 80)
    const g = Math.round(220 - t * 80)
    const b = Math.round(70 + t * 180)
    return `rgb(${r},${g},${b})`
  }
}

export function computePlus(pitcherAvg: number, leagueMean: number, leagueStddev: number): number {
  return ((pitcherAvg - leagueMean) / leagueStddev) * 10 + 100
}

// Normal CDF approximation (Abramowitz & Stegun)
function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1.0 + sign * y)
}

/** Convert a plus stat to a league percentile rank (0–99) */
export function plusToPercentile(plus: number): number {
  const z = (plus - 100) / 10
  return Math.max(1, Math.min(99, Math.round(normalCDF(z) * 100)))
}

// Command+ weights — theory-weighted, 3 non-redundant components
// (Cluster+ subsumes HDev+/VDev+ so they are dropped)
export const COMMAND_WEIGHTS = { brinkPlus: 0.40, clusterPlus: 0.30, missfirePlus: 0.30 }

// RPCom+ weights — outcome-weighted from |corr| with xwOBA-against
// (pitcher×pitch_type level, 2020–2025, min 50 pitches, n=5680)
export const RPCOM_WEIGHTS = { brinkPlus: 0.31, clusterPlus: 0.16, hdevPlus: 0.09, vdevPlus: 0.15, missfirePlus: 0.29 }

/**
 * Compute a year-weighted plus stat for a set of pitches.
 * Groups pitches by game_year, computes the metric per year-group,
 * looks up the year-specific league baseline, and usage-weights the result.
 */
export function computeYearWeightedPlus(
  pitches: any[],
  pitchName: string,
  metric: MetricName,
  valueFn: (pts: any[]) => number | null,
  invert: boolean = false
): number | null {
  const yearGroups: Record<number, any[]> = {}
  pitches.forEach((p: any) => {
    const y = p.game_year
    if (y != null) { if (!yearGroups[y]) yearGroups[y] = []; yearGroups[y].push(p) }
  })
  let wtSum = 0, wt = 0
  for (const [yStr, yPts] of Object.entries(yearGroups)) {
    const year = Number(yStr)
    const avg = valueFn(yPts)
    const bl = getLeagueBaseline(metric, pitchName, year)
    if (avg != null && bl) {
      let plus = computePlus(avg, bl.mean, bl.stddev)
      if (invert) plus = 100 - (plus - 100)
      wtSum += plus * yPts.length
      wt += yPts.length
    }
  }
  return wt > 0 ? Math.round(wtSum / wt) : null
}

export function computeCommandPlus(brinkPlus: number, clusterPlus: number, missfirePlus: number): number {
  return Math.round(
    COMMAND_WEIGHTS.brinkPlus * brinkPlus +
    COMMAND_WEIGHTS.clusterPlus * clusterPlus +
    COMMAND_WEIGHTS.missfirePlus * missfirePlus
  )
}

export function computeRPComPlus(brinkPlus: number, clusterPlus: number, hdevPlus: number, vdevPlus: number, missfirePlus: number): number {
  return Math.round(
    RPCOM_WEIGHTS.brinkPlus * brinkPlus +
    RPCOM_WEIGHTS.clusterPlus * clusterPlus +
    RPCOM_WEIGHTS.hdevPlus * hdevPlus +
    RPCOM_WEIGHTS.vdevPlus * vdevPlus +
    RPCOM_WEIGHTS.missfirePlus * missfirePlus
  )
}

// ── DECEPTION METRICS ────────────────────────────────────────────────────────

const FASTBALL_TYPES = new Set(['FF', 'SI', 'FC', '4-Seam Fastball', 'Sinker', 'Cutter'])

// Unique weights (absolute z-scores)
const FB_UNIQUE_W = { vaa: 0.25, vb: 0.15, hb: 0.20, haa: 0.20, ext: 0.20 }
const OS_UNIQUE_W = { vaa: 0.30, vb: 0.20, hb: 0.25, haa: 0.25 }

// Deception weights (signed z-scores)
const FB_DECEPTION_W = { vaa: -0.25, ext: 0.35, vb: 0.20, hb: -0.10, haa: -0.10 }
const OS_DECEPTION_W = { vaa: 0.35, ext: 0.25, vb: 0.20, hb: -0.10, haa: 0.10 }

// xDeception regression coefficients
const XD_COEFF = {
  fb_vaa: -1.2219, fb_haa: -0.2740, fb_vb: 0.3830, fb_hb: -0.2684, fb_ext: -0.8779,
  os_vaa: 1.1265, os_haa: 0.3900, os_vb: 0.0947, os_hb: -0.2621, os_ext: 1.2845,
}

export function isFastball(pitchType: string): boolean {
  return FASTBALL_TYPES.has(pitchType)
}

export interface ZScores {
  vaa: number | null
  haa: number | null
  vb: number | null
  hb: number | null
  ext: number | null
}

export function computeUniqueScore(zScores: ZScores, fb: boolean): number | null {
  if (fb) {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null || zScores.ext == null) return null
    return FB_UNIQUE_W.vaa * Math.abs(zScores.vaa) +
      FB_UNIQUE_W.vb * Math.abs(zScores.vb) +
      FB_UNIQUE_W.hb * Math.abs(zScores.hb) +
      FB_UNIQUE_W.haa * Math.abs(zScores.haa) +
      FB_UNIQUE_W.ext * Math.abs(zScores.ext)
  } else {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null) return null
    return OS_UNIQUE_W.vaa * Math.abs(zScores.vaa) +
      OS_UNIQUE_W.vb * Math.abs(zScores.vb) +
      OS_UNIQUE_W.hb * Math.abs(zScores.hb) +
      OS_UNIQUE_W.haa * Math.abs(zScores.haa)
  }
}

export function computeDeceptionScore(zScores: ZScores, fb: boolean): number | null {
  if (fb) {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null || zScores.ext == null) return null
    return FB_DECEPTION_W.vaa * zScores.vaa +
      FB_DECEPTION_W.ext * zScores.ext +
      FB_DECEPTION_W.vb * zScores.vb +
      FB_DECEPTION_W.hb * zScores.hb +
      FB_DECEPTION_W.haa * zScores.haa
  } else {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null) return null
    return OS_DECEPTION_W.vaa * zScores.vaa +
      (zScores.ext != null ? OS_DECEPTION_W.ext * zScores.ext : 0) +
      OS_DECEPTION_W.vb * zScores.vb +
      OS_DECEPTION_W.hb * zScores.hb +
      OS_DECEPTION_W.haa * zScores.haa
  }
}

export function computeXDeceptionScore(
  fbZ: { vaa: number; haa: number; vb: number; hb: number; ext: number },
  osZ: { vaa: number; haa: number; vb: number; hb: number; ext: number }
): number {
  return XD_COEFF.fb_vaa * fbZ.vaa + XD_COEFF.fb_haa * fbZ.haa + XD_COEFF.fb_vb * fbZ.vb +
    XD_COEFF.fb_hb * fbZ.hb + XD_COEFF.fb_ext * fbZ.ext +
    XD_COEFF.os_vaa * osZ.vaa + XD_COEFF.os_haa * osZ.haa + XD_COEFF.os_vb * osZ.vb +
    XD_COEFF.os_hb * osZ.hb + XD_COEFF.os_ext * osZ.ext
}
