// FanGraphs Guts! season constants (2015–2025)
// Source: https://www.fangraphs.com/guts.aspx?type=cn

export const SEASON_CONSTANTS: Record<number, {
  woba: number; woba_scale: number; wbb: number; whbp: number
  w1b: number; w2b: number; w3b: number; whr: number
  run_sb: number; run_cs: number; r_pa: number; r_w: number; cfip: number
  lg_era: number; lg_babip: number; lg_k_pct: number; lg_bb_pct: number; lg_hr_pct: number
}> = {
  2015: { woba: .313, woba_scale: 1.251, wbb: .687, whbp: .718, w1b: .881, w2b: 1.256, w3b: 1.594, whr: 2.065, run_sb: .200, run_cs: -.392, r_pa: .112, r_w: 9.421, cfip: 3.134, lg_era: 3.96, lg_babip: .299, lg_k_pct: .207, lg_bb_pct: .076, lg_hr_pct: .030 },
  2016: { woba: .318, woba_scale: 1.212, wbb: .691, whbp: .721, w1b: .878, w2b: 1.242, w3b: 1.569, whr: 2.015, run_sb: .200, run_cs: -.410, r_pa: .118, r_w: 9.778, cfip: 3.147, lg_era: 4.18, lg_babip: .300, lg_k_pct: .213, lg_bb_pct: .081, lg_hr_pct: .033 },
  2017: { woba: .321, woba_scale: 1.185, wbb: .693, whbp: .723, w1b: .877, w2b: 1.232, w3b: 1.552, whr: 1.980, run_sb: .200, run_cs: -.423, r_pa: .122, r_w: 10.048, cfip: 3.158, lg_era: 4.36, lg_babip: .300, lg_k_pct: .215, lg_bb_pct: .084, lg_hr_pct: .035 },
  2018: { woba: .315, woba_scale: 1.226, wbb: .690, whbp: .720, w1b: .880, w2b: 1.247, w3b: 1.578, whr: 2.031, run_sb: .200, run_cs: -.407, r_pa: .117, r_w: 9.714, cfip: 3.160, lg_era: 4.15, lg_babip: .296, lg_k_pct: .223, lg_bb_pct: .082, lg_hr_pct: .032 },
  2019: { woba: .320, woba_scale: 1.157, wbb: .690, whbp: .719, w1b: .870, w2b: 1.217, w3b: 1.529, whr: 1.940, run_sb: .200, run_cs: -.435, r_pa: .126, r_w: 10.296, cfip: 3.214, lg_era: 4.51, lg_babip: .298, lg_k_pct: .230, lg_bb_pct: .086, lg_hr_pct: .038 },
  2020: { woba: .320, woba_scale: 1.185, wbb: .699, whbp: .728, w1b: .883, w2b: 1.238, w3b: 1.558, whr: 1.979, run_sb: .200, run_cs: -.435, r_pa: .125, r_w: 10.282, cfip: 3.191, lg_era: 4.44, lg_babip: .292, lg_k_pct: .234, lg_bb_pct: .091, lg_hr_pct: .036 },
  2021: { woba: .314, woba_scale: 1.209, wbb: .692, whbp: .722, w1b: .879, w2b: 1.242, w3b: 1.568, whr: 2.007, run_sb: .200, run_cs: -.419, r_pa: .121, r_w: 9.973, cfip: 3.170, lg_era: 4.26, lg_babip: .292, lg_k_pct: .234, lg_bb_pct: .084, lg_hr_pct: .035 },
  2022: { woba: .310, woba_scale: 1.259, wbb: .689, whbp: .720, w1b: .884, w2b: 1.261, w3b: 1.601, whr: 2.072, run_sb: .200, run_cs: -.397, r_pa: .114, r_w: 9.524, cfip: 3.112, lg_era: 3.97, lg_babip: .289, lg_k_pct: .222, lg_bb_pct: .080, lg_hr_pct: .029 },
  2023: { woba: .318, woba_scale: 1.204, wbb: .696, whbp: .726, w1b: .883, w2b: 1.244, w3b: 1.569, whr: 2.004, run_sb: .200, run_cs: -.422, r_pa: .122, r_w: 10.028, cfip: 3.255, lg_era: 4.33, lg_babip: .296, lg_k_pct: .227, lg_bb_pct: .084, lg_hr_pct: .033 },
  2024: { woba: .310, woba_scale: 1.242, wbb: .689, whbp: .720, w1b: .882, w2b: 1.254, w3b: 1.590, whr: 2.050, run_sb: .200, run_cs: -.405, r_pa: .117, r_w: 9.683, cfip: 3.166, lg_era: 4.01, lg_babip: .291, lg_k_pct: .228, lg_bb_pct: .079, lg_hr_pct: .030 },
  2025: { woba: .313, woba_scale: 1.232, wbb: .691, whbp: .722, w1b: .882, w2b: 1.252, w3b: 1.584, whr: 2.037, run_sb: .200, run_cs: -.410, r_pa: .118, r_w: 9.774, cfip: 3.135, lg_era: 4.10, lg_babip: .293, lg_k_pct: .225, lg_bb_pct: .080, lg_hr_pct: .031 },
}

