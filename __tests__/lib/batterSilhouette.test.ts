import { describe, it, expect } from 'vitest'
import {
  detectStand, standLabel, standSide, silhouetteGeometry,
  batterSilhouetteImages, batterStandAnnotation, batterStandLayout,
} from '@/lib/batterSilhouette'

describe('detectStand', () => {
  it('returns the side when every pitch shares it', () => {
    expect(detectStand([{ stand: 'L' }, { stand: 'L' }])).toBe('L')
    expect(detectStand([{ stand: 'R' }])).toBe('R')
  })

  it('returns null for mixed or empty data', () => {
    expect(detectStand([{ stand: 'L' }, { stand: 'R' }])).toBeNull()
    expect(detectStand([])).toBeNull()
    expect(detectStand([{ stand: null }, { plate_x: 0 }])).toBeNull()
  })

  it('lets a single-value stand filter win over mixed data', () => {
    expect(detectStand([{ stand: 'L' }, { stand: 'R' }], ['R'])).toBe('R')
    expect(detectStand([{ stand: 'L' }, { stand: 'R' }], ['L', 'R'])).toBeNull()
  })
})

describe('standLabel', () => {
  it('spells out the hitter side', () => {
    expect(standLabel('L')).toBe('vs LHH')
    expect(standLabel('R')).toBe('vs RHH')
  })
})

describe('standSide / silhouetteGeometry', () => {
  // Statcast plate_x is catcher's view: RHB stands at negative x (3B side).
  // toPitcherX negates, so on pitcher-view charts the RHB lands on the right.
  it('puts the RHB on the right and LHB on the left in pitcher view (default)', () => {
    expect(standSide('R')).toBe('right')
    expect(standSide('L')).toBe('left')
    expect(silhouetteGeometry('R').x0).toBeGreaterThan(0)
    expect(silhouetteGeometry('L').x1).toBeLessThan(0)
  })

  it('mirrors for catcher view (raw plate_x)', () => {
    expect(standSide('R', 'catcher')).toBe('left')
    expect(standSide('L', 'catcher')).toBe('right')
  })

  it('picks the image that faces the zone from its side', () => {
    // batter-silhouette.png faces right → used on the left side
    expect(silhouetteGeometry('L', 'pitcher').src).toBe('/batter-silhouette.png')
    expect(silhouetteGeometry('R', 'catcher').src).toBe('/batter-silhouette.png')
    expect(silhouetteGeometry('R', 'pitcher').src).toBe('/batter-silhouette-lhb.png')
    expect(silhouetteGeometry('L', 'catcher').src).toBe('/batter-silhouette-lhb.png')
  })

  it('keeps the silhouette box beside the strike zone', () => {
    // Box inner edge sits at |x| = 0.7 ft; the PNG has transparent margins so
    // the visible batter stays clear of the 0.708 ft zone edge.
    for (const stand of ['L', 'R'] as const) {
      for (const o of ['pitcher', 'catcher'] as const) {
        const g = silhouetteGeometry(stand, o)
        const besideZone = g.x1 <= -0.69 || g.x0 >= 0.69
        expect(besideZone).toBe(true)
      }
    }
  })
})

describe('Plotly helpers', () => {
  it('return nothing for a null stand', () => {
    expect(batterSilhouetteImages(null)).toEqual([])
    expect(batterStandAnnotation(null)).toEqual([])
    expect(batterStandLayout(null)).toEqual({ images: [], annotations: [] })
  })

  it('places the badge in the top corner on the batter side', () => {
    const [r] = batterStandAnnotation('R')
    expect(r.text).toBe('vs RHH')
    expect(r.xref).toBe('paper')
    expect(r.xanchor).toBe('right')
    expect(r.x).toBeGreaterThan(0.5)

    const [l] = batterStandAnnotation('L', { orientation: 'catcher' })
    expect(l.xanchor).toBe('right')
  })

  it('anchors the image box to the silhouette geometry', () => {
    const [img] = batterSilhouetteImages('R', { opacity: 0.5 })
    const g = silhouetteGeometry('R')
    expect(img.x).toBe(g.x0)
    expect(img.y).toBe(g.yTop)
    expect(img.sizex).toBeCloseTo(g.x1 - g.x0)
    expect(img.opacity).toBe(0.5)
    expect(img.layer).toBe('below')
  })
})
