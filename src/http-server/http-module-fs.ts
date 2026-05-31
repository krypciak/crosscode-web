import type { Http2ServerRequest, Http2ServerResponse } from 'http2'

let fs: typeof import('fs')
;(async () => (fs = 'require' in global ? (0, eval)("require('fs')") : await import('fs')))()

let path: typeof import('path')
;(async () => (path = 'require' in global ? (0, eval)("require('path')") : await import('path')))()

let root = './dist'

export function setHttpRoot(newRoot: string) {
    root = newRoot
}

function getDistDir(): string {
    return path?.resolve(root) ?? root
}

const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.zip': 'application/zip',
    '.ccmod': 'application/zip',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
}

const cache = new Map<string, { data: Buffer; contentType: string }>()

function getContentType(filePath: string): string {
    const ext = path?.extname(filePath) ?? ''
    return mimeTypes[ext] ?? 'application/octet-stream'
}

function setCorsHeaders(res: Http2ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
}

type FileResult = { data: Buffer; contentType: string } | null

async function readFileIfFresh(filePath: string): Promise<FileResult> {
    try {
        const stat = await fs.promises.stat(filePath)
        if (!stat.isFile()) return null
        const data = await fs.promises.readFile(filePath)
        return { data, contentType: getContentType(filePath) }
    } catch {
        return null
    }
}

export const handleFunction = async (req: Http2ServerRequest, res: Http2ServerResponse) => {
    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
    }

    let reqPath = req.url ?? ''
    const questionIdx = reqPath.indexOf('?')
    if (questionIdx !== -1) reqPath = reqPath.substring(0, questionIdx)

    const decodedPath = decodeURIComponent(reqPath)

    const distDir = getDistDir()
    let filePath = path?.resolve(distDir, '.' + decodedPath) ?? distDir + decodedPath

    if (!filePath.startsWith(distDir)) {
        res.writeHead(403)
        res.end()
        return
    }

    const cached = cache.get(filePath)
    if (cached) {
        res.writeHead(200, { 'Content-Type': cached.contentType })
        res.write(cached.data)
        res.end()
        return
    }

    let result = await readFileIfFresh(filePath)

    if (!result) {
        const indexPath = path?.join(filePath, 'index.html') ?? filePath + '/index.html'
        result = await readFileIfFresh(indexPath)
        if (result) filePath = indexPath
    }

    if (!result) {
        res.writeHead(404)
        res.end()
        return
    }

    cache.set(filePath, result)
    res.writeHead(200, { 'Content-Type': result.contentType })
    res.write(result.data)
    res.end()
}
