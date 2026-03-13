import { Scene, SceneElement } from './sceneTypes'

const PAD = 40
const GAP = 20

export function suggestLayout(scene: Scene): Scene {
  const { width: canvasW, height: canvasH } = scene
  const elements = [...scene.elements]
  if (elements.length === 0) return scene

  // Categorize elements
  const titles: SceneElement[] = []
  const playerImages: SceneElement[] = []
  const dataObjects: SceneElement[] = []
  const shapes: SceneElement[] = []

  for (const el of elements) {
    if (el.type === 'text') titles.push(el)
    else if (el.type === 'player-image') playerImages.push(el)
    else if (el.type === 'shape' || el.type === 'image') shapes.push(el)
    else dataObjects.push(el)
  }

  // Sort data objects by area descending (larger first)
  dataObjects.sort((a, b) => (b.width * b.height) - (a.width * a.height))

  const result: SceneElement[] = []
  let cursorY = PAD
  let nextZ = 1

  // 1. Shapes → background, lowest z-index
  for (const el of shapes) {
    result.push({ ...el, zIndex: nextZ++ })
  }

  // 2. Title text → top center, full width
  for (const el of titles) {
    result.push({
      ...el,
      x: PAD,
      y: cursorY,
      width: canvasW - PAD * 2,
      zIndex: nextZ++,
    })
    cursorY += el.height + GAP
  }

  // 3. Player image → top-left area below title
  const dataStartX = PAD
  let imageEndX = PAD

  for (const el of playerImages) {
    result.push({
      ...el,
      x: PAD,
      y: cursorY,
      zIndex: nextZ++,
    })
    imageEndX = PAD + el.width + GAP
  }

  // 4. Data objects → row-based flow, to the right of player image (or full width if no image)
  const flowStartX = playerImages.length > 0 ? imageEndX : PAD
  const flowEndX = canvasW - PAD
  const flowWidth = flowEndX - flowStartX
  let rowX = flowStartX
  let rowY = playerImages.length > 0 ? cursorY : cursorY
  let rowMaxH = 0

  for (const el of dataObjects) {
    // Does it fit in the current row?
    if (rowX + el.width > flowEndX && rowX > flowStartX) {
      // Wrap to next row
      rowX = flowStartX
      rowY += rowMaxH + GAP
      rowMaxH = 0
    }

    // If below the player image, expand to full width
    const effectiveStartX = (rowY >= cursorY + (playerImages[0]?.height || 0) + GAP) ? PAD : flowStartX
    if (rowX < effectiveStartX) rowX = effectiveStartX
    const effectiveEndX = (rowY >= cursorY + (playerImages[0]?.height || 0) + GAP) ? canvasW - PAD : flowEndX

    if (rowX + el.width > effectiveEndX && rowX > effectiveStartX) {
      rowX = effectiveStartX
      rowY += rowMaxH + GAP
      rowMaxH = 0
    }

    result.push({
      ...el,
      x: Math.round(rowX),
      y: Math.round(rowY),
      zIndex: nextZ++,
    })

    rowX += el.width + GAP
    rowMaxH = Math.max(rowMaxH, el.height)
  }

  return { ...scene, elements: result }
}
