// League-level pitcher distributions by year (2015-2025, min 50 pitches per pitcher per pitch type)
// Mean and stddev of pitcher-level averages, used for plus-stat normalization
// Year-partitioned centroids for Cluster/HDev/VDev

type LeagueEntry = { mean: number; stddev: number }
type YearLeague = Record<number, Record<string, LeagueEntry>>
type MetricName = 'brink' | 'cluster' | 'hdev' | 'vdev' | 'missfire' | 'stuff' | 'close_pct'

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

// ── MISSFIRE (avg miss distance in inches for outside-zone pitches) ──────────
export const MISSFIRE_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 6.06, stddev: 0.67 }, 'Slider': { mean: 7.78, stddev: 1.35 },
    'Sinker': { mean: 6.25, stddev: 0.78 }, 'Changeup': { mean: 7.70, stddev: 1.24 },
    'Curveball': { mean: 8.66, stddev: 1.52 }, 'Cutter': { mean: 6.41, stddev: 1.07 },
    'Split-Finger': { mean: 8.46, stddev: 1.68 }, 'Knuckle Curve': { mean: 8.76, stddev: 1.74 },
  },
  2016: {
    '4-Seam Fastball': { mean: 6.13, stddev: 0.76 }, 'Slider': { mean: 7.74, stddev: 1.35 },
    'Sinker': { mean: 6.26, stddev: 0.83 }, 'Changeup': { mean: 7.75, stddev: 1.31 },
    'Curveball': { mean: 8.80, stddev: 1.64 }, 'Cutter': { mean: 6.62, stddev: 1.27 },
    'Split-Finger': { mean: 8.96, stddev: 3.51 }, 'Knuckle Curve': { mean: 8.83, stddev: 1.46 },
  },
  2017: {
    '4-Seam Fastball': { mean: 6.16, stddev: 0.78 }, 'Slider': { mean: 7.79, stddev: 1.25 },
    'Sinker': { mean: 6.15, stddev: 0.75 }, 'Changeup': { mean: 7.69, stddev: 1.28 },
    'Curveball': { mean: 8.61, stddev: 1.60 }, 'Cutter': { mean: 6.80, stddev: 1.07 },
    'Sweeper': { mean: 8.45, stddev: 1.46 }, 'Split-Finger': { mean: 8.60, stddev: 1.31 },
    'Knuckle Curve': { mean: 8.74, stddev: 1.45 },
  },
  2018: {
    '4-Seam Fastball': { mean: 6.25, stddev: 0.80 }, 'Slider': { mean: 7.97, stddev: 1.34 },
    'Sinker': { mean: 6.16, stddev: 0.79 }, 'Changeup': { mean: 7.68, stddev: 1.32 },
    'Curveball': { mean: 8.48, stddev: 1.49 }, 'Cutter': { mean: 6.68, stddev: 1.08 },
    'Sweeper': { mean: 8.14, stddev: 1.46 }, 'Split-Finger': { mean: 9.02, stddev: 1.61 },
    'Knuckle Curve': { mean: 8.90, stddev: 1.26 },
  },
  2019: {
    '4-Seam Fastball': { mean: 6.31, stddev: 0.82 }, 'Slider': { mean: 7.97, stddev: 1.36 },
    'Sinker': { mean: 6.09, stddev: 0.77 }, 'Changeup': { mean: 7.71, stddev: 1.28 },
    'Curveball': { mean: 8.80, stddev: 1.75 }, 'Cutter': { mean: 6.63, stddev: 1.13 },
    'Sweeper': { mean: 8.39, stddev: 1.10 }, 'Split-Finger': { mean: 8.87, stddev: 1.54 },
    'Knuckle Curve': { mean: 9.28, stddev: 1.52 },
  },
  2020: {
    '4-Seam Fastball': { mean: 6.30, stddev: 0.93 }, 'Slider': { mean: 8.13, stddev: 1.42 },
    'Sinker': { mean: 5.99, stddev: 0.87 }, 'Changeup': { mean: 7.53, stddev: 1.45 },
    'Curveball': { mean: 9.07, stddev: 1.84 }, 'Cutter': { mean: 6.73, stddev: 1.30 },
    'Sweeper': { mean: 8.31, stddev: 1.29 }, 'Split-Finger': { mean: 8.45, stddev: 1.46 },
    'Knuckle Curve': { mean: 9.24, stddev: 1.58 },
  },
  2021: {
    '4-Seam Fastball': { mean: 6.40, stddev: 0.84 }, 'Slider': { mean: 8.07, stddev: 1.30 },
    'Sinker': { mean: 5.99, stddev: 0.86 }, 'Changeup': { mean: 7.69, stddev: 1.30 },
    'Curveball': { mean: 9.19, stddev: 1.84 }, 'Cutter': { mean: 6.53, stddev: 1.14 },
    'Sweeper': { mean: 8.05, stddev: 1.43 }, 'Split-Finger': { mean: 9.07, stddev: 1.56 },
    'Knuckle Curve': { mean: 9.51, stddev: 1.81 },
  },
  2022: {
    '4-Seam Fastball': { mean: 6.32, stddev: 0.87 }, 'Slider': { mean: 7.84, stddev: 1.17 },
    'Sinker': { mean: 5.71, stddev: 0.74 }, 'Changeup': { mean: 7.65, stddev: 1.31 },
    'Curveball': { mean: 8.66, stddev: 1.73 }, 'Cutter': { mean: 6.34, stddev: 1.01 },
    'Sweeper': { mean: 7.84, stddev: 1.17 }, 'Split-Finger': { mean: 8.30, stddev: 1.34 },
    'Knuckle Curve': { mean: 8.98, stddev: 1.35 },
  },
  2023: {
    '4-Seam Fastball': { mean: 6.29, stddev: 0.91 }, 'Slider': { mean: 7.76, stddev: 1.23 },
    'Sinker': { mean: 5.72, stddev: 0.79 }, 'Changeup': { mean: 7.75, stddev: 1.47 },
    'Curveball': { mean: 8.70, stddev: 1.74 }, 'Cutter': { mean: 6.25, stddev: 1.01 },
    'Sweeper': { mean: 7.91, stddev: 1.31 }, 'Split-Finger': { mean: 8.64, stddev: 1.57 },
    'Knuckle Curve': { mean: 9.08, stddev: 1.58 }, 'Slurve': { mean: 7.78, stddev: 1.18 },
  },
  2024: {
    '4-Seam Fastball': { mean: 6.26, stddev: 0.91 }, 'Slider': { mean: 7.79, stddev: 1.31 },
    'Sinker': { mean: 5.65, stddev: 0.77 }, 'Changeup': { mean: 7.61, stddev: 1.29 },
    'Curveball': { mean: 8.66, stddev: 1.66 }, 'Cutter': { mean: 6.26, stddev: 0.98 },
    'Sweeper': { mean: 7.93, stddev: 1.24 }, 'Split-Finger': { mean: 8.15, stddev: 1.15 },
    'Knuckle Curve': { mean: 9.35, stddev: 1.80 }, 'Slurve': { mean: 8.16, stddev: 1.22 },
  },
  2025: {
    '4-Seam Fastball': { mean: 6.13, stddev: 0.91 }, 'Slider': { mean: 7.58, stddev: 1.28 },
    'Sinker': { mean: 5.60, stddev: 0.82 }, 'Changeup': { mean: 7.70, stddev: 1.30 },
    'Curveball': { mean: 8.57, stddev: 1.61 }, 'Cutter': { mean: 6.21, stddev: 1.09 },
    'Sweeper': { mean: 7.80, stddev: 1.19 }, 'Split-Finger': { mean: 8.30, stddev: 1.29 },
    'Knuckle Curve': { mean: 8.88, stddev: 1.49 }, 'Slurve': { mean: 8.29, stddev: 1.99 },
  },
}

