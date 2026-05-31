import type { InputLocations } from 'ccmoddb/build/src/types'
import type { RequestListener, IncomingMessage, ServerResponse } from 'http'

let allowedDbs: string[] = []
export function setAllowedDbs(dbs: string[]) {
    allowedDbs = dbs
}

const fetchWithCache = fetch

async function fetchData(url: string): Promise<Uint8Array | undefined> {
    const resp = await fetchWithCache(url)
    if (resp.status != 200) return

    const data = new Uint8Array(await resp.arrayBuffer())

    return data
}

const updateInputLocationsEveryMs = 1000 * 60 * 60 // hour
let lastInputLocationsFetched = 0
const validUrlSet: Set<string> = new Set()
let validUrlStartsWith: string[] = []

async function addAllowedDb(url: string) {
    validUrlSet.add(`${url}/npDatabase.min.json`)
    validUrlStartsWith.push(`${url}/icons/`)

    const inputLocationsUrl = `${url}/input-locations.json`
    try {
        const inputLocations: InputLocations = await (await fetch(inputLocationsUrl)).json()
        for (const { url } of inputLocations) {
            validUrlSet.add(url)
        }
    } catch (e) {
        console.error('error while fetching database:', inputLocationsUrl, 'error:', e)
    }
}

export async function updateValidUrlSet() {
    validUrlSet.clear()
    validUrlStartsWith = []
    await Promise.all(allowedDbs.map(db => addAllowedDb(db)))
    lastInputLocationsFetched = Date.now()
}

async function checkUpdate() {
    if (lastInputLocationsFetched > Date.now() - updateInputLocationsEveryMs) return
    await updateValidUrlSet()
}

function checkUrl(url: string | undefined): url is string {
    if (!url) return false

    return validUrlSet.has(url) || validUrlStartsWith.some(prefix => url.startsWith(prefix))
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
        await checkUpdate()

        if (url.startsWith('/modDownload')) {
            const matches = url.match(/\?url=(.+)/)
            const modUrl = decodeURI(matches?.[1] ?? '')

            if (!checkUrl(modUrl)) {
                res.writeHead(403, {})
                res.end()

                return
            }

            const data = await fetchData(modUrl)
            if (!data) {
                res.writeHead(404, {})
                res.end()

                return
            }
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
