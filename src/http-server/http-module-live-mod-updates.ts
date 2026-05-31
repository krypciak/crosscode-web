import type { IncomingMessage, RequestListener, ServerResponse } from 'http'
import type { AsyncZippable } from 'fflate/browser'
import type { Dirent } from 'fs'
import { buildZipTreeRecursive } from '../fs/fs-misc.ts'

let fs: typeof import('fs')
let child_process: typeof import('child_process')
;(async () => (fs = 'require' in global ? (0, eval)("require('fs')") : await import('fs')))()
;(async () =>
    (child_process = 'require' in global ? (0, eval)("require('child_process')") : await import('child_process')))()

let zip: (typeof import('fflate'))['zip']

interface LiveModConfig {
    id: string
    repoPath: string
    buildCmd: string
    buildArguments: string[]
}

function concatBuffersIntoUint8Array(arrays: Buffer[]): Uint8Array {
    const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0)
    const result = new Uint8Array(totalLength)

    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }

    return result
}

async function buildPluginJs(mod: LiveModConfig): Promise<Uint8Array> {
    const { spawn } = child_process
    const process = spawn(mod.buildCmd, mod.buildArguments, { cwd: mod.repoPath })

    const buffers: Buffer[] = []
    process.stdout.on('data', data => buffers.push(data))

    process.stderr.on('data', data => {
        console.error(`buildMod ${mod.id} stderr: ${data}`)
    })

    await new Promise<void>((resolve, reject) => {
        process.on('close', code => {
            if (code === 0) {
                resolve()
            } else {
                reject()
                console.log(`child process exited with code ${code}`)
            }
        })
    })

    return concatBuffersIntoUint8Array(buffers)
}
async function fsExists(path: string) {
    return await fs.promises.access(path).then(
        () => true,
        () => false
    )
}

async function buildMod(mod: LiveModConfig): Promise<Uint8Array> {
    type AssetEntry = { path: string; data: Uint8Array }

    const iconPath = `${mod.repoPath}/icon/icon.png`
    const [pluginJs, iconData, licenseData, ccmodData, assetsFiles] = await Promise.all([
        buildPluginJs(mod),
        (await fsExists(iconPath)) ? fs.promises.readFile(iconPath) : undefined,
        fs.promises.readFile(`${mod.repoPath}/LICENSE`),
        fs.promises.readFile(`${mod.repoPath}/ccmod.json`),
        new Promise<AssetEntry[]>(async resolve => {
            const assets: Dirent[] = (
                await fs.promises
                    .readdir(`${mod.repoPath}/assets`, { recursive: true, withFileTypes: true })
                    .catch(_e => {
                        resolve([])
                        return [] as Dirent[]
                    })
            ).filter(dirent => dirent.isFile())

            const files = await Promise.all(
                assets.map(async dirent => {
                    const path = `${dirent.parentPath}/${dirent.name}`

                    const assetPath = `${path.substring(path.lastIndexOf('assets/') + 'assets/'.length)}`
                    const buffer = await fs.promises.readFile(path)
                    return { path: assetPath, data: new Uint8Array(buffer.buffer) }
                })
            )
            resolve(files)
        }),
    ])

    const assetsTree = buildZipTreeRecursive(assetsFiles)

    const zipTree: AsyncZippable = {
        'plugin.js': pluginJs,
        icon: iconData ? { 'icon.png': new Uint8Array(iconData.buffer) } : {},
        LICENSE: new Uint8Array(licenseData.buffer),
        'ccmod.json': new Uint8Array(ccmodData.buffer),
        assets: assetsTree,
    }

    zip ??= (await import('fflate/node')).zip

    return new Promise<Uint8Array>((resolve, reject) => {
        zip(zipTree, {}, (err, data) => {
            if (err) reject(err)
            else resolve(data)
        })
    })
}

const buildCache: Map<LiveModConfig, Uint8Array> = new Map()

async function watchMod(mod: LiveModConfig) {
    const pluginJsPath = `${mod.repoPath}/plugin.js`
    const watcher = fs.promises.watch(pluginJsPath, {
        persistent: false,
    })
    for await (const event of watcher) {
        if (event.eventType == 'change') {
            buildCache.delete(mod)
        }
    }
}

async function requestMod(mod: LiveModConfig): Promise<Uint8Array> {
    if (buildCache.has(mod)) return buildCache.get(mod)!

    const data = await buildMod(mod)
    buildCache.set(mod, data)

    return data
}

let mods: Record<string, LiveModConfig> = {}

export function setModConfigs(entries: LiveModConfig[]) {
    mods = Object.fromEntries(entries.map(entry => [entry.id, entry]))
}

export function startWatchingMods() {
    for (const mod of Object.values(mods)) {
        watchMod(mod)
    }
}

async function sha256(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return result
}

export const handleFunction: RequestListener = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? ''

    try {
        if (url.startsWith('/liveModUpdate')) {
            const matches = url.match(/\?id=(.+)/)
            const modId = decodeURI(matches?.[1] ?? '')

            if (modId == 'list') {
                const json = JSON.stringify(Object.keys(mods))
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                })
                res.write(json)
                res.end()

                return
            }

            const mod = mods[modId]
            if (!mod) {
                res.writeHead(404, {})
                res.end()

                return
            }

            const data = await requestMod(mod)
            const etag = await sha256(data)

            res.writeHead(200, {
                'Content-Type': 'application/zip',
                Etag: etag,
            })
            res.write(data)
            res.end()
        } else {
            res.emit('next')
        }
    } catch (e) {
        console.error(e)
        res.emit('next')
    }
}