// ── CLOSE% (% of zone misses within 2" of edge) ────────────────────────────
export const CLOSE_PCT_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 18.44, stddev: 4.33 }, 'Slider': { mean: 12.86, stddev: 4.80 },
    'Sinker': { mean: 17.10, stddev: 5.03 }, 'Changeup': { mean: 12.46, stddev: 4.93 },
    'Curveball': { mean: 11.27, stddev: 5.00 }, 'Cutter': { mean: 17.01, stddev: 4.68 },
    'Split-Finger': { mean: 11.83, stddev: 2.79 }, 'Knuckle Curve': { mean: 11.55, stddev: 4.37 },
  },
  2016: {
    '4-Seam Fastball': { mean: 18.32, stddev: 4.66 }, 'Slider': { mean: 13.40, stddev: 4.95 },
    'Sinker': { mean: 17.31, stddev: 5.26 }, 'Changeup': { mean: 12.46, stddev: 4.80 },
    'Curveball': { mean: 11.62, stddev: 4.65 }, 'Cutter': { mean: 16.66, stddev: 5.08 },
    'Split-Finger': { mean: 10.48, stddev: 2.98 }, 'Knuckle Curve': { mean: 11.58, stddev: 4.15 },
  },
  2017: {
    '4-Seam Fastball': { mean: 17.37, stddev: 4.25 }, 'Slider': { mean: 13.52, stddev: 4.59 },
    'Sinker': { mean: 17.31, stddev: 4.96 }, 'Changeup': { mean: 12.81, stddev: 5.02 },
    'Curveball': { mean: 12.14, stddev: 4.69 }, 'Cutter': { mean: 16.08, stddev: 4.49 },
    'Sweeper': { mean: 12.08, stddev: 3.88 }, 'Split-Finger': { mean: 10.66, stddev: 3.28 },
    'Knuckle Curve': { mean: 11.58, stddev: 3.32 },
  },
  2018: {
    '4-Seam Fastball': { mean: 17.42, stddev: 4.67 }, 'Slider': { mean: 12.94, stddev: 4.95 },
    'Sinker': { mean: 17.49, stddev: 4.94 }, 'Changeup': { mean: 12.89, stddev: 4.72 },
    'Curveball': { mean: 12.41, stddev: 4.82 }, 'Cutter': { mean: 16.32, stddev: 5.03 },
    'Sweeper': { mean: 13.54, stddev: 3.69 }, 'Split-Finger': { mean: 10.11, stddev: 3.90 },
    'Knuckle Curve': { mean: 11.55, stddev: 4.02 },
  },
  2019: {
    '4-Seam Fastball': { mean: 17.30, stddev: 4.53 }, 'Slider': { mean: 12.74, stddev: 4.76 },
    'Sinker': { mean: 17.43, stddev: 4.89 }, 'Changeup': { mean: 12.30, stddev: 4.82 },
    'Curveball': { mean: 11.54, stddev: 4.64 }, 'Cutter': { mean: 15.67, stddev: 4.81 },
    'Sweeper': { mean: 11.74, stddev: 3.84 }, 'Split-Finger': { mean: 10.18, stddev: 5.04 },
    'Knuckle Curve': { mean: 10.55, stddev: 4.11 },
  },
  2020: {
    '4-Seam Fastball': { mean: 17.59, stddev: 5.64 }, 'Slider': { mean: 12.18, stddev: 5.35 },
    'Sinker': { mean: 18.32, stddev: 5.58 }, 'Changeup': { mean: 12.60, stddev: 5.60 },
    'Curveball': { mean: 11.03, stddev: 5.58 }, 'Cutter': { mean: 15.86, stddev: 6.30 },
    'Sweeper': { mean: 13.16, stddev: 5.58 }, 'Split-Finger': { mean: 11.07, stddev: 4.68 },
    'Knuckle Curve': { mean: 9.69, stddev: 4.31 },
  },
  2021: {
    '4-Seam Fastball': { mean: 17.22, stddev: 4.69 }, 'Slider': { mean: 12.57, stddev: 4.47 },
    'Sinker': { mean: 18.16, stddev: 4.98 }, 'Changeup': { mean: 12.34, stddev: 4.72 },
    'Curveball': { mean: 10.85, stddev: 4.50 }, 'Cutter': { mean: 16.50, stddev: 5.35 },
    'Sweeper': { mean: 12.69, stddev: 4.91 }, 'Split-Finger': { mean: 11.04, stddev: 3.93 },
    'Knuckle Curve': { mean: 11.21, stddev: 4.65 },
  },
  2022: {
    '4-Seam Fastball': { mean: 16.94, stddev: 4.29 }, 'Slider': { mean: 12.65, stddev: 4.13 },
    'Sinker': { mean: 18.94, stddev: 4.95 }, 'Changeup': { mean: 12.29, stddev: 4.84 },
    'Curveball': { mean: 11.96, stddev: 4.55 }, 'Cutter': { mean: 17.20, stddev: 5.50 },
    'Sweeper': { mean: 14.06, stddev: 4.50 }, 'Split-Finger': { mean: 11.02, stddev: 4.83 },
    'Knuckle Curve': { mean: 10.75, stddev: 4.12 },
  },
  2023: {
    '4-Seam Fastball': { mean: 17.05, stddev: 4.72 }, 'Slider': { mean: 12.67, stddev: 4.64 },
    'Sinker': { mean: 19.40, stddev: 5.43 }, 'Changeup': { mean: 12.24, stddev: 4.89 },
    'Curveball': { mean: 11.09, stddev: 5.01 }, 'Cutter': { mean: 17.28, stddev: 4.99 },
    'Sweeper': { mean: 13.23, stddev: 4.61 }, 'Split-Finger': { mean: 10.12, stddev: 4.25 },
    'Knuckle Curve': { mean: 11.00, stddev: 4.13 }, 'Slurve': { mean: 13.00, stddev: 6.05 },
  },
  2024: {
    '4-Seam Fastball': { mean: 17.24, stddev: 4.70 }, 'Slider': { mean: 12.80, stddev: 4.50 },
    'Sinker': { mean: 19.95, stddev: 5.42 }, 'Changeup': { mean: 12.36, stddev: 5.18 },
    'Curveball': { mean: 11.32, stddev: 4.40 }, 'Cutter': { mean: 17.24, stddev: 5.52 },
    'Sweeper': { mean: 13.49, stddev: 5.13 }, 'Split-Finger': { mean: 11.29, stddev: 3.96 },
    'Knuckle Curve': { mean: 9.45, stddev: 3.78 }, 'Slurve': { mean: 11.35, stddev: 6.61 },
  },
  2025: {
    '4-Seam Fastball': { mean: 17.82, stddev: 4.89 }, 'Slider': { mean: 13.78, stddev: 5.50 },
    'Sinker': { mean: 20.05, stddev: 5.36 }, 'Changeup': { mean: 12.14, stddev: 4.50 },
    'Curveball': { mean: 11.44, stddev: 4.54 }, 'Cutter': { mean: 17.48, stddev: 6.20 },
    'Sweeper': { mean: 13.59, stddev: 5.12 }, 'Split-Finger': { mean: 11.11, stddev: 4.86 },
    'Knuckle Curve': { mean: 11.00, stddev: 4.08 }, 'Slurve': { mean: 12.17, stddev: 7.23 },
  },
}

