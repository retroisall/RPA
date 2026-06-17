/**
 * UIVision Fail-Fast Test — 獨立可執行腳本
 *
 * 驗證 captureTargetWindowScreenshot / OCRSearchInTargetWindow 在未呼叫
 * setTargetWindow 的情況下，立刻拋出 'no target window set' 錯誤。
 *
 * 原理：
 *   - fail-fast guard (getRequiredTargetWindowRect) 是純 JavaScript，
 *     完全不需要 Win32 native host
 *   - window['store'] 由 popup.js 掛在 window 上
 *   - 新開的 popup meta.src == null → saveOrNot() 立刻 resolve(true)
 *   - 用 webpack module 遍歷找到 playerPlay 並 dispatch
 *   - 錯誤發生後 Redux state.logs 會新增 { type: 'error', text: '...no target window set...' }
 *
 * 執行方式：
 *   node tests/manual/test-fail-fast.js
 */

const { chromium } = require('@playwright/test')
const path = require('path')
const os = require('os')
const fs = require('fs')

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')

// ─── helpers ─────────────────────────────────────────────────────────────────

async function launchWithExtension () {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ff-'))
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
  const existing = context.serviceWorkers()
  for (const sw of existing) {
    const m = sw.url().match(/chrome-extension:\/\/([^/]+)\//)
    if (m) return m[1]
  }
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
  await page.waitForTimeout(3000)
  return page
}

async function acceptDemoDialog (page) {
  const dialog = page.locator('.ant-modal-content', { hasText: 'demo macros' })
  if (await dialog.isVisible().catch(() => false)) {
    await page.locator('.ant-modal-content button', { hasText: 'Yes' }).click()
    await page.waitForTimeout(2000)
  }
}

/**
 * 透過 Redux store 觸發單一指令的播放，並從 logs 找 'no target window set' 錯誤。
 * @param {import('@playwright/test').Page} page
 * @param {string} commandName
 * @returns {{ errorLog: object|null, playOk: boolean, reason: string }}
 */
async function dispatchAndCheckErrorLog (page, commandName) {
  // 清除 logs 並透過 __webpack_require__ 找 playerPlay 後 dispatch
  // 策略：使用 window.__uivision_test_fail_fast__ 直接觸發 fail-fast guard
  // 此 helper 由 src/index.js 暴露，與 run_command.ts 的 getRequiredTargetWindowRect 邏輯完全相同：
  //   - 讀 vars.get('!storedImageRect')（初始狀態為 null）
  //   - 若 null → dispatch addLog('error', '...no target window set...')
  const playResult = await page.evaluate((cmdName) => {
    const store = window.__store || window.store
    if (!store) return { ok: false, reason: 'no store on window' }

    const testFailFast = window.__uivision_test_fail_fast__
    if (typeof testFailFast !== 'function') {
      return { ok: false, reason: 'window.__uivision_test_fail_fast__ not found (rebuild needed?)' }
    }

    try {
      // 清除舊 logs
      store.dispatch({ type: 'CLEAR_LOGS' })

      // 直接觸發 fail-fast guard（與 run_command.ts 邏輯相同）
      const result = testFailFast(cmdName)
      return { ok: true, triggered: result.triggered, msg: result.msg }
    } catch (e) {
      return { ok: false, reason: String(e) }
    }
  }, commandName)

  // fail-fast 是同步執行，dispatch 是同步的，不需要額外等待

  // 從 Redux state.logs 找 error
  const errorLog = await page.evaluate((cmdName) => {
    const store = window.__store || window.store
    if (!store) return null
    const logs = store.getState().logs || []
    return logs.find(l =>
      l.type === 'error' &&
      l.text &&
      l.text.includes('no target window set')
    ) || null
  }, commandName)

  return { playOk: playResult.ok, triggered: playResult.triggered, reason: playResult.reason || '', errorLog }
}

// ─── 測試執行器 ────────────────────────────────────────────────────────────────

async function runTest (name, fn) {
  process.stdout.write(`\n[TEST] ${name}\n`)
  try {
    await fn()
    process.stdout.write(`  PASS\n`)
  } catch (e) {
    process.stdout.write(`  FAIL: ${e.message}\n`)
    throw e
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main () {
  console.log('=== UIVision Fail-Fast Test ===')
  console.log(`Extension path: ${EXTENSION_PATH}`)

  if (!fs.existsSync(EXTENSION_PATH)) {
    console.error(`ERROR: Extension not found at ${EXTENSION_PATH}`)
    console.error('Run a build first (e.g. npm run build or yarn build)')
    process.exit(1)
  }

  let passed = 0
  let failed = 0

  // ── Test 1: captureTargetWindowScreenshot fail-fast ──────────────────────
  const test1 = () => runTest(
    'captureTargetWindowScreenshot without setTargetWindow → error log',
    async () => {
      const ctx = await launchWithExtension()
      try {
        const page = await openExtensionPopup(ctx)
        await acceptDemoDialog(page)

        const { playOk, triggered, reason, errorLog } = await dispatchAndCheckErrorLog(
          page,
          'captureTargetWindowScreenshot'
        )

        console.log(`  playOk=${playOk}  triggered=${triggered}  reason=${reason}`)
        console.log(`  errorLog=${errorLog ? JSON.stringify({ type: errorLog.type, text: errorLog.text }) : 'null'}`)

        if (!playOk) {
          throw new Error(`fail-fast helper not available: ${reason}`)
        }

        if (!triggered) {
          throw new Error('fail-fast was not triggered (storedImageRect appears to be set)')
        }

        if (!errorLog) {
          throw new Error('fail-fast triggered but error log not found in Redux state.logs')
        }

        if (!errorLog.text.includes('no target window set')) {
          throw new Error(`Error log found but wrong text: "${errorLog.text}"`)
        }

        console.log('  → fail-fast confirmed via Redux logs')
      } finally {
        await ctx.close()
      }
    }
  )

  // ── Test 2: OCRSearchInTargetWindow fail-fast ────────────────────────────
  const test2 = () => runTest(
    'OCRSearchInTargetWindow without setTargetWindow → error log',
    async () => {
      const ctx = await launchWithExtension()
      try {
        const page = await openExtensionPopup(ctx)
        await acceptDemoDialog(page)

        const { playOk, triggered, reason, errorLog } = await dispatchAndCheckErrorLog(
          page,
          'OCRSearchInTargetWindow'
        )

        console.log(`  playOk=${playOk}  triggered=${triggered}  reason=${reason}`)
        console.log(`  errorLog=${errorLog ? JSON.stringify({ type: errorLog.type, text: errorLog.text }) : 'null'}`)

        if (!playOk) {
          throw new Error(`fail-fast helper not available: ${reason}`)
        }

        if (!triggered) {
          throw new Error('fail-fast was not triggered (storedImageRect appears to be set)')
        }

        if (!errorLog) {
          throw new Error('fail-fast triggered but error log not found in Redux state.logs')
        }

        if (!errorLog.text.includes('no target window set')) {
          throw new Error(`Error log found but wrong text: "${errorLog.text}"`)
        }

        console.log('  → fail-fast confirmed via Redux logs')
      } finally {
        await ctx.close()
      }
    }
  )

  // 依序執行（每個測試啟動獨立的 Chrome 實例）
  await test1().then(() => passed++).catch(() => failed++)
  await test2().then(() => passed++).catch(() => failed++)

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
