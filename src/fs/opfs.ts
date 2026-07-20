import type { Dirent, MakeDirectoryOptions, ObjectEncodingOptions, RmOptions, StatOptions, Stats } from 'fs'

import { dirname, basename } from 'path-browserify'
import { OpfsDirent, OpfsStats, constants, throttleTasks } from './fs-misc'
import { getUint8Array, throwErrorWithCode } from '../utils'

let fsRoot: FileSystemDirectoryHandle

export async function init(updateStorageInfoLabel: (mountedCount?: number) => unknown) {
    fsRoot = await navigator.storage.getDirectory()
    await buildQuickPathLookupMap(updateStorageInfoLabel)

    await navigator.storage.persist?.()
}

const pathToFileHandle: Map<string, FileSystemFileHandle> = new Map()
const pathToDirHandle: Map<string, FileSystemDirectoryHandle> = new Map()

const mustLoadFiles: Set<string> = new Set([
    'ccloader3/metadata.json',
    'ccloader-user-config.js',
    'assets/extension/readme.txt',
    'assets/extension/fish-gear/fish-gear.json',
    'assets/extension/flying-hedgehag/flying-hedgehag.json',
    'assets/extension/manlea/manlea.json',
    'assets/extension/ninja-skin/ninja-skin.json',
    'assets/extension/post-game/post-game.json',
    'assets/extension/scorpion-robo/scorpion-robo.json',
    'assets/extension/snowman-tank/snowman-tank.json',
])

async function buildQuickPathLookupMap(updateStorageInfoLabel: (mountedCount?: number) => unknown) {
    pathToFileHandle.clear()
    pathToDirHandle.clear()

    pathToDirHandle.set('', fsRoot)
    await forEach(
        fsRoot,
        (file, path) => {
            pathToFileHandle.set(path, file)
        },
        (dir, path) => {
            pathToDirHandle.set(path, dir)
            updateStorageInfoLabel(pathToFileHandle.size + pathToDirHandle.size)
        },
        path => mustLoadFiles.has(path)
    )
}