// ── LEAGUE-WIDE CENTROIDS (avg plate_x / plate_z per pitch type per year, in feet) ──
// Used for computing Cluster (distance from league centroid) on single-game data
// where pitcher-level centroid is not meaningful.
type CentroidEntry = { cx: number; cz: number }
type YearCentroids = Record<number, Record<string, CentroidEntry>>

export const CENTROIDS_BY_YEAR: YearCentroids = {
  2015: {
    '4-Seam Fastball': { cx: -0.0433, cz: 2.5661 }, 'Slider': { cx: 0.1711, cz: 1.8879 },
    'Sinker': { cx: -0.1585, cz: 2.3215 }, 'Changeup': { cx: -0.1386, cz: 1.8619 },
    'Curveball': { cx: -0.0174, cz: 1.8645 }, 'Cutter': { cx: 0.1310, cz: 2.3018 },
    'Split-Finger': { cx: -0.2409, cz: 1.7304 }, 'Knuckle Curve': { cx: 0.0805, cz: 1.7993 },
    'Sweeper': { cx: 0.2289, cz: 2.0222 },
  },
  2016: {
    '4-Seam Fastball': { cx: -0.0448, cz: 2.5827 }, 'Slider': { cx: 0.2011, cz: 1.8914 },
    'Sinker': { cx: -0.1591, cz: 2.3432 }, 'Changeup': { cx: -0.1477, cz: 1.8738 },
    'Curveball': { cx: 0.0152, cz: 1.8704 }, 'Cutter': { cx: 0.1630, cz: 2.2756 },
    'Split-Finger': { cx: -0.2613, cz: 1.7266 }, 'Knuckle Curve': { cx: 0.0669, cz: 1.8012 },
    'Sweeper': { cx: 0.1308, cz: 1.8691 }, 'Slurve': { cx: 0.1757, cz: 1.7375 },
  },
  2017: {
    '4-Seam Fastball': { cx: 0.0334, cz: 2.6345 }, 'Slider': { cx: 0.2631, cz: 1.8977 },
    'Sinker': { cx: -0.0793, cz: 2.3464 }, 'Changeup': { cx: -0.0699, cz: 1.8712 },
    'Curveball': { cx: 0.0867, cz: 1.8826 }, 'Cutter': { cx: 0.2559, cz: 2.2248 },
    'Split-Finger': { cx: -0.1889, cz: 1.7083 }, 'Knuckle Curve': { cx: 0.0856, cz: 1.8602 },
    'Sweeper': { cx: 0.1918, cz: 1.9443 }, 'Slurve': { cx: 0.3462, cz: 1.7642 },
  },
  2018: {
    '4-Seam Fastball': { cx: 0.0193, cz: 2.6516 }, 'Slider': { cx: 0.2386, cz: 1.8549 },
    'Sinker': { cx: -0.0999, cz: 2.3050 }, 'Changeup': { cx: -0.0718, cz: 1.8514 },
    'Curveball': { cx: 0.0740, cz: 1.8775 }, 'Cutter': { cx: 0.1747, cz: 2.2552 },
    'Split-Finger': { cx: -0.2457, cz: 1.6387 }, 'Knuckle Curve': { cx: 0.0999, cz: 1.8109 },
    'Sweeper': { cx: 0.3070, cz: 1.9482 }, 'Slurve': { cx: 0.3468, cz: 1.8234 },
  },
  2019: {
    '4-Seam Fastball': { cx: 0.0070, cz: 2.7038 }, 'Slider': { cx: 0.2494, cz: 1.8278 },
    'Sinker': { cx: -0.1230, cz: 2.2933 }, 'Changeup': { cx: -0.0605, cz: 1.8331 },
    'Curveball': { cx: 0.0891, cz: 1.8543 }, 'Cutter': { cx: 0.1489, cz: 2.2322 },
    'Split-Finger': { cx: -0.2188, cz: 1.6361 }, 'Knuckle Curve': { cx: 0.1291, cz: 1.7540 },
    'Sweeper': { cx: 0.3659, cz: 1.9010 }, 'Slurve': { cx: 0.2678, cz: 1.7976 },
  },
  2020: {
    '4-Seam Fastball': { cx: 0.0050, cz: 2.7184 }, 'Slider': { cx: 0.2683, cz: 1.8164 },
    'Sinker': { cx: -0.1143, cz: 2.3017 }, 'Changeup': { cx: -0.0759, cz: 1.8329 },
    'Curveball': { cx: 0.1051, cz: 1.7719 }, 'Cutter': { cx: 0.1888, cz: 2.3030 },
    'Split-Finger': { cx: -0.2181, cz: 1.7058 }, 'Knuckle Curve': { cx: 0.1236, cz: 1.7552 },
    'Sweeper': { cx: 0.2453, cz: 1.9017 }, 'Slurve': { cx: 0.0343, cz: 1.8307 },
  },
  2021: {
    '4-Seam Fastball': { cx: 0.0007, cz: 2.7436 }, 'Slider': { cx: 0.2203, cz: 1.8773 },
    'Sinker': { cx: -0.0753, cz: 2.3279 }, 'Changeup': { cx: -0.0384, cz: 1.8487 },
    'Curveball': { cx: 0.0846, cz: 1.8315 }, 'Cutter': { cx: 0.1689, cz: 2.3188 },
    'Split-Finger': { cx: -0.2277, cz: 1.6972 }, 'Knuckle Curve': { cx: 0.0772, cz: 1.7850 },
    'Sweeper': { cx: 0.2532, cz: 1.9509 }, 'Slurve': { cx: 0.0897, cz: 1.7727 },
  },
  2022: {
    '4-Seam Fastball': { cx: -0.0100, cz: 2.8103 }, 'Slider': { cx: 0.2340, cz: 1.8644 },
    'Sinker': { cx: -0.1239, cz: 2.3504 }, 'Changeup': { cx: -0.0728, cz: 1.8370 },
    'Curveball': { cx: 0.0744, cz: 1.8602 }, 'Cutter': { cx: 0.2193, cz: 2.3548 },
    'Split-Finger': { cx: -0.2670, cz: 1.6841 }, 'Knuckle Curve': { cx: 0.1152, cz: 1.7962 },
    'Sweeper': { cx: 0.3205, cz: 1.9831 }, 'Slurve': { cx: 0.0206, cz: 1.8574 },
  },
  2023: {
    '4-Seam Fastball': { cx: -0.0174, cz: 2.8151 }, 'Slider': { cx: 0.2111, cz: 1.8686 },
    'Sinker': { cx: -0.1048, cz: 2.3579 }, 'Changeup': { cx: -0.0775, cz: 1.8161 },
    'Curveball': { cx: 0.0494, cz: 1.8337 }, 'Cutter': { cx: 0.1835, cz: 2.3681 },
    'Split-Finger': { cx: -0.2545, cz: 1.7292 }, 'Knuckle Curve': { cx: 0.1317, cz: 1.7331 },
    'Sweeper': { cx: 0.2861, cz: 1.9754 }, 'Slurve': { cx: 0.1026, cz: 1.8704 },
  },
  2024: {
    '4-Seam Fastball': { cx: -0.0071, cz: 2.8516 }, 'Slider': { cx: 0.2444, cz: 1.8870 },
    'Sinker': { cx: -0.0741, cz: 2.3701 }, 'Changeup': { cx: -0.0450, cz: 1.8121 },
    'Curveball': { cx: 0.0615, cz: 1.8202 }, 'Cutter': { cx: 0.1723, cz: 2.4323 },
    'Split-Finger': { cx: -0.1718, cz: 1.7072 }, 'Knuckle Curve': { cx: 0.1031, cz: 1.6848 },
    'Sweeper': { cx: 0.3075, cz: 2.0022 }, 'Slurve': { cx: 0.2486, cz: 1.8454 },
  },
  2025: {
    '4-Seam Fastball': { cx: -0.0066, cz: 2.8650 }, 'Slider': { cx: 0.2041, cz: 1.9262 },
    'Sinker': { cx: -0.0823, cz: 2.4000 }, 'Changeup': { cx: -0.0644, cz: 1.8247 },
    'Curveball': { cx: 0.0410, cz: 1.8473 }, 'Cutter': { cx: 0.1744, cz: 2.5095 },
    'Split-Finger': { cx: -0.2033, cz: 1.7588 }, 'Knuckle Curve': { cx: 0.1178, cz: 1.6719 },
    'Sweeper': { cx: 0.2660, cz: 1.9997 }, 'Slurve': { cx: 0.1683, cz: 1.8749 },
  },
}

