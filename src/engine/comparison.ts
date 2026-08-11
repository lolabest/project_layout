/**
 * Visual comparison utilities for reference design vs rendered screenshot.
 * Operates on ImageData / canvas — no network or CORS bypass.
 */

export interface ComparisonResult {
  similarity: number
  differenceDataUrl: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for comparison.'))
    img.src = src
  })
}

function drawScaled(
  img: HTMLImageElement,
  width: number,
  height: number,
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

/** Compare two images and produce a difference heatmap + similarity %. */
export async function compareImages(
  referenceDataUrl: string,
  renderedDataUrl: string,
  maxDimension = 800,
): Promise<ComparisonResult> {
  const [refImg, renderedImg] = await Promise.all([
    loadImage(referenceDataUrl),
    loadImage(renderedDataUrl),
  ])

  const scale = Math.min(
    1,
    maxDimension / Math.max(refImg.width, refImg.height, renderedImg.width, renderedImg.height),
  )
  const width = Math.max(1, Math.round(Math.max(refImg.width, renderedImg.width) * scale))
  const height = Math.max(1, Math.round(Math.max(refImg.height, renderedImg.height) * scale))

  const refData = drawScaled(refImg, width, height)
  const renderedData = drawScaled(renderedImg, width, height)

  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = width
  diffCanvas.height = height
  const diffCtx = diffCanvas.getContext('2d')
  if (!diffCtx) {
    throw new Error('Canvas 2D context unavailable.')
  }
  const diffImage = diffCtx.createImageData(width, height)

  let totalDiff = 0
  const pixelCount = width * height

  for (let i = 0; i < refData.data.length; i += 4) {
    const dr = Math.abs(refData.data[i] - renderedData.data[i])
    const dg = Math.abs(refData.data[i + 1] - renderedData.data[i + 1])
    const db = Math.abs(refData.data[i + 2] - renderedData.data[i + 2])
    const channelDiff = (dr + dg + db) / 3
    totalDiff += channelDiff

    const intensity = Math.min(255, Math.round(channelDiff * 2.2))
    diffImage.data[i] = intensity
    diffImage.data[i + 1] = Math.round(intensity * 0.25)
    diffImage.data[i + 2] = Math.round(intensity * 0.25)
    diffImage.data[i + 3] = 255
  }

  diffCtx.putImageData(diffImage, 0, 0)

  const avgDiff = totalDiff / pixelCount
  const similarity = Math.max(0, Math.min(100, 100 - (avgDiff / 255) * 100))

  return {
    similarity: Math.round(similarity * 10) / 10,
    differenceDataUrl: diffCanvas.toDataURL('image/png'),
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}
