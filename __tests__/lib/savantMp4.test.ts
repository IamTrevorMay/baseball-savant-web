import { describe, it, expect } from 'vitest'
import { extractSavantMp4Url, decodeHtmlEntities } from '@/lib/savantMp4'

// Real markup shapes from baseballsavant.mlb.com/sporty-videos.
const withPadding =
  `<video><source src="https://sporty-clips.mlb.com/OHl3NmJfV0ZRVkV3dEdEUT09X0JnRUR&#x3D;&#x3D;.mp4" type="video/mp4"></video>`
const withoutPadding =
  `<video><source src="https://sporty-clips.mlb.com/RDFBbk1fV0ZRVkV3dEdEUT09X0JnQUZ.mp4" type="video/mp4"></video>`

describe('extractSavantMp4Url', () => {
  it('decodes the &#x3D; padding that made real clips 404', () => {
    const url = extractSavantMp4Url(withPadding)
    expect(url).toBe('https://sporty-clips.mlb.com/OHl3NmJfV0ZRVkV3dEdEUT09X0JnRUR==.mp4')
    expect(url).not.toContain('&#x3D;')
  })

  it('leaves an unpadded URL alone — these always worked, hence the random-looking gaps', () => {
    expect(extractSavantMp4Url(withoutPadding)).toBe(
      'https://sporty-clips.mlb.com/RDFBbk1fV0ZRVkV3dEdEUT09X0JnQUZ.mp4',
    )
  })

  it('returns null when the page carries no clip', () => {
    expect(extractSavantMp4Url('<html><body>No video available</body></html>')).toBeNull()
  })

  it('does not run past the closing quote or into a following tag', () => {
    const html = `<source src="https://sporty-clips.mlb.com/abc.mp4"><a href="/other">x</a>`
    expect(extractSavantMp4Url(html)).toBe('https://sporty-clips.mlb.com/abc.mp4')
  })

  it('handles decimal entities and &amp; too', () => {
    expect(decodeHtmlEntities('a&#61;b&amp;c')).toBe('a=b&c')
  })
})