/**
 * Get league-wide centroid for a pitch type in a given year.
 * Falls back to nearest year if exact year missing.
 */
export function getLeagueCentroid(pitchName: string, year: number): CentroidEntry | undefined {
  const exact = CENTROIDS_BY_YEAR[year]?.[pitchName]
  if (exact) return exact
  let bestYear: number | undefined
  let bestDist = Infinity
  for (const y of AVAILABLE_YEARS) {
    if (CENTROIDS_BY_YEAR[y]?.[pitchName] && Math.abs(y - year) < bestDist) {
      bestDist = Math.abs(y - year)
      bestYear = y
    }
  }
  return bestYear != null ? CENTROIDS_BY_YEAR[bestYear]![pitchName] : undefined
}

// ── STUFF (Stuff+ model — XGBoost-predicted run value, pitcher-level aggregated) ──
// Placeholder baselines — will be populated after running train.py
// These are mean/stddev of pitcher-level avg stuff_rv per pitch_type per year
export const STUFF_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: -0.0050, stddev: 0.0035 }, 'Slider': { mean: -0.0110, stddev: 0.0060 },
    'Sinker': { mean: -0.0040, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0055 },
    'Curveball': { mean: -0.0100, stddev: 0.0065 }, 'Cutter': { mean: -0.0060, stddev: 0.0045 },
    'Split-Finger': { mean: -0.0140, stddev: 0.0055 }, 'Knuckle Curve': { mean: -0.0110, stddev: 0.0070 },
  },
  2016: {
    '4-Seam Fastball': { mean: -0.0050, stddev: 0.0035 }, 'Slider': { mean: -0.0110, stddev: 0.0060 },
    'Sinker': { mean: -0.0040, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0055 },
    'Curveball': { mean: -0.0100, stddev: 0.0065 }, 'Cutter': { mean: -0.0060, stddev: 0.0045 },
    'Split-Finger': { mean: -0.0140, stddev: 0.0055 }, 'Knuckle Curve': { mean: -0.0110, stddev: 0.0070 },
  },
  2017: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0038 }, 'Slider': { mean: -0.0105, stddev: 0.0058 },
    'Sinker': { mean: -0.0035, stddev: 0.0038 }, 'Changeup': { mean: -0.0110, stddev: 0.0052 },
    'Curveball': { mean: -0.0095, stddev: 0.0062 }, 'Cutter': { mean: -0.0070, stddev: 0.0048 },
    'Sweeper': { mean: -0.0115, stddev: 0.0060 }, 'Split-Finger': { mean: -0.0135, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0105, stddev: 0.0065 },
  },
  2018: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0038 }, 'Slider': { mean: -0.0110, stddev: 0.0060 },
    'Sinker': { mean: -0.0038, stddev: 0.0040 }, 'Changeup': { mean: -0.0115, stddev: 0.0055 },
    'Curveball': { mean: -0.0098, stddev: 0.0060 }, 'Cutter': { mean: -0.0065, stddev: 0.0048 },
    'Sweeper': { mean: -0.0110, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0145, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0108, stddev: 0.0065 },
  },
  2019: {
    '4-Seam Fastball': { mean: -0.0060, stddev: 0.0040 }, 'Slider': { mean: -0.0115, stddev: 0.0060 },
    'Sinker': { mean: -0.0040, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0058 },
    'Curveball': { mean: -0.0105, stddev: 0.0068 }, 'Cutter': { mean: -0.0070, stddev: 0.0050 },
    'Sweeper': { mean: -0.0120, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0140, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0112, stddev: 0.0068 },
  },
  2020: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0042 }, 'Slider': { mean: -0.0118, stddev: 0.0065 },
    'Sinker': { mean: -0.0035, stddev: 0.0042 }, 'Changeup': { mean: -0.0112, stddev: 0.0058 },
    'Curveball': { mean: -0.0108, stddev: 0.0072 }, 'Cutter': { mean: -0.0062, stddev: 0.0052 },
    'Sweeper': { mean: -0.0110, stddev: 0.0060 }, 'Split-Finger': { mean: -0.0130, stddev: 0.0062 },
    'Knuckle Curve': { mean: -0.0110, stddev: 0.0070 },
  },
  2021: {
    '4-Seam Fastball': { mean: -0.0052, stddev: 0.0038 }, 'Slider': { mean: -0.0108, stddev: 0.0058 },
    'Sinker': { mean: -0.0030, stddev: 0.0042 }, 'Changeup': { mean: -0.0118, stddev: 0.0055 },
    'Curveball': { mean: -0.0110, stddev: 0.0070 }, 'Cutter': { mean: -0.0055, stddev: 0.0048 },
    'Sweeper': { mean: -0.0105, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0148, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0115, stddev: 0.0065 },
  },
  2022: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0040 }, 'Slider': { mean: -0.0110, stddev: 0.0058 },
    'Sinker': { mean: -0.0028, stddev: 0.0040 }, 'Changeup': { mean: -0.0122, stddev: 0.0058 },
    'Curveball': { mean: -0.0100, stddev: 0.0068 }, 'Cutter': { mean: -0.0050, stddev: 0.0045 },
    'Sweeper': { mean: -0.0108, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0140, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0108, stddev: 0.0060 },
  },
  2023: {
    '4-Seam Fastball': { mean: -0.0052, stddev: 0.0042 }, 'Slider': { mean: -0.0105, stddev: 0.0058 },
    'Sinker': { mean: -0.0025, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0060 },
    'Curveball': { mean: -0.0100, stddev: 0.0068 }, 'Cutter': { mean: -0.0045, stddev: 0.0042 },
    'Sweeper': { mean: -0.0110, stddev: 0.0060 }, 'Split-Finger': { mean: -0.0138, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0110, stddev: 0.0065 }, 'Slurve': { mean: -0.0105, stddev: 0.0055 },
  },
  2024: {
    '4-Seam Fastball': { mean: -0.0048, stddev: 0.0042 }, 'Slider': { mean: -0.0100, stddev: 0.0055 },
    'Sinker': { mean: -0.0020, stddev: 0.0040 }, 'Changeup': { mean: -0.0118, stddev: 0.0058 },
    'Curveball': { mean: -0.0098, stddev: 0.0065 }, 'Cutter': { mean: -0.0042, stddev: 0.0042 },
    'Sweeper': { mean: -0.0105, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0132, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0112, stddev: 0.0065 }, 'Slurve': { mean: -0.0108, stddev: 0.0055 },
  },
  2025: {
    '4-Seam Fastball': { mean: -0.0045, stddev: 0.0042 }, 'Slider': { mean: -0.0095, stddev: 0.0055 },
    'Sinker': { mean: -0.0018, stddev: 0.0040 }, 'Changeup': { mean: -0.0115, stddev: 0.0058 },
    'Curveball': { mean: -0.0095, stddev: 0.0068 }, 'Cutter': { mean: -0.0040, stddev: 0.0042 },
    'Sweeper': { mean: -0.0100, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0130, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0108, stddev: 0.0062 }, 'Slurve': { mean: -0.0100, stddev: 0.0050 },
  },
}

