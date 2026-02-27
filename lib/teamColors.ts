/**
 * teamColors — MLB team color palettes for theming Scene Composer elements.
 */

export interface TeamPalette {
  name: string
  primary: string
  secondary: string
  accent: string
}

export const TEAM_COLORS: Record<string, TeamPalette> = {
  ARI: { name: 'D-backs', primary: '#A71930', secondary: '#E3D4AD', accent: '#000000' },
  ATL: { name: 'Braves', primary: '#CE1141', secondary: '#13274F', accent: '#EAAA00' },
  BAL: { name: 'Orioles', primary: '#DF4601', secondary: '#000000', accent: '#FFFFFF' },
  BOS: { name: 'Red Sox', primary: '#BD3039', secondary: '#0C2340', accent: '#FFFFFF' },
  CHC: { name: 'Cubs', primary: '#0E3386', secondary: '#CC3433', accent: '#FFFFFF' },
  CWS: { name: 'White Sox', primary: '#27251F', secondary: '#C4CED4', accent: '#FFFFFF' },
  CIN: { name: 'Reds', primary: '#C6011F', secondary: '#000000', accent: '#FFFFFF' },
  CLE: { name: 'Guardians', primary: '#00385D', secondary: '#E50022', accent: '#FFFFFF' },
  COL: { name: 'Rockies', primary: '#33006F', secondary: '#C4CED4', accent: '#000000' },
  DET: { name: 'Tigers', primary: '#0C2340', secondary: '#FA4616', accent: '#FFFFFF' },
  HOU: { name: 'Astros', primary: '#002D62', secondary: '#EB6E1F', accent: '#F4911E' },
  KC: { name: 'Royals', primary: '#004687', secondary: '#BD9B60', accent: '#FFFFFF' },
  LAA: { name: 'Angels', primary: '#BA0021', secondary: '#003263', accent: '#C4CED4' },
  LAD: { name: 'Dodgers', primary: '#005A9C', secondary: '#EF3E42', accent: '#FFFFFF' },
  MIA: { name: 'Marlins', primary: '#00A3E0', secondary: '#EF3340', accent: '#000000' },
  MIL: { name: 'Brewers', primary: '#FFC52F', secondary: '#12284B', accent: '#FFFFFF' },
  MIN: { name: 'Twins', primary: '#002B5C', secondary: '#D31145', accent: '#B9975B' },
  NYM: { name: 'Mets', primary: '#002D72', secondary: '#FF5910', accent: '#FFFFFF' },
  NYY: { name: 'Yankees', primary: '#003087', secondary: '#C4CED4', accent: '#FFFFFF' },
  OAK: { name: 'Athletics', primary: '#003831', secondary: '#EFB21E', accent: '#FFFFFF' },
  PHI: { name: 'Phillies', primary: '#E81828', secondary: '#002D72', accent: '#FFFFFF' },
  PIT: { name: 'Pirates', primary: '#27251F', secondary: '#FDB827', accent: '#FFFFFF' },
  SD: { name: 'Padres', primary: '#2F241D', secondary: '#FFC425', accent: '#FFFFFF' },
  SF: { name: 'Giants', primary: '#FD5A1E', secondary: '#27251F', accent: '#EFD19F' },
  SEA: { name: 'Mariners', primary: '#0C2C56', secondary: '#005C5C', accent: '#C4CED4' },
  STL: { name: 'Cardinals', primary: '#C41E3A', secondary: '#0C2340', accent: '#FEDB00' },
  TB: { name: 'Rays', primary: '#092C5C', secondary: '#8FBCE6', accent: '#F5D130' },
  TEX: { name: 'Rangers', primary: '#003278', secondary: '#C0111F', accent: '#FFFFFF' },
  TOR: { name: 'Blue Jays', primary: '#134A8E', secondary: '#1D2D5C', accent: '#E8291C' },
  WSH: { name: 'Nationals', primary: '#AB0003', secondary: '#14225A', accent: '#FFFFFF' },
}

export const TEAM_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No Theme' },
  ...Object.entries(TEAM_COLORS).map(([key, tc]) => ({
    value: key,
    label: `${key} — ${tc.name}`,
  })),
]
