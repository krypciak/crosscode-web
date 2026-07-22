import { copyFiles } from './upload-processing'
import { getUint8Array } from './utils'
import { fs } from './fs/fs-proxy'
import { updateUploadStatusLabel } from './ui'

export async function updateLiveMods() {
    try {
        updateUploadStatusLabel('fetching live mods...')

        const baseUrl = WEB ? '' : 'https://crosscode.krypek.cc'

        const resp = await fetch(baseUrl + '/liveModUpdate?id=list')
        if (resp.status !== 200) throw new Error(`bad status: ${resp.status}`)
        const list: string[] = await resp.json()
        let pathList = list.map(id => ({ id, path: `/assets/mods/${id}.ccmod` }))

        const exitsArr = await Promise.all(pathList.map(({ path }) => fs.promises.exists(path)))
        pathList = pathList.filter(
            ({ id }, i) => (localStorage[`modEnabled-${id}`] ?? 'true') == 'true' || !exitsArr[i]
        )

        let fetched = -1
        function updateLabel() {
            updateUploadStatusLabel(`fetching live mods`, ++fetched, pathList.length)
        }
        updateLabel()

        const files = await Promise.all(
            pathList.map(async ({ id, path }) => {
                const ret = {
                    path,
                    data: getUint8Array(await fetch(baseUrl + `/liveModUpdate?id=${id}`)),
                }
                updateLabel()
                return ret
            })
        )
        const fileList = files.map(({ path, data }) => ({ path, uint8Array: () => data }))
        await copyFiles(fileList, false)
    } catch (e) {
        console.error('updateLiveMods error:', e)
    } finally {
        updateUploadStatusLabel('')
    }
}
