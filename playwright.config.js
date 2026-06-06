const { defineConfig } = require('@playwright/test')
const path = require('path')

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  use: {
    headless: false,
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {},
    },
  ],
})
