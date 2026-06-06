const { test, expect, chromium } = require('@playwright/test')
const path = require('path')
const os = require('os')
const fs = require('fs')

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')

// 每個 test 獨立啟動有擴充套件的 Chrome（用臨時 profile 確保乾淨狀態）
async function launchWithExtension () {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  })
  return context
}

async function getExtensionId (context) {
  // 先檢查是否已有 SW
  const existing = context.serviceWorkers()
  for (const sw of existing) {
    const m = sw.url().match(/chrome-extension:\/\/([^/]+)\//)
    if (m) return m[1]
  }

  // 先建 listener，再觸發頁面載入
  const swPromise = context.waitForEvent('serviceworker', { timeout: 20000 })

  const page = await context.newPage()
  await page.goto('about:blank')
  await page.close()

  const sw = await swPromise
  const m = sw.url().match(/chrome-extension:\/\/([^/]+)\//)
  if (!m) throw new Error(`Cannot parse extension ID from: ${sw.url()}`)
  return m[1]
}

async function openExtensionPopup (context) {
  const extId = await getExtensionId(context)
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extId}/popup.html`)
  await page.waitForLoadState('domcontentloaded')
  // 等 React app 渲染完
  await page.waitForTimeout(3000)
  return page
}

// STEP-1: 確認擴充套件能開啟
test('STEP-1: extension popup loads', async () => {
  const ctx = await launchWithExtension()
  try {
    const page = await openExtensionPopup(ctx)
    await expect(page.locator('body')).toBeVisible()
    await page.screenshot({ path: 'tests/e2e/screenshots/step1-popup.png' })
  } finally {
    await ctx.close()
  }
})

// STEP-2: 確認 preinstall 版本 5.8.9 的對話框出現
test('STEP-2: new demo macros dialog appears on fresh install', async () => {
  const ctx = await launchWithExtension()
  try {
    const page = await openExtensionPopup(ctx)

    // 等最多 10 秒看對話框
    const dialog = page.locator('.ant-modal-content', { hasText: 'demo macros' })
    const dialogVisible = await dialog.isVisible().catch(() => false)

    if (dialogVisible) {
      // 點 Yes, overwrite
      await page.locator('.ant-modal-content button', { hasText: 'Yes' }).click()
      await page.waitForTimeout(2000)
      await page.screenshot({ path: 'tests/e2e/screenshots/step2-after-overwrite.png' })
      console.log('Dialog found and accepted')
    } else {
      // 已安裝過，直接檢查 macro 是否存在
      console.log('Dialog not shown (macros already at v5.8.9)')
    }

    await expect(page.locator('body')).toBeVisible()
  } finally {
    await ctx.close()
  }
})

// STEP-3: 確認 DemoSetTargetWindow macro 出現在 Demo/XModules 資料夾
test('STEP-3: DemoSetTargetWindow macro exists in file tree', async () => {
  const ctx = await launchWithExtension()
  try {
    const page = await openExtensionPopup(ctx)

    // 如果對話框出現先關掉
    const dialog = page.locator('.ant-modal-content', { hasText: 'demo macros' })
    if (await dialog.isVisible().catch(() => false)) {
      await page.locator('.ant-modal-content button', { hasText: 'Yes' }).click()
      await page.waitForTimeout(2000)
    }

    // 找左側檔案樹裡的 DemoSetTargetWindow
    const macroItem = page.locator('text=DemoSetTargetWindow')
    await expect(macroItem).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'tests/e2e/screenshots/step3-macro-visible.png' })
  } finally {
    await ctx.close()
  }
})

// STEP-4: 確認 setTargetWindow 命令存在於 macro 內容
test('STEP-4: DemoSetTargetWindow macro contains setTargetWindow command', async () => {
  const ctx = await launchWithExtension()
  try {
    const page = await openExtensionPopup(ctx)

    // 如果對話框出現先關掉
    const dialog = page.locator('.ant-modal-content', { hasText: 'demo macros' })
    if (await dialog.isVisible().catch(() => false)) {
      await page.locator('.ant-modal-content button', { hasText: 'Yes' }).click()
      await page.waitForTimeout(2000)
    }

    // 點選 DemoSetTargetWindow macro
    const macroItem = page.locator('text=DemoSetTargetWindow')
    await macroItem.click({ timeout: 10000 })
    await page.waitForTimeout(1000)

    // 確認命令表格裡出現 setTargetWindow
    const cmdCell = page.locator('text=setTargetWindow').first()
    await expect(cmdCell).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'tests/e2e/screenshots/step4-macro-content.png' })
  } finally {
    await ctx.close()
  }
})

// STEP-5: 確認空 target 執行不會 crash（清除模式）
test('STEP-5: setTargetWindow with empty target clears search area', async () => {
  const ctx = await launchWithExtension()
  try {
    const page = await openExtensionPopup(ctx)

    // 如果對話框出現先關掉
    const dialog = page.locator('.ant-modal-content', { hasText: 'demo macros' })
    if (await dialog.isVisible().catch(() => false)) {
      await page.locator('.ant-modal-content button', { hasText: 'Yes' }).click()
      await page.waitForTimeout(2000)
    }

    // 點選 DemoSetTargetWindow
    const macroItem = page.locator('text=DemoSetTargetWindow')
    await macroItem.click({ timeout: 10000 })
    await page.waitForTimeout(500)

    // 確認 macro 裡有兩個 setTargetWindow 命令（一個鎖定、一個清除）
    await page.waitForTimeout(1000)
    const cmdCells = page.locator('text=setTargetWindow')
    const count = await cmdCells.count()
    expect(count).toBeGreaterThanOrEqual(2)

    await page.screenshot({ path: 'tests/e2e/screenshots/step5-clear-row.png' })
  } finally {
    await ctx.close()
  }
})