function cleanPath(path: string): string {
    if (path.startsWith('.')) path = path.substring(1)
    if (path.startsWith('/')) path = path.substring(1)
    if (path.endsWith('/')) path = path.slice(0, -1)
    path = path.replaceAll(/\.\//g, '')
    return path
}

function getFileHandleSync(path: string): FileSystemFileHandle {
    let handle = pathToFileHandle.get(path)
    if (!handle) {
        const msg = `opfs: getFileHandleSync when file not preloaded!: ${path}`
        console.warn(msg)
        throw new Error(msg)
    }
    return handle
}

async function getFileHandle(path: string): Promise<FileSystemFileHandle | undefined> {
    let handle = pathToFileHandle.get(path)
    if (handle) return handle

    const parent = getParentDirHandle(path)
    const fileName = basename(path)
    try {
        handle = await parent.getFileHandle(fileName)
        pathToFileHandle.set(path, handle)
    } catch (e) {}

    return handle
}

function getDirHandle(path: string): FileSystemDirectoryHandle | undefined {
    return pathToDirHandle.get(path)
}

async function forEach(
    dir: FileSystemDirectoryHandle,
    fileFunc: (file: FileSystemFileHandle, path: string) => void,
    dirFunc: (dir: FileSystemDirectoryHandle, path: string) => void,
    fileFilter?: (path: string) => boolean,
    path = ''
) {
    const promises: Promise<void>[] = []
    for await (const [name, handle] of dir.entries()) {
        const newPath = path + name
        if (handle.kind == 'file') {
            if (!fileFilter || fileFilter(newPath)) {
                const handle = await dir.getFileHandle(name)
                fileFunc(handle, newPath)
            }
        } else if (handle.kind == 'directory') {
            const handle = await dir.getDirectoryHandle(name)
            dirFunc(handle, newPath)

            promises.push(forEach(handle, fileFunc, dirFunc, fileFilter, newPath + '/'))
        }
    }
    await Promise.all(promises)
}

function getParentDirHandle(path: string) {
    const parent = cleanPath(dirname(path))

    const parentHandle = getDirHandle(parent)
    if (!parentHandle) throwErrorWithCode(`opfs: directory parent doesn't exist: ${path}`, 'ENOENT')

    return parentHandle
}

async function touch(path: string): Promise<FileSystemFileHandle> {
    let handle = await getFileHandle(path)
    if (handle) return handle

    const dir = getParentDirHandle(path)

    const fileName = basename(path)
    handle = await dir.getFileHandle(fileName, { create: true })
    pathToFileHandle.set(path, handle)

    return handle
}

async function removeFileOrDirectory(
    path: string,
    handle: FileSystemDirectoryHandle | FileSystemFileHandle
): Promise<void> {
    if (!handle) throw new Error()
    if (path == '/') throw new Error('opfs: cannot delete /')

    if (handle.kind == 'file') {
        pathToFileHandle.delete(path)
    } else {
        pathToDirHandle.delete(path)
        for (const map of [pathToFileHandle, pathToDirHandle]) {
            for (const filePath of map
                .keys()
                .filter(filePath => filePath.startsWith(path) && filePath[path.length] == '/')) {
                map.delete(filePath)
            }
        }
    }

    const parentHandle = getParentDirHandle(path)
    const name = basename(path)
    await parentHandle.removeEntry(name, { recursive: true })
}

async function clearStorage() {
    for await (const file of fsRoot.values()) {
        await fsRoot.removeEntry(file.name, { recursive: true })
    }
}

async function usage(): Promise<StorageEstimate> {
    return navigator.storage.estimate()
}

async function readFile(path: string, options?: { encoding: 'utf-8' | 'utf8' }): Promise<string>
async function readFile(path: string, encoding: 'utf-8' | 'utf8'): Promise<string>
async function readFile(path: string, encoding: 'uint8array'): Promise<ArrayBuffer>
async function readFile(path: string, encoding?: string): Promise<ArrayBuffer>
async function readFile(
    path: string,
    options?: string | { encoding?: string }
): Promise<string | ArrayBuffer | Uint8Array> {
    path = cleanPath(path)
    const handle = await getFileHandle(path)
    if (!handle) {
        throwErrorWithCode(`opfs: file not found: ${path}`, 'ENOENT')
    }

    const file = await handle.getFile()

    const encoding = !options ? undefined : ((typeof options == 'string' ? options : options?.encoding) ?? 'binary')

    if (encoding == 'utf-8' || encoding == 'utf8') {
        return file.text()
    } else if (encoding == 'uint8array') {
        return getUint8Array(file)
    } else {
        return file.arrayBuffer()
    }
}

async function writeFile(
    path: string,
    data: FileSystemWriteChunkType,
    options?: ObjectEncodingOptions | BufferEncoding | null
): Promise<void> {
    path = cleanPath(path)
    const handle = await touch(path)
    const writeable = await handle.createWritable()

    const encoding =
        typeof data == 'string' && !options
            ? 'utf8'
            : ((typeof options == 'string' ? options : options?.encoding) ?? 'binary')

    if (encoding != 'utf8' && encoding != 'utf-8' && encoding != 'binary') {
        console.error('options:', options)
        throw new Error(`opfs: writeFile encoding not implemented: ${encoding}`)
    }
    await writeable.write(data)
    await writeable.close()
}

function readdir(
    path: string,
    options?:
        | (ObjectEncodingOptions & {
              withFileTypes?: false | undefined
              recursive?: boolean | undefined
          })
        | BufferEncoding
        | null
): Promise<string[]>
function readdir(
    path: string,
    options: ObjectEncodingOptions & {
        withFileTypes: true
        recursive?: boolean | undefined
    }
): Promise<Dirent[]>
async function readdir(
    path: string,
    options?:
        | (ObjectEncodingOptions & {
              withFileTypes?: boolean
              recursive?: boolean
          })
        | BufferEncoding
        | null
): Promise<string[] | Dirent[]> {
    path = cleanPath(path)
    const handle = getDirHandle(path)
    if (!handle) throwErrorWithCode(`opfs: directory not found: ${path}`, 'ENOENT')

    const recursive = typeof options == 'object' && options?.recursive
    const withFileTypes = typeof options == 'object' && options?.withFileTypes

    function entriesToDirents(entries: [string, FileSystemHandle][]): OpfsDirent[] {
        return entries.map(([path, file]) => {
            return new OpfsDirent(file.kind == 'file', basename(path), dirname(path))
        })
    }

    if (recursive) {
        if (withFileTypes) {
            const files: [string, FileSystemHandle][] = []
            await forEach(
                handle,
                (file, path) => files.push([path, file]),
                (dir, path) => files.push([path, dir])
            )
            return entriesToDirents(files)
        } else {
            const result: string[] = []
            await forEach(
                handle,
                (_file, path) => result.push(path),
                (_dir, path) => result.push(path)
            )
            return result
        }
    } else {
        if (withFileTypes) {
            return entriesToDirents(await Array.fromAsync(handle.entries()))
        } else {
            return Array.fromAsync(handle.keys())
        }
    }
}

function existsSync(path: string): boolean {
    path = cleanPath(path)
    return !!(getDirHandle(path) || getFileHandleSync(path))
}

async function exists(path: string): Promise<boolean> {
    path = cleanPath(path)
    try {
        return !!((await getFileHandle(path)) || getDirHandle(path))
    } catch (e) {
        return false
    }
}

async function touchDir(path: string): Promise<FileSystemDirectoryHandle> {
    const parentHandle = getParentDirHandle(path)
    const dirName = basename(path)
    const handle = await parentHandle.getDirectoryHandle(dirName, { create: true })
    pathToDirHandle.set(path, handle)
    return handle
}

function mkdir(
    path: string,
    options: {
        recursive: true
    }
): Promise<string | undefined>
function mkdir(
    path: string,
    options?: {
        recursive?: false
    } | null
): Promise<void>
async function mkdir(path: string, options?: MakeDirectoryOptions | null): Promise<string | void> {
    path = cleanPath(path)
    const recursive = typeof options == 'object' && options?.recursive

    if (recursive) {
        const sp = path.split('/')
        let firstCreated: string | undefined
        let currPath = ''
        for (let i = 0; i < sp.length; i++) {
            const newPath = i == 0 ? sp[i] : currPath + '/' + sp[i]
            if (!getDirHandle(newPath)) {
                firstCreated ??= newPath
                await touchDir(newPath)
            }
            currPath = newPath
        }

        return firstCreated
    } else {
        if (getDirHandle(path)) throwErrorWithCode(`opfs: directory already exists: ${path}`, 'EEXIST')

        await touchDir(path)
    }
}

async function access(path: string, _mode?: number): Promise<void> {
    if (!(await exists(path))) throwErrorWithCode(`opfs: access error (file doesn't exist): ${path}`, 'ENOENT')
    return
}

function statSync(path: string, opts?: StatOptions): Stats {
    path = cleanPath(path)
    const handle = getDirHandle(path) || getFileHandleSync(path)
    if (!handle) throwErrorWithCode(`opfs: stat file or directory not found: ${path}`, 'ENOENT')

    if (opts?.bigint) throw new Error('opfs: stat bigint option not implemented')

    return new OpfsStats(handle.kind == 'file')
}

async function stat(path: string, opts?: StatOptions): Promise<Stats> {
    path = cleanPath(path)
    const handle = (await getFileHandle(path)) || getDirHandle(path)
    if (!handle) throwErrorWithCode(`opfs: stat file or directory not found: ${path}`, 'ENOENT')

    if (opts?.bigint) throw new Error('opfs: stat bigint option not implemented')

    return new OpfsStats(handle.kind == 'file')
}

async function rm(path: string, options?: RmOptions): Promise<void> {
    path = cleanPath(path)

    if (options?.maxRetries) throw new Error(`opfs: rm options.maxRetries not supported`)
    if (options?.retryDelay) throw new Error(`opfs: rm options.retryDelay not supported`)

    const recursive = options?.recursive
    const force = options?.force

    const handle = (await getFileHandle(path)) || getDirHandle(path)
    if (!handle) {
        if (force) return
        throwErrorWithCode(`opfs: file not found: ${path}`, 'ENOENT')
    }

    if (handle.kind == 'directory' && !recursive) {
        if ((await Array.fromAsync(handle.keys())).length > 0) {
            throwErrorWithCode(`opfs: cannot remove non empty directory without recursive: ${path}`, 'ENOTEMPTY')
        }
    }
    await removeFileOrDirectory(path, handle)
}

async function unlink(path: string): Promise<void> {
    const dirHandle = getDirHandle(path)
    if (dirHandle) throwErrorWithCode(`opfs: cannot unlink a directory: ${path}`, 'EISDIR')
    return rm(path)
}

async function rmdir(path: string): Promise<void> {
    path = cleanPath(path)

    const fileHandle = await getFileHandle(path)
    if (fileHandle) throwErrorWithCode(`opfs: cannot rmdir a file: ${path}`, 'ENOTDIR')

    await rm(path, { recursive: true })
}

async function cp(srcPath: string, destPath: string, options?: { recursive?: boolean }) {
    srcPath = cleanPath(srcPath)
    destPath = cleanPath(destPath)

    const recursive = typeof options == 'object' && options?.recursive

    const srcHandle = (await getFileHandle(srcPath)) || getDirHandle(srcPath)
    if (!srcHandle) throwErrorWithCode(`opfs: file not found: ${srcPath}`, 'ENOENT')
    if (srcHandle.kind == 'file') {
        const data = await readFile(srcPath)
        await writeFile(destPath, data)
    } else {
        if (!recursive)
            throwErrorWithCode(`opfs: cannot cp a directory: ${srcPath} without the recursive flag`, 'ENOTEMPTY')

        const dirents = await readdir(srcPath, { recursive: true, withFileTypes: true })
        const dirs = [...new Set(dirents.map(d => d.parentPath).filter(path => path != '.'))].toSorted(
            (a, b) => a.length - b.length
        )

        await mkdir(destPath)
        for (const dirPath of dirs) {
            await mkdir(destPath + '/' + dirPath)
        }

        const files = dirents.filter(d => d.isFile()).map(d => d.parentPath + '/' + d.name)
        await throttleTasks(files, filePath => cp(srcPath + '/' + filePath, destPath + '/' + filePath))
    }
}

async function rename(srcPath: string, destPath: string): Promise<void> {
    await cp(srcPath, destPath, { recursive: true })
    await rm(srcPath, { recursive: true })
}

function wrapAsync<D, CB = (err: Error | null, data: D | null) => void>(
    func: (path: string, options?: any) => Promise<D>
) {
    return async (path: string, optionsOrCb: unknown | CB, cb?: (err: Error | null, data: D | null) => void) => {
        const callback = (typeof optionsOrCb == 'function' ? optionsOrCb : cb) as (a: unknown, b: unknown) => void
        const options = typeof optionsOrCb == 'function' ? undefined : (optionsOrCb as any)
        func(path, options)
            .then(data => callback(null, data))
            .catch(err => callback(err, null))
    }
}

export const fs = {
    constants,
    promises: {
        readFile,
        writeFile,
        readdir,
        exists,
        mkdir,
        access,
        stat,
        lstat: stat,
        rename,
        rm,
        unlink,
        rmdir,
        cp,
    },
    readFile: wrapAsync(readFile),
    writeFile: wrapAsync(writeFile),
    readdir: wrapAsync(readdir),

    exists: wrapAsync(exists),
    existsSync,

    // mkdir
    // access

    stat: wrapAsync(stat),
    statSync,

    lstat: wrapAsync(stat),
    lstatSync: statSync,

    rename: wrapAsync(rename),

    rm: wrapAsync(rm),

    unlink: wrapAsync(unlink),

    rmdir: wrapAsync(rmdir),
    cp: wrapAsync(cp),

    fileCount() {
        return pathToFileHandle.size
    },
    dirCount() {
        return pathToDirHandle.size
    },
    clearStorage,
    usage,
}
