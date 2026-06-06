<!-- /autoplan restore point: /c/Users/郭峻瑋/.gstack/projects/A9T9-RPA/master-autoplan-restore-20260606-120742.md -->
# PLAN: 桌面視窗鎖定模式（Window-Lock Mode）

## 背景與問題

UI.Vision 的桌面自動化模式目前以全螢幕為單位操作：
- `captureDesktopScreenshot` 截整個螢幕
- `visualSearch` / `OCRSearch` 在全螢幕上搜尋
- `XClick` / `XType` 使用全螢幕絕對座標

這帶來三個實際問題：
1. **干擾**：其他視窗的內容會影響視覺辨識（誤觸、誤識別）
2. **精準度**：OCR / 圖像比對在大圖上速度慢、雜訊多
3. **腳本可攜性**：腳本寫死了全螢幕座標，換螢幕解析度就壞掉

## 目標

新增「視窗鎖定模式（Window-Lock Mode）」：使用者透過工具列的「鎖定視窗」按鈕，在全螢幕截圖上拖選目標視窗區域，此後所有桌面操作（截圖、視覺搜尋、OCR）都限制在該矩形範圍內。**無需修改 XModules Native Host。**

## 使用者操作流程

```
1. 點擊工具列「🔒 鎖定視窗」按鈕
   → Extension 取得全螢幕截圖，以半透明遮罩顯示
   → 使用者在目標視窗上拖選矩形
   → 矩形座標存入 !TARGETWINDOW，顯示 "🔒 已鎖定 (x,y,w,h)"

2. captureDesktopScreenshot     → 只截鎖定矩形內的畫面（Canvas 裁切）
3. OCRSearch | target=someText  → 只在鎖定矩形內辨識
4. XClick | target=search.png   → 視覺比對限制在矩形內，座標仍為全螢幕絕對值
5. 點擊「🔓 解除鎖定」         → 清除 !TARGETWINDOW，恢復全螢幕
```

## 功能規格

### 工具列 UI（新增）

| 元素 | 說明 |
|------|------|
| `🔒 鎖定視窗` 按鈕 | 點擊後進入「框選模式」 |
| 框選遮罩覆蓋層 | 以 `captureDesktop` 截圖為背景，使用者拖拉選取矩形 |
| 鎖定狀態指示 | 鎖定後顯示 `🔒 (x, y, w×h)` |
| `🔓 解除` 按鈕 | 清除鎖定矩形 |

### 系統變數：`!TARGETWINDOW`（保持不變）

| 值 | 說明 |
|----|------|
| `""`（空）| 未鎖定，全螢幕模式（預設） |
| `"100,200,800,600"` | 已鎖定，格式 x,y,w,h（不含視窗標題，因為不需要） |

### 指令行介面（可選，供進階用戶）

保留 `setTargetWindow` 指令，但 target 改為座標格式，供腳本內直接設定：
```
setTargetWindow | target=100,200,800,600    → 直接設定矩形（腳本化用）
setTargetWindow | target=                  → 解除鎖定
```

這樣既支援 UI 框選（一般用戶），也支援腳本化（進階用戶）。

### 新增系統變數：`!TARGETWINDOW`

| 值 | 說明 |
|----|------|
| `""`（空）| 未鎖定，全螢幕模式（預設） |
| `"Notepad,100,200,800,600"` | 已鎖定，儲存視窗標題與矩形 |

### 受影響的現有指令

| 指令 | 目前行為 | 鎖定後行為 |
|------|----------|-----------|
| `captureDesktopScreenshot` | 截整個螢幕 | 只截目標視窗矩形 |
| `visualSearch` / `visualAssert` | 全螢幕比對 | 限制在視窗矩形內搜尋 |
| `OCRSearch` / `OCRExtract` | 全螢幕 OCR | 只 OCR 視窗矩形區域 |
| `visionLimitSearchArea` | 手動設定區域 | 可進一步縮小（視窗內的子區域） |
| `XClick` | 全螢幕絕對座標 | 視覺搜尋結果已在視窗內，座標正確 |
| `XType` | 不受影響 | 不受影響 |

### 座標系統

鎖定模式下座標仍為**全螢幕絕對座標**發送給 Native Host，但搜尋/辨識都在視窗矩形內進行，因此自動得到正確結果。使用者看到的座標變數（`!IMAGEX`, `!IMAGEY`）也是全螢幕絕對座標（不做轉換），保持與現有腳本相容。

### 視窗追蹤

每次執行視覺/OCR 指令前，重新查詢視窗目前的矩形（視窗可能被移動或縮放）。

## 技術實作計畫（更新後：無需修改 XModules）

### Phase 1：window_context 服務

**新增檔案**：`src/services/window/window_context.ts`（移植自 Robot 專案，去掉 Electron 依賴）

