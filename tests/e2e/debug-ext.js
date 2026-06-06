// 獨立 debug 腳本：確認 extension 是否載入
const { chromium } = require('@playwright/test')
const path = require('path')
const os = require('os')
const fs = require('fs')

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-debug-'))
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  })

  const page = await ctx.newPage()
  await page.goto('chrome://extensions/')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'tests/e2e/screenshots/debug-extensions-page.png' })

  // 列出 service workers
  const sws = ctx.serviceWorkers()
  console.log('Service workers:', sws.map(sw => sw.url()))

  // 列出 background pages
  const bgs = ctx.backgroundPages()
  console.log('Background pages:', bgs.map(b => b.url()))

  // 嘗試用 evaluate 找 extensions
  const html = await page.evaluate(() => document.body.innerHTML.substring(0, 500))
  console.log('Body HTML preview:', html)

  await ctx.close()
})()
