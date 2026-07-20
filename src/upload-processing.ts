import { updateUploadStatusLabel } from './ui'
import { fs, getInternalFileList } from './fs/fs-proxy'
import { type Unzipped, unzipSync } from 'fflate/browser'
import { FileEntry, fileEntryFromFile } from './utils'
import { throttleTasks } from 'web-nwjs-spoofer/src/fs-misc'

function getParentDirs(files: FileEntry[]): string[] {
    const paths = window.require('path')
    const dirs = new Set<string>()

    for (const { path } of files) {
        let dirname = paths.dirname(path)
        if (dirname.endsWith('.')) dirname = dirname.slice(0, -1)
        const parent = '/' + dirname
        dirs.add(parent)
    }

    return [...dirs]
}

async function filesToCopy(filesUnfiltered: FileEntry[]) {
    const files = filesUnfiltered.filter(
        ({ path }) =>
            (path.startsWith('assets') ||
                path.startsWith('ccloader3/dist/runtime') ||
                path == 'ccloader3/metadata.json') &&
            !path.startsWith('assets/modules') &&
            !path.includes('.git') &&
            !path.endsWith('.ts') &&
            !path.includes('node_modules') &&
            !path.includes('simplify') &&
            !path.includes('ccloader-version-display')
    )

    const existsArr: boolean[] = await Promise.all(files.map(file => fs.promises.exists(file.path)))
    const toCopyFiles: FileEntry[] = files.filter((_, i) => !existsArr[i])

    toCopyFiles.sort((a, b) => a.path.length - b.path.length)

    return toCopyFiles
}

async function mkdirs(dirs: string[]) {
    dirs.sort((a, b) => a.length - b.length)
    const label = 'creating directories'
    updateUploadStatusLabel(label, 0, dirs.length)

    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i]
        await fs.promises.mkdir(dir, { recursive: true })
        updateUploadStatusLabel(label, i, dirs.length)
    }
    updateUploadStatusLabel(label, dirs.length, dirs.length)
}

export async function copyFiles(toCopyFiles: FileEntry[], fetchRateLimit: boolean) {
    const dirs = getParentDirs(toCopyFiles)
    await mkdirs(dirs)

    updateUploadStatusLabel('copying', 0, toCopyFiles.length)

    let filesCopied = 0
    const atOnce = fetchRateLimit ? undefined : 1000
    await throttleTasks(
        toCopyFiles,
        async file => {
            const buffer = await file.uint8Array()

            await fs.promises.writeFile(file.path, buffer.buffer as FileSystemWriteChunkType)
            updateUploadStatusLabel('copying', ++filesCopied, toCopyFiles.length)
        },
        atOnce
    )

    updateUploadStatusLabel('done, uploaded', toCopyFiles.length)
}

export async function zipToFileEntryList(zipData: Uint8Array, addPrefix = ''): Promise<FileEntry[]> {
    updateUploadStatusLabel('uncompressing zip')
    const unzipped: Unzipped = unzipSync(zipData)
    return Object.entries(unzipped)
        .map(([path, data]) => ({
            path: addPrefix + path,
            async uint8Array() {
                return data
            },
        }))
        .filter(({ path }) => !path.endsWith('/'))
}

export async function uploadCrossCode(filesRaw: FileList) {
    updateUploadStatusLabel('preparing', 0, filesRaw!.length)
    let files = [...filesRaw].map(file => fileEntryFromFile(file))
    let fetchRateLimit = true

    if (files.length == 1 && filesRaw[0].name.endsWith('.zip')) {
        updateUploadStatusLabel('fetching zip')
        const zipData = await files[0].uint8Array()
        files = await zipToFileEntryList(zipData)
        fetchRateLimit = false
    }

    function findCrossCode(files: FileEntry[]): boolean {
        const root = files[0].path.startsWith('assets/')
            ? ''
            : files[0].path.substring(0, files[0].path.indexOf('/') + 1)

        const hasDatabase = files.find(file => {
            return file.path.substring(root.length) == 'assets/data/database.json'
        })
        if (!hasDatabase) return false

        for (const file of files) {
            file.path = file.path.substring(root.length)
        }

        return true
    }

    if (!findCrossCode(files)) {
        updateUploadStatusLabel('crosscode not detected!')
        return
    }

    files.push(...(await getInternalFileList()))

    const toCopyFiles = await filesToCopy(files)
    await copyFiles(toCopyFiles, fetchRateLimit)
}

export async function uploadSave(file: File) {
    const files = [fileEntryFromFile(file, `${window.nw.App.dataPath}/cc.save`)]
    await copyFiles(files, false)
}