```typescript
export type WindowBounds = { x: number; y: number; w: number; h: number }

let _current: WindowBounds | null = null

export function setWindowContext(bounds: WindowBounds): void { _current = bounds }
export function clearWindowContext(): void { _current = null }
export function getWindowContext(): WindowBounds | null { return _current }

/** 將現有 ImageSearchOptions 注入視窗搜尋區域（統一注入點） */
export function applyWindowContext(options: ImageSearchOptions): ImageSearchOptions {
  if (!_current) return options
  return {
    ...options,
    limitSearchArea: true,
    searchArea: { x: _current.x, y: _current.y, width: _current.w, height: _current.h }
  }
}

/** captureDesktop 截完全螢幕後，用 Canvas API 裁切到視窗區域 */
export function cropDataUrl(dataUrl: string, x: number, y: number, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
```

### Phase 2：系統變數與指令實作

**修改檔案**：`src/common/command.ts`, `src/modules/run_command.ts`, `src/common/variables.js`

1. `command.ts`：加入 `setTargetWindow`（DesktopOnly scope）
2. `run_command.ts`：`setTargetWindow` case — 解析 `target` 為座標字串 `x,y,w,h` 或清空
3. `variables.js`：加入 `!TARGETWINDOW` 系統變數（格式 `x,y,w,h`）

### Phase 3：視覺/OCR 區域限制整合

**修改檔案**：`src/modules/run_command.ts`

在呼叫 `searchDesktop` 前統一呼叫 `applyWindowContext(options)`，而非分散 patch 13+ 個位置：

```typescript
// 在 run_command.ts 中找到共用的 buildDesktopSearchOptions() 或類似的集中點，加入：
import { applyWindowContext } from '../services/window/window_context'

const options = applyWindowContext(buildImageSearchOptions(...))
```

`captureDesktopScreenshot` 修改：

```typescript
case 'captureDesktopScreenshot': {
  const ctx = getWindowContext()
  return cvApi.captureDesktop({ path: undefined })
    .then(p => cvApi.readFileAsDataURL(p, true))
    .then(dataUrl => ctx ? cropDataUrl(dataUrl, ctx.x, ctx.y, ctx.w, ctx.h) : dataUrl)
    .then(croppedUrl => saveToScreenshotStorage(croppedUrl, filePath))
}
```

### Phase 4：UI 框選介面

**修改檔案**：需探索確定（`src/components/` 或 `src/containers/` 中的工具列區域）

1. 工具列加入「🔒 鎖定視窗」按鈕
2. 點擊後觸發框選流程：
   - 呼叫 `captureDesktop()` 取得全螢幕截圖
   - 以半透明全螢幕遮罩顯示截圖（CSS overlay）
   - 使用者拖拉選取矩形 → 記錄 `{x, y, w, h}`
   - 呼叫 `setWindowContext(bounds)` 存入 context
   - 更新 `!TARGETWINDOW` 系統變數
3. 工具列顯示鎖定狀態：`🔒 (x,y,w×h)` + `× 解除` 按鈕

## 不在本計畫範圍內

- 跨螢幕（多顯示器）DPI 精確對齊——v1 記錄為 Known Issue
- 視窗移動後的自動更新——使用者需重新框選（或未來加 re-lock 按鈕）
- 在 Web（非桌面）模式下的視窗鎖定——不適用
- `setTargetWindow` 的標題自動比對——v1 只支援座標輸入，v2 再加標題搜尋

## 已知問題與風險

1. **視窗移動**：鎖定矩形是靜態快照，使用者移動視窗後需重新框選
2. **DPI 縮放**：高 DPI 螢幕上，`captureDesktop` 回傳的圖像解析度（device pixels）與使用者看到的螢幕座標（CSS pixels）之間有縮放因子，Canvas 裁切時需用 `getScalingFactor()` 計算
3. **框選 UI 全螢幕遮罩**：Chrome Extension MV3 的 Popup/SidePanel 視窗大小限制，全螢幕遮罩需要透過 `content_script` 注入或獨立的 overlay 頁面實作

## 成功標準

1. `setTargetWindow | target=Notepad` 成功鎖定記事本
2. `captureDesktopScreenshot` 只截記事本視窗（不含其他視窗）
3. `OCRSearch` 只在記事本內辨識文字，不受螢幕其他內容干擾
4. `visualSearch` 只比對記事本視窗內的畫面
5. 解除鎖定後恢復全螢幕行為
6. 視窗移動後操作仍正確（自動追蹤新位置）

---

## /autoplan 審查報告

### CEO 雙聲音共識表

```
CEO DUAL VOICES — CONSENSUS TABLE [subagent-only]:
═══════════════════════════════════════════════════════════════
  維度                                Claude 子代理  Consensus
  ───────────────────────────────── ────────────── ──────────
  1. 前提有效？                       HIGH RISK      ⚠ 需確認
  2. 正確問題？                       是，但有更簡方案 DISAGREE
  3. 範圍校準正確？                   可能過度設計    DISAGREE
  4. 替代方案充分探索？                否（遺漏半自動） CONCERN
  5. 競爭/技術風險已涵蓋？            MV3方向風險     CONCERN
  6. 6個月軌跡是否合理？              待確認XModules  DISAGREE
═══════════════════════════════════════════════════════════════
```

