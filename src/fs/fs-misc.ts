import type { AsyncZippable } from 'fflate'

type TreeEntry = { path: string; data: Uint8Array }
export function buildZipTreeRecursive(entries: TreeEntry[], currentPath: string = ''): AsyncZippable {
    const tree: AsyncZippable = {}

    const baseDirs: Record<string, TreeEntry[]> = {}

    for (const entry of entries) {
        const path = entry.path.substring(currentPath.length)
        const slashIndex = path.indexOf('/')
        if (slashIndex == -1) {
            tree[path] = entry.data
        } else {
            const baseDir = path.substring(0, slashIndex)
            ;(baseDirs[baseDir] ??= []).push(entry)
        }
    }

    for (const dir in baseDirs) {
        tree[dir] = buildZipTreeRecursive(baseDirs[dir], currentPath + '/' + dir)
    }

    return tree
}
