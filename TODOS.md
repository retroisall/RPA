# TODOS

## 進行中

- [ ] 補 `.gitignore` 排除工具產生的暫存目錄：`.gstack/`、`.playwright-mcp/`、
      `test-results/`、`tests/e2e/screenshots/`。這 4 個是執行測試時自動生成的，
      不是資產，現在會一直出現在 `git status` 讓真正的改動被淹沒（2026-08-13 盤點發現）

## 已完成

- [x] `setTargetWindow` 指令 — 用 Win32 native host 鎖定 CV 搜尋範圍到指定視窗
  - 建立 `kantu-win32-host.exe`（C# + Win32 API）
  - 修正 allowed_origins extension ID 錯誤
  - 修正 DPI 座標換算 bug（Win32 DPI-unaware 回傳 logical px = CSS px，不需除 scalingFactor）
  - E2E 測試 5/5 通過
- [x] `captureTargetWindowScreenshot` — 截取鎖定視窗範圍存入 Screenshots 儲存區
  - 新增至 `command.ts`（`CommandScope.DesktopOnly`）
  - 實作於 `run_command.ts`：先截整個桌面再 crop 至 `!storedImageRect`，存入 Screenshots storage
  - 未呼叫 setTargetWindow 時立刻拋出清楚錯誤（`getRequiredTargetWindowRect` helper）
  - 加入 DemoSetTargetWindow preinstall macro 示例
- [x] `OCRSearchInTargetWindow` — 在鎖定視窗範圍做 OCR，繞過全域 `!visualSearchArea`
  - 新增至 `command.ts`（`CommandScope.DesktopOnly`）
  - 完整鏡像 OCRSearch 邏輯，但硬編碼 `searchArea: 'rect'` 並直接傳入 `storedImageRect`
  - 未呼叫 setTargetWindow 時立刻拋出清楚錯誤
  - 加入 DemoSetTargetWindow preinstall macro 示例
  - E2E fail-fast 測試 STEP-9/STEP-10 新增

## 已知問題

- 背景模式（視窗被遮擋時仍能辨識點擊）：需要 Windows Graphics Capture API，複雜度高，暫緩
- **`OCRSearch` Value 欄位未做 editor 層驗證**：Value 空白時 runtime 才報錯，應在儲存或執行前提早攔截
- **OCR 實際功能未被 E2E 測試覆蓋**：現有 STEP-6/7/8/9/10 只驗證結構與不崩潰，沒有驗證 OCR 真正找到文字（需 Win32 native host + 實際畫面）

## 暫緩

- **百分比座標錄製模式**
  - 新增一個「%」錄製按鈕
  - 錄製前指定目標視窗
  - 點擊位置改存為視窗百分比座標（例：`10%,20%` 代表視窗寬 10%、高 20% 的位置）
  - 播放時依目前視窗大小換算回絕對座標
  - **待釐清**：目標是桌面視窗（OS 層）還是瀏覽器 viewport？
    - 桌面模式：需要 OS 滑鼠事件攔截，複雜度高
    - 瀏覽器模式：只改 content script onClick handler，複雜度低