### Eng 雙聲音共識表

```
ENG DUAL VOICES — CONSENSUS TABLE [subagent-only]:
═══════════════════════════════════════════════════════════════
  維度                                Claude 子代理  Consensus
  ───────────────────────────────── ────────────── ──────────
  1. 架構合理？                       需統一注入點   CONCERN
  2. 測試覆蓋充分？                   有缺口         CONCERN
  3. 性能風險已涵蓋？                 IPC開銷需快取   CONCERN
  4. 安全威脅已涵蓋？                 視窗標題洩漏   LOW
  5. 錯誤路徑已處理？                 最小化靜默失敗  CRITICAL
  6. 部署風險可控？                   中等           MEDIUM
═══════════════════════════════════════════════════════════════
```

### 架構修正（Auto-decided）

**修正 1**：新增 `applyWindowContext(options: ImageSearchOptions): ImageSearchOptions` pure function 作為統一注入點，取代在 run_command.ts 13+ 個分散位置個別 patch。

**修正 2**：Canvas API 裁切截圖（不用 jimp），與 Robot 專案的 `cropDataUrl()` 相同模式。DataURL 已可從 `captureDesktop` + `readFileAsDataURL()` 取得。

**修正 3**：`get_window_rect` 回應加入 `isMinimized: boolean`，若最小化拋出明確錯誤「目標視窗已最小化，無法操作」。

**修正 4**：視窗矩形採「Session 快取 + Dirty Flag」策略 — 只在 `setTargetWindow` 重新執行時重查，其他步驟使用快取，可選每 N 步重新驗證。

### 技術架構（更新後）

```
setTargetWindow 執行
  ├── XModules: list_windows() → [WindowInfo]
  ├── 標題比對（contains + exact 選項）
  ├── get_window_rect(title) → { x, y, w, h, isMinimized }
  └── 存入 window_context.ts 的 WindowBounds

每次視覺/OCR 指令執行前（統一注入點）
  └── applyWindowContext(options) → 注入 limitSearchArea + searchArea Rect

captureDesktopScreenshot（視窗鎖定時）
  ├── captureDesktop() → file path
  ├── readFileAsDataURL() → full screen DataURL
  ├── cropDataUrl(dataUrl, x, y, w, h) → window DataURL（Canvas API）
  └── 存檔/存入截圖儲存庫
```

### 不在範圍（deferred）

- 多顯示器 DPI 混用的精確處理（Known Issue）
- `list_windows` 白名單過濾（隱私考量，v2 加入）
- 視窗最大化/還原後的自動重查

### 決策審查追蹤

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | CEO | 選擇 Approach C（混合方案） | Mechanical | P3+P5 | 比 A 風險小（不改captureDesktop），比 B 體驗好 | Approach A（風險高），Approach B（體驗差） |
| 2 | CEO | Canvas API 裁切（非jimp） | Mechanical | P4+P5 | Canvas 在 extension context 已可用，jimp 是多餘依賴 | jimp |
| 3 | Eng | applyWindowContext() 統一注入 | Mechanical | P4+P5 | 13+ 分散 patch 是技術債，統一包裝點更可維護 | 分散 patch |
| 4 | Eng | Session 快取 + Dirty Flag | Mechanical | P3+P5 | 每步 IPC 20-50ms，1000 步 macro 增加 20-50 秒 | 每步重查 |
| 5 | Eng | isMinimized 檢查 + 明確錯誤訊息 | Mechanical | P1 | 靜默失敗是 critical defect，-32000 magic number 必須被攔截 | 忽略 |
| 6 | CEO | Robot 專案 window_context 設計模式移植 | Mechanical | P4 | 相同架構問題，已有驗證過的設計，不重造 | 重新設計 |
| 7 | Gate | 用戶挑戰：改走半自動框選 | User Challenge | User Decision | 用戶明確選擇；無需改 XModules，工程量縮小 90% | setTargetWindow + list_windows 方案 |
| 8 | Gate | 截圖裁切：Canvas API（非jimp） | Mechanical | P4+P5 | Canvas 在 extension 已可用，jimp 另有他用 | jimp |

## GSTACK REVIEW REPORT

| Review | 觸發 | 理由 | 執行次數 | 狀態 | 發現 |
|--------|------|------|---------|------|------|
| CEO Review | `/autoplan` | 策略與範圍 | 1 | issues_open | 2 個未解決（已透過用戶挑戰決策） |
| Codex Review | 不可用 | — | 0 | — | — |
| Eng Review | `/autoplan` | 架構與測試 | 1 | issues_open | 7 個發現（3 critical，已納入計畫） |
| Design Review | `/autoplan` | UI/UX 缺口（UI 範圍已偵測）| 1 | 輕量審查 | 框選 UI + 狀態指示 |
| DX Review | 跳過 | 非開發者工具產品 | 0 | — | — |

**VERDICT**: APPROVED WITH MODIFICATIONS — 主要架構轉向已完成（無 XModules → 半自動框選）。可進入實作。