// ── STUFF LINEAR COEFFICIENTS ────────────────────────────────────────────────
// Per pitch_name: intercept + feature weights for client-side stuff_rv approximation
// Features: release_speed, pfx_x, pfx_z, release_spin_rate, spin_axis,
//           release_extension, release_pos_x, release_pos_z, arm_angle,
//           vx0, vy0, vz0, ax, ay, az, p_throws_R
// Placeholder values — will be replaced after running train.py
export const STUFF_LINEAR_FEATURES = [
  'release_speed', 'pfx_x', 'pfx_z', 'release_spin_rate', 'spin_axis',
  'release_extension', 'release_pos_x', 'release_pos_z', 'arm_angle',
  'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az', 'p_throws_R',
] as const

export type StuffLinearCoeffs = { intercept: number; weights: number[] }

export const STUFF_LINEAR_COEFFICIENTS: Record<string, StuffLinearCoeffs> = {
  '4-Seam Fastball': { intercept: 0.08, weights: [-0.0012, 0.002, 0.008, -0.000002, 0.000005, -0.002, 0.001, -0.001, 0.00005, 0.0002, -0.0001, 0.0005, 0.0001, 0.00005, 0.0003, -0.003] },
  'Sinker': { intercept: 0.06, weights: [-0.0010, 0.003, 0.006, -0.000002, 0.000004, -0.002, 0.001, -0.001, 0.00004, 0.0002, -0.0001, 0.0004, 0.0001, 0.00005, 0.0002, -0.002] },
  'Cutter': { intercept: 0.05, weights: [-0.0008, 0.004, 0.005, -0.000003, 0.000005, -0.002, 0.001, -0.001, 0.00005, 0.0003, -0.0001, 0.0004, 0.0001, 0.00004, 0.0002, -0.002] },
  'Slider': { intercept: 0.04, weights: [-0.0005, 0.005, 0.003, -0.000003, 0.000006, -0.001, 0.001, -0.001, 0.00006, 0.0003, -0.0002, 0.0003, 0.0002, 0.00005, 0.0002, -0.002] },
  'Sweeper': { intercept: 0.04, weights: [-0.0004, 0.006, 0.002, -0.000003, 0.000006, -0.001, 0.001, -0.001, 0.00006, 0.0003, -0.0002, 0.0003, 0.0002, 0.00005, 0.0002, -0.002] },
  'Curveball': { intercept: 0.03, weights: [-0.0003, 0.004, 0.004, -0.000004, 0.000005, -0.001, 0.001, -0.001, 0.00005, 0.0002, -0.0002, 0.0004, 0.0001, 0.00004, 0.0003, -0.001] },
  'Changeup': { intercept: 0.05, weights: [-0.0006, 0.003, 0.006, -0.000003, 0.000005, -0.002, 0.001, -0.001, 0.00005, 0.0002, -0.0001, 0.0004, 0.0001, 0.00005, 0.0002, -0.002] },
  'Split-Finger': { intercept: 0.06, weights: [-0.0008, 0.003, 0.007, -0.000003, 0.000005, -0.002, 0.001, -0.001, 0.00005, 0.0002, -0.0001, 0.0005, 0.0001, 0.00005, 0.0003, -0.003] },
  'Knuckle Curve': { intercept: 0.03, weights: [-0.0003, 0.004, 0.004, -0.000004, 0.000005, -0.001, 0.001, -0.001, 0.00005, 0.0002, -0.0002, 0.0004, 0.0001, 0.00004, 0.0003, -0.001] },
  'Slurve': { intercept: 0.04, weights: [-0.0004, 0.005, 0.003, -0.000003, 0.000006, -0.001, 0.001, -0.001, 0.00006, 0.0003, -0.0002, 0.0003, 0.0002, 0.00005, 0.0002, -0.002] },
}

