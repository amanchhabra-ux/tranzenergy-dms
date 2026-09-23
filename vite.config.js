import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// ─── Local dev storage ──────────────────────────────────────────────────────
// Only active for `npm run dev`. Stands in for the /api functions so that the
// app can run on your machine without touching the live Vercel Blob store.
// Data lives in ./.local-data (git-ignored).
function localDevStorage() {
  const root = path.resolve('.local-data')
  const filesDir = path.join(root, 'files')
  const stateFile = path.join(root, 'db_state.json')
  fs.mkdirSync(filesDir, { recursive: true })

  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
  const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
  const safeJoin = (rel) => {
    const p = path.resolve(filesDir, rel.replace(/^\/+/, ''))
    if (!p.startsWith(filesDir + path.sep)) throw new Error('bad path')
    return p
  }

  return {
    name: 'local-dev-storage',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        try {
          const etagOf = (text) => '"' + crypto.createHash('sha1').update(text).digest('hex') + '"'
          if (url.pathname === '/api/get-state' && req.method === 'GET') {
            if (!fs.existsSync(stateFile)) return json(res, 200, { notFound: true })
            const text = fs.readFileSync(stateFile, 'utf8')
            res.setHeader('x-state-etag', etagOf(text))
            if (url.searchParams.get('etag') === etagOf(text)) { res.statusCode = 304; return res.end() }
            return json(res, 200, JSON.parse(text))
          }
          if (url.pathname === '/api/save-state' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const wrapped = body && typeof body === 'object' && 'state' in body
            const state = wrapped ? body.state : body
            if (wrapped && body.etag && fs.existsSync(stateFile) && etagOf(fs.readFileSync(stateFile, 'utf8')) !== body.etag) {
              return json(res, 409, { error: 'conflict' })
            }
            const text = JSON.stringify(state)
            fs.writeFileSync(stateFile, text)
            res.setHeader('x-state-etag', etagOf(text))
            return json(res, 200, { success: true, etag: etagOf(text) })
          }
          if (url.pathname === '/api/local-upload' && req.method === 'POST') {
            const rel = url.searchParams.get('path') || `upload-${Date.now()}`
            const dest = safeJoin(rel)
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.writeFileSync(dest, await readBody(req))
            return json(res, 200, { url: '/local-files/' + rel.split('/').map(encodeURIComponent).join('/') })
          }
          if (url.pathname === '/api/delete' && req.method === 'POST') {
            const { url: fileUrl } = JSON.parse((await readBody(req)).toString('utf8') || '{}')
            const m = fileUrl && new URL(fileUrl, 'http://localhost').pathname.match(/^\/local-files\/(.+)$/)
            if (m) fs.rmSync(safeJoin(decodeURIComponent(m[1])), { force: true })
            return json(res, 200, { success: true })
          }
          if (url.pathname.startsWith('/local-files/') && req.method === 'GET') {
            const p = safeJoin(decodeURIComponent(url.pathname.slice('/local-files/'.length)))
            if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('Not found') }
            const ext = path.extname(p).toLowerCase()
            const types = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel' }
            res.setHeader('Content-Type', types[ext] || 'application/octet-stream')
            return fs.createReadStream(p).pipe(res)
          }
          if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not available in local dev' })
        } catch (e) {
          return json(res, 500, { error: e.message })
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localDevStorage()],
})
