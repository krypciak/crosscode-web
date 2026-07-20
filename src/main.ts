import { loadServiceWorker } from '../../ccloader3/packages/core/src/service-worker-bridge'
import { getInternalFileList, preloadInit } from './fs/fs-proxy'
import { initLoadScreen } from './ui'
import { checkAutorun, exit } from './autorun'
import type { VersionResp } from './service-worker/offline-cache-proxy'
import { copyFiles } from './upload-processing'
import { initOpfsProxyBridge } from './opfs-proxy-bridge'
import { updateLiveMods } from './live-mods'
import { isAndroid, setFullscreenAndroid } from './android-bridge'
import { nodeNwjsShims } from 'web-nwjs-spoofer/src/node-nwjs-shims'
import { fs } from './fs/fs-proxy'

import './localstoarge-default'

declare global {
    const WEB: boolean
    const LIVEMODS: boolean
    const DEBUG: boolean

    var ccbundler: boolean
}
async function setup() {
    // trigger service worker update check
    fetch('/version').then(async resp => {
        const data: VersionResp = await resp.json()
        if (data.updated && data.previousVersion != undefined) {
            location.reload()
        }
    })

    if (!navigator.serviceWorker) {
        storageInfoLabel.innerHTML =
            'Service Workers not supported! <br> Cannot continue <br> (Make sure you connect with https!)'
        return
    }
    if (!navigator.storage) {
        storageInfoLabel.innerHTML = 'Storage API not supported! <br> Cannot continue'
        return
    }

    nodeNwjsShims({
        fs: fs as unknown as typeof import('fs'),
        enableGreenworks: true,
        enableNw: true,
        exit,
    })
    window.ccbundler = true

    await loadServiceWorker()
    initOpfsProxyBridge()

    if (navigator.serviceWorker.controller) {
        initLoadScreen()

        await preloadInit()

        if (checkAutorun()) return
    }
}
setup()

export async function run() {
    await copyFiles(await getInternalFileList(), false)

    if (LIVEMODS) await updateLiveMods()

    if (isAndroid()) setFullscreenAndroid()

    bundleTitleScreen.style.display = 'none'

    const modloader = await import('../../ccloader3/packages/core/src/modloader')
    await modloader.boot()
}
