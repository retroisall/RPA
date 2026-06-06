# TODOS

## 進行中

## 已完成

- [x] `setTargetWindow` 指令 — 用 Win32 native host 鎖定 CV 搜尋範圍到指定視窗
  - 建立 `kantu-win32-host.exe`（C# + Win32 API）
  - 修正 allowed_origins extension ID 錯誤
  - 修正 DPI 座標換算 bug（Win32 DPI-unaware 回傳 logical px = CSS px，不需除 scalingFactor）
  - E2E 測試 5/5 通過

## 已知問題

- 背景模式（視窗被遮擋時仍能辨識點擊）：需要 Windows Graphics Capture API，複雜度高，暫緩

## 暫緩

- **百分比座標錄製模式**
  - 新增一個「%」錄製按鈕
  - 錄製前指定目標視窗
  - 點擊位置改存為視窗百分比座標（例：`10%,20%` 代表視窗寬 10%、高 20% 的位置）
  - 播放時依目前視窗大小換算回絕對座標
  - **待釐清**：目標是桌面視窗（OS 層）還是瀏覽器 viewport？
    - 桌面模式：需要 OS 滑鼠事件攔截，複雜度高
    - 瀏覽器模式：只改 content script onClick handler，複雜度低
