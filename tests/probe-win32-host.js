const { spawn } = require('child_process')
const path = require('path')

const HOST = path.join(__dirname, '../native-host/kantu-win32-host.exe')

function send(proc, msg) {
  const b = Buffer.from(JSON.stringify(msg), 'utf8')
  const h = Buffer.alloc(4); h.writeUInt32LE(b.length, 0)
  proc.stdin.write(h); proc.stdin.write(b)
}

async function query(method, params) {
  return new Promise((resolve, reject) => {
    const proc = spawn(HOST, [], { stdio: ['pipe','pipe','pipe'] })
    let raw = Buffer.alloc(0)

    proc.stdout.on('data', chunk => {
      raw = Buffer.concat([raw, chunk])
      if (raw.length >= 4) {
        const len = raw.readUInt32LE(0)
        if (raw.length >= 4 + len) {
          proc.kill()
          try { resolve(JSON.parse(raw.slice(4, 4+len).toString('utf8'))) }
          catch(e) { reject(e) }
        }
      }
    })
    proc.stderr.on('data', d => process.stderr.write(d.toString()))
    proc.on('error', reject)
    setTimeout(() => { proc.kill(); reject(new Error('timeout')) }, 10000)

    send(proc, { id: 1, method, params })
  })
}

;(async () => {
  console.log('=== Win32 native host test ===')
  const ver = await query('get_version', {})
  console.log('version:', JSON.stringify(ver))

  const ro = await query('get_window_rect', { title: '仙境傳說RO' })
  console.log('仙境傳說RO rect:', JSON.stringify(ro))

  const chrome = await query('get_window_rect', { title: 'Chrome' })
  console.log('Chrome rect:', JSON.stringify(chrome))

  const notfound = await query('get_window_rect', { title: 'NotExist12345' })
  console.log('not found:', JSON.stringify(notfound))

  console.log('\n=== Done ===')
})().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