// Park factors by team (5-year rolling, 2024 FanGraphs)
// Using these as the baseline — they don't change dramatically year-to-year
// basic = overall runs, pf_hr/pf_h/pf_so/pf_bb = component factors
export const PARK_FACTORS: Record<string, {
  basic: number; pf_hr: number; pf_h?: number; pf_so: number; pf_bb: number; pf_r?: number
}> = {
  LAA: { basic: 101, pf_hr: 105, pf_so: 102, pf_bb: 100 },
  BAL: { basic: 99, pf_hr: 99, pf_so: 99, pf_bb: 97 },
  BOS: { basic: 104, pf_hr: 98, pf_so: 98, pf_bb: 101 },
  CWS: { basic: 100, pf_hr: 105, pf_so: 99, pf_bb: 101 },
  CLE: { basic: 99, pf_hr: 98, pf_so: 101, pf_bb: 101 },
  DET: { basic: 100, pf_hr: 96, pf_so: 98, pf_bb: 102 },
  KC:  { basic: 103, pf_hr: 95, pf_so: 97, pf_bb: 101 },
  MIN: { basic: 101, pf_hr: 99, pf_so: 100, pf_bb: 103 },
  NYY: { basic: 99, pf_hr: 104, pf_so: 100, pf_bb: 101 },
  OAK: { basic: 96, pf_hr: 90, pf_so: 100, pf_bb: 100 },
  ATH: { basic: 96, pf_hr: 90, pf_so: 100, pf_bb: 100 },
  SEA: { basic: 94, pf_hr: 96, pf_so: 104, pf_bb: 97 },
  TB:  { basic: 96, pf_hr: 96, pf_so: 102, pf_bb: 101 },
  TEX: { basic: 99, pf_hr: 102, pf_so: 101, pf_bb: 100 },
  TOR: { basic: 99, pf_hr: 103, pf_so: 100, pf_bb: 99 },
  ARI: { basic: 101, pf_hr: 91, pf_so: 99, pf_bb: 99 },
  ATL: { basic: 100, pf_hr: 99, pf_so: 102, pf_bb: 99 },
  CHC: { basic: 98, pf_hr: 98, pf_so: 101, pf_bb: 99 },
  CIN: { basic: 105, pf_hr: 114, pf_so: 101, pf_bb: 102 },
  COL: { basic: 113, pf_hr: 107, pf_so: 96, pf_bb: 102 },
  MIA: { basic: 101, pf_hr: 97, pf_so: 100, pf_bb: 102 },
  HOU: { basic: 99, pf_hr: 102, pf_so: 102, pf_bb: 100 },
  LAD: { basic: 99, pf_hr: 110, pf_so: 100, pf_bb: 97 },
  MIL: { basic: 99, pf_hr: 104, pf_so: 104, pf_bb: 101 },
  WSH: { basic: 100, pf_hr: 100, pf_so: 98, pf_bb: 98 },
  NYM: { basic: 96, pf_hr: 99, pf_so: 101, pf_bb: 102 },
  PHI: { basic: 101, pf_hr: 105, pf_so: 101, pf_bb: 100 },
  PIT: { basic: 102, pf_hr: 93, pf_so: 97, pf_bb: 101 },
  STL: { basic: 98, pf_hr: 94, pf_so: 97, pf_bb: 97 },
  SD:  { basic: 96, pf_hr: 101, pf_so: 102, pf_bb: 100 },
  SF:  { basic: 97, pf_hr: 91, pf_so: 98, pf_bb: 97 },
}
