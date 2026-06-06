import { KantuCV } from '../desktop/kantu-cv'

// 視窗鎖定模式的邊界（螢幕像素坐標）
export type WindowBounds = {
  x: number
  y: number
  width: number
  height: number
}

// 目前鎖定的視窗，null 表示未鎖定（使用全螢幕）
let windowContext: WindowBounds | null = null

export function setWindowContext(bounds: WindowBounds): void {
  windowContext = { ...bounds }
}

export function clearWindowContext(): void {
  windowContext = null
}

export function getWindowContext(): WindowBounds | null {
  return windowContext
}

// 將視窗鎖定範圍套用到 ImageSearchOptions，若未鎖定則原樣返回
export function applyWindowContext(options: KantuCV.ImageSearchOptions): KantuCV.ImageSearchOptions {
  if (!windowContext) return options
  return {
    ...options,
    limitSearchArea: true,
    searchArea: { ...windowContext }
  }
}

// 用 Canvas API 將 DataURL 裁切到視窗邊界範圍
export function cropDataUrl(dataUrl: string, bounds: WindowBounds): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = bounds.width
      canvas.height = bounds.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas 2d context not available'))
      ctx.drawImage(img, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Failed to load image for cropping'))
    img.src = dataUrl
  })
}

// 將 !TARGETWINDOW 格式字串 "x,y,w,h" 解析為 WindowBounds；無效時返回 null
export function parseWindowBounds(value: string): WindowBounds | null {
  if (!value || !value.trim()) return null
  const parts = value.split(',').map(s => parseInt(s.trim(), 10))
  if (parts.length !== 4 || parts.some(isNaN) || parts[2] <= 0 || parts[3] <= 0) return null
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
}

// 將 WindowBounds 序列化為 !TARGETWINDOW 格式
export function boundsToString(bounds: WindowBounds): string {
  return `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
}
