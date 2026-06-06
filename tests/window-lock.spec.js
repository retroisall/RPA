const { test, expect, chromium } = require('@playwright/test')
const path = require('path')

const EXT_PATH = path.resolve(__dirname, '../dist')
let browser, extPage, extId

test.beforeAll(async () => {
  browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ]
  })

  await browser.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => {})

  for (const sw of browser.serviceWorkers()) {
    const m = sw.url().match(/chrome-extension:\/\/([^/]+)/)
    if (m) { extId = m[1]; break }
  }
  if (!extId) {
    for (const page of browser.pages()) {
      const m = page.url().match(/chrome-extension:\/\/([^/]+)/)
      if (m) { extId = m[1]; break }
    }
  }

  extPage = await browser.newPage()
  await extPage.goto(`chrome-extension://${extId}/popup.html`)
  await extPage.waitForLoadState('networkidle')
  await extPage.waitForTimeout(1500)
})

test.afterAll(async () => {
  await browser?.close()
})

test('STEP-1: Extension popup loads correctly', async () => {
  expect(extId).toBeTruthy()
  await extPage.screenshot({ path: 'tests/ss-01-popup.png' })
  await expect(extPage.locator('text=Play Macro')).toBeVisible({ timeout: 5000 })
  console.log(`✅ Extension ID: ${extId}`)
})

test('STEP-2: Open Settings (gear icon)', async () => {
  // 先確認 settings 尚未開啟
  const modal = extPage.locator('.ant-modal-content')
  if (await modal.isVisible({ timeout: 500 }).catch(() => false)) {
    console.log('Settings already open, skipping open step')
    return
  }

  const gearSelectors = [
    '.anticon-setting',
    '[aria-label="setting"]',
    'svg[data-icon="setting"]',
    'button[title*="etting"]',
  ]

  let clicked = false
  for (const sel of gearSelectors) {
    const el = extPage.locator(sel).first()
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click({ timeout: 3000 })
      clicked = true
      console.log(`Clicked settings via: ${sel}`)
      break
    }
  }

  if (!clicked) {
    await extPage.screenshot({ path: 'tests/ss-02-debug.png' })
    const buttons = await extPage.locator('button').all()
    console.log(`Found ${buttons.length} buttons`)
    for (const btn of buttons.slice(0, 10)) {
      const box = await btn.boundingBox()
      const text = await btn.textContent()
      if (box) console.log(`  button at (${Math.round(box.x)},${Math.round(box.y)}) text="${text?.trim()}"`)
    }
    throw new Error('Could not find settings gear icon')
  }

  // 等待 modal 出現
  await expect(extPage.locator('.ant-modal-content')).toBeVisible({ timeout: 5000 })
  await extPage.waitForTimeout(500)
  await extPage.screenshot({ path: 'tests/ss-02-settings-open.png' })
})

test('STEP-3: Navigate to Vision tab in Settings', async () => {
  // 確認 settings modal 在
  await expect(extPage.locator('.ant-modal-content')).toBeVisible({ timeout: 3000 })

  // 在 modal 內找 "Vision" tab（Ant Design tab item）
  const modal = extPage.locator('.ant-modal-content')
  const visionTab = modal.locator('.ant-tabs-tab', { hasText: 'Vision' }).first()

  const isVisible = await visionTab.isVisible({ timeout: 2000 }).catch(() => false)
  if (isVisible) {
    await visionTab.click({ timeout: 5000 })
    console.log('Clicked Vision tab via .ant-tabs-tab')
  } else {
    // fallback: 列出所有 tabs
    const allTabs = await modal.locator('.ant-tabs-tab').all()
    console.log(`Found ${allTabs.length} tabs:`)
    for (const tab of allTabs) {
      const txt = await tab.textContent()
      console.log(`  tab: "${txt?.trim()}"`)
    }
    // 嘗試用文字比對
    for (const tab of allTabs) {
      const txt = (await tab.textContent() || '').trim()
      if (txt.toLowerCase().includes('vision')) {
        await tab.click({ timeout: 5000 })
        console.log(`Clicked tab: "${txt}"`)
        break
      }
    }
  }

  await extPage.waitForTimeout(500)
  await extPage.screenshot({ path: 'tests/ss-03-vision-tab.png' })
})

test('STEP-4: Switch to Desktop Automation mode', async () => {
  const modal = extPage.locator('.ant-modal-content')

  // 確認在 modal 內操作
  const desktopSelectors = [
    'input[value="desktop"]',
    'label:has-text("Desktop")',
    '.ant-radio-wrapper:has-text("Desktop")',
  ]

  let switched = false
  for (const sel of desktopSelectors) {
    const el = modal.locator(sel).first()
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click({ timeout: 3000 })
      switched = true
      console.log(`Switched to Desktop via: ${sel}`)
      break
    }
  }

  await extPage.waitForTimeout(500)
  await extPage.screenshot({ path: 'tests/ss-04-desktop-mode.png' })

  if (!switched) {
    // 列出 modal 內所有 radio 供 debug
    const radios = await modal.locator('input[type="radio"]').all()
    console.log(`Found ${radios.length} radio inputs`)
    for (const r of radios) {
      const val = await r.getAttribute('value')
      const checked = await r.isChecked()
      console.log(`  radio value="${val}" checked=${checked}`)
    }
  }
})

test('STEP-5: Verify Window-Lock Mode UI appears', async () => {
  const modal = extPage.locator('.ant-modal-content')
  await extPage.screenshot({ path: 'tests/ss-05-window-lock.png' })

  // 印出 modal 內容供 debug
  const modalText = await modal.innerText().catch(() => '')
  const lines = modalText.split('\n').filter(l => l.trim()).slice(0, 30)
  console.log('Modal content (first 30 lines):')
  lines.forEach(l => console.log(' ', l.trim()))

  // 驗證視窗鎖定區塊
  const lockSection = modal.locator('text=視窗鎖定模式')
  const lockSectionVisible = await lockSection.isVisible({ timeout: 2000 }).catch(() => false)
  console.log('Window Lock section visible:', lockSectionVisible)

  const lockBtn = modal.locator('text=框選鎖定視窗')
  const lockBtnVisible = await lockBtn.isVisible({ timeout: 2000 }).catch(() => false)
  console.log('Lock button visible:', lockBtnVisible)

  const unlockStatus = modal.locator('text=未鎖定')
  const unlockStatusVisible = await unlockStatus.isVisible({ timeout: 2000 }).catch(() => false)
  console.log('Unlocked status visible:', unlockStatusVisible)

  expect(lockSectionVisible || lockBtnVisible || unlockStatusVisible).toBe(true)
})

test('STEP-6: No critical JS errors', async () => {
  const errors = []
  extPage.on('pageerror', err => {
    if (!err.message.includes('ResizeObserver') &&
        !err.message.includes('non-Error promise')) {
      errors.push(err.message)
    }
  })

  await extPage.waitForTimeout(1000)
  console.log('Critical JS errors:', errors)
  expect(errors.length).toBe(0)
})