/**
 * Compute raw stuff_rv for a single pitch using the linear approximation.
 * Returns null if any required feature is missing.
 */
export function computeStuffRV(p: any): number | null {
  const pitchName = p.pitch_name as string
  const coeffs = STUFF_LINEAR_COEFFICIENTS[pitchName]
  if (!coeffs) return null

  const vals: number[] = []
  for (const feat of STUFF_LINEAR_FEATURES) {
    if (feat === 'p_throws_R') {
      vals.push(p.p_throws === 'R' ? 1 : 0)
    } else {
      const v = p[feat]
      if (v == null) return null
      vals.push(Number(v))
    }
  }

  let rv = coeffs.intercept
  for (let i = 0; i < vals.length; i++) {
    rv += coeffs.weights[i] * vals[i]
  }
  return rv
}

// ── METRIC TABLE MAP ─────────────────────────────────────────────────────────
const METRIC_TABLES: Record<MetricName, YearLeague> = {
  brink: BRINK_LEAGUE_BY_YEAR,
  cluster: CLUSTER_LEAGUE_BY_YEAR,
  hdev: HDEV_LEAGUE_BY_YEAR,
  vdev: VDEV_LEAGUE_BY_YEAR,
  missfire: MISSFIRE_LEAGUE_BY_YEAR,
  stuff: STUFF_LEAGUE_BY_YEAR,
  close_pct: CLOSE_PCT_LEAGUE_BY_YEAR,
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
export const CLOSE_PCT_LEAGUE: Record<string, LeagueEntry> = _buildPooled(CLOSE_PCT_LEAGUE_BY_YEAR)

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
  unique_score:     { label: 'Unique',      unit: 'z',  percentiles: [0.44, 0.56, 0.73, 0.93, 1.21], higherBetter: true },
  deception_score:  { label: 'Deception',   unit: 'z',  percentiles: [-0.45, -0.22, 0.02, 0.25, 0.48], higherBetter: true },
  xdeception_score: { label: 'xDeception',  unit: 'z',  percentiles: [-1.31, -0.58, -0.03, 0.58, 1.11], higherBetter: true },
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
  // blue (0) → light gray (50) → red (100)
  if (pct <= 50) {
    // Blue to gray: at 0 = saturated blue, at 50 = light gray
    const t = pct / 50 // 0→1
    const r = Math.round(50 + t * 150)   // 50 → 200
    const g = Math.round(80 + t * 120)   // 80 → 200
    const b = Math.round(220 - t * 20)   // 220 → 200
    return `rgb(${r},${g},${b})`
  } else {
    // Gray to red: at 50 = light gray, at 100 = saturated red
    const t = (pct - 50) / 50 // 0→1
    const r = Math.round(200 + t * 30)   // 200 → 230
    const g = Math.round(200 - t * 140)  // 200 → 60
    const b = Math.round(200 - t * 150)  // 200 → 50
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

// ── PLUS-TO-GRADE CONVERSION ─────────────────────────────────────────────────

export function plusToGrade(plus: number): string {
  if (plus >= 130) return 'A+'
  if (plus >= 125) return 'A'
  if (plus >= 120) return 'A-'
  if (plus >= 115) return 'B+'
  if (plus >= 110) return 'B'
  if (plus >= 105) return 'B-'
  if (plus >= 100) return 'C+'
  if (plus >= 95) return 'C'
  if (plus >= 90) return 'C-'
  if (plus >= 85) return 'D+'
  if (plus >= 80) return 'D'
  if (plus >= 75) return 'D-'
  return 'F'
}

export function gradeColor(grade: string): string {
  const letter = grade.charAt(0)
  switch (letter) {
    case 'A': return '#10b981' // emerald
    case 'B': return '#06b6d4' // cyan
    case 'C': return '#f59e0b' // amber
    case 'D': return '#f97316' // orange
    case 'F': return '#ef4444' // red
    default: return '#a1a1aa'
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
