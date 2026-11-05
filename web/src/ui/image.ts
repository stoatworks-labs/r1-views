// Turning an uploaded floorplan into the PNGs a .dbpr holds.  R1 stores a
// picture as PNG (its QImage is written that way), so a JPEG is converted.
// A plan is usually black lines on white, which glares in R1's dark theme, so
// it can be inverted; the night copy is the same picture dimmed further.

export interface PlanLook {
  invert: boolean
  /** 0..1, how bright the day picture is. */
  brightness: number
  /** 0..1, the night picture's brightness relative to the day one. */
  night: number
}

export const defaultLook: PlanLook = { invert: true, brightness: 0.7, night: 0.45 }

export async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Fit an image of w x h inside a box, keeping its shape, centred. */
export function fit(w: number, h: number, bw: number, bh: number) {
  const s = Math.min(bw / w, bh / h)
  const fw = Math.max(1, Math.round(w * s)), fh = Math.max(1, Math.round(h * s))
  return { w: fw, h: fh, x: Math.round((bw - fw) / 2), y: Math.round((bh - fh) / 2) }
}

async function png(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('PNG encode failed'))), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

/** Day and night PNGs of the image at w x h R1 pixels. */
export async function renderPlan(img: HTMLImageElement, w: number, h: number, look: PlanLook) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)           // a transparent PNG gets a white page under it
  ctx.drawImage(img, 0, 0, w, h)
  const base = ctx.getImageData(0, 0, w, h)
  const shade = (k: number) => {
    const d = new ImageData(new Uint8ClampedArray(base.data), w, h)
    const px = d.data
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = look.invert ? 255 - px[i + c] : px[i + c]
        px[i + c] = v * k
      }
    }
    return d
  }
  ctx.putImageData(shade(look.brightness), 0, 0)
  const day = await png(canvas)
  ctx.putImageData(shade(look.brightness * look.night), 0, 0)
  const night = await png(canvas)
  return { day, night }
}
