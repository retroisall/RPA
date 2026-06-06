import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Button, Spin, message } from 'antd'
import { getNativeCVAPI } from '../services/desktop'
import { getXDesktop } from '../services/xmodules/xdesktop'

/**
 * 拖曳框選視窗範圍的全螢幕 Picker
 * - 點開後自動截取桌面截圖
 * - 使用者在截圖上拖曳畫出矩形
 * - 確認後回傳螢幕像素坐標 { x, y, width, height }
 */
export default function WindowLockPicker({ onConfirm, onCancel, devicePixelRatio = 1 }) {
  const [screenshotUrl, setScreenshotUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imgNaturalSize, setImgNaturalSize] = useState(null)
  const [imgDisplayRect, setImgDisplayRect] = useState(null)

  // 拖曳狀態
  const [dragging, setDragging] = useState(false)
  const [startPt, setStartPt] = useState(null)
  const [currentPt, setCurrentPt] = useState(null)
  const [lockedRect, setLockedRect] = useState(null)

  const containerRef = useRef(null)
  const imgRef = useRef(null)

  // 載入桌面截圖
  useEffect(() => {
    const cvApi = getNativeCVAPI()
    getXDesktop().sanityCheck()
      .then(() => cvApi.captureDesktop({ path: undefined }))
      .then((path) => cvApi.readFileAsDataURL(path, true))
      .then((dataUrl) => {
        setScreenshotUrl(dataUrl)
        setLoading(false)
      })
      .catch((err) => {
        message.error(`桌面截圖失敗：${err.message}`)
        onCancel()
      })
  }, [])

  // 圖片載入後記錄原始尺寸和顯示尺寸
  const onImgLoad = useCallback(() => {
    if (!imgRef.current) return
    const img = imgRef.current
    const rect = img.getBoundingClientRect()
    setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    setImgDisplayRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
  }, [])

  // 將顯示坐標轉換為螢幕像素坐標
  const toScreenCoords = useCallback((displayX, displayY) => {
    if (!imgNaturalSize || !imgDisplayRect) return { x: 0, y: 0 }
    const scaleX = imgNaturalSize.width / imgDisplayRect.width
    const scaleY = imgNaturalSize.height / imgDisplayRect.height
    return {
      x: Math.round((displayX - imgDisplayRect.x) * scaleX),
      y: Math.round((displayY - imgDisplayRect.y) * scaleY)
    }
  }, [imgNaturalSize, imgDisplayRect])

  const getClientPos = (e) => {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    return { x: e.clientX, y: e.clientY }
  }

  const onMouseDown = (e) => {
    e.preventDefault()
    // 每次開始拖曳時重算圖片顯示位置，防止 resize 後座標偏移
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect()
      setImgDisplayRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
    }
    const pos = getClientPos(e)
    setDragging(true)
    setStartPt(pos)
    setCurrentPt(pos)
    setLockedRect(null)
  }

  const onMouseMove = useCallback((e) => {
    if (!dragging) return
    e.preventDefault()
    setCurrentPt(getClientPos(e))
  }, [dragging])

  const onMouseUp = useCallback((e) => {
    if (!dragging) return
    e.preventDefault()
    const endPt = getClientPos(e)
    setDragging(false)
    if (!startPt) return
    const minX = Math.min(startPt.x, endPt.x)
    const minY = Math.min(startPt.y, endPt.y)
    const maxX = Math.max(startPt.x, endPt.x)
    const maxY = Math.max(startPt.y, endPt.y)
    setLockedRect({ x: minX, y: minY, width: maxX - minX, height: maxY - minY })
    setCurrentPt(null)
    setStartPt(null)
  }, [dragging, startPt])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // 計算拖曳矩形（顯示用，CSS px）
  const getDragRect = () => {
    if (!startPt || !currentPt) return null
    return {
      left:   Math.min(startPt.x, currentPt.x),
      top:    Math.min(startPt.y, currentPt.y),
      width:  Math.abs(currentPt.x - startPt.x),
      height: Math.abs(currentPt.y - startPt.y),
    }
  }

  const handleConfirm = () => {
    if (!lockedRect) {
      message.warning('請先框選要鎖定的視窗範圍')
      return
    }
    if (lockedRect.width < 10 || lockedRect.height < 10) {
      message.warning('框選範圍太小，請重新框選')
      return
    }
    const topLeft = toScreenCoords(lockedRect.x, lockedRect.y)
    const botRight = toScreenCoords(lockedRect.x + lockedRect.width, lockedRect.y + lockedRect.height)
    const screenWidth = botRight.x - topLeft.x
    const screenHeight = botRight.y - topLeft.y
    if (screenWidth < 10 || screenHeight < 10) {
      message.warning('框選範圍換算後尺寸過小，請重新框選')
      return
    }
    onConfirm({
      x: topLeft.x,
      y: topLeft.y,
      width: screenWidth,
      height: screenHeight,
    })
  }

  const dragRect = getDragRect()

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {loading ? (
        <Spin size="large" tip="正在截取桌面..." />
      ) : (
        <>
          <div style={{ color: '#fff', marginBottom: 8, fontSize: 13 }}>
            拖曳框選要鎖定的視窗範圍，然後點「確認鎖定」
          </div>

          {/* 截圖容器，支援拖曳 */}
          <div
            style={{ position: 'relative', cursor: 'crosshair', border: '2px solid #aaa' }}
            onMouseDown={onMouseDown}
          >
            <img
              ref={imgRef}
              src={screenshotUrl}
              onLoad={onImgLoad}
              style={{ maxWidth: '90vw', maxHeight: '75vh', display: 'block' }}
              draggable={false}
              alt="desktop"
            />

            {/* 拖曳中的矩形 */}
            {dragRect && (
              <div style={{
                position: 'fixed',
                left: dragRect.left, top: dragRect.top,
                width: dragRect.width, height: dragRect.height,
                border: '2px solid #1890ff',
                background: 'rgba(24,144,255,0.15)',
                pointerEvents: 'none',
              }} />
            )}

            {/* 已確定的矩形 */}
            {lockedRect && (
              <div style={{
                position: 'fixed',
                left: lockedRect.x, top: lockedRect.y,
                width: lockedRect.width, height: lockedRect.height,
                border: '2px solid #52c41a',
                background: 'rgba(82,196,26,0.12)',
                pointerEvents: 'none',
              }} />
            )}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <Button type="primary" onClick={handleConfirm} disabled={!lockedRect}>
              確認鎖定
            </Button>
            <Button onClick={onCancel}>取消</Button>
          </div>
        </>
      )}
    </div>
  )
}
