import { fs } from './fs/fs-proxy'
import { exit } from './autorun'

import path from 'path-browserify'
export { path }

// @ts-expect-error
import util from '@jspm/core/nodelibs/util'

// @ts-expect-error
import assert from '@jspm/core/nodelibs/assert'

// @ts-expect-error
import events from '@jspm/core/nodelibs/events'

const crypto = {}
const stream = {}
const http = {}
const https = {}
const module = {
    createRequire: () => window.require,
}

export const nwGui = {
    App: {
        dataPath: '/nwjsData',
        argv: [],
    } satisfies Partial<nw.App> as unknown as nw.App,
    Window: {
        get(): NWJS_Helpers.win {
            return {
                isFullscreen: false,
                enterFullscreen() {
                    document.body.requestFullscreen()
                },
                leaveFullscreen() {
                    document.exitFullscreen()
                },
                close() {
                    exit()
                },
            } as NWJS_Helpers.win
        },
        async open(url: string, _option: NWJS_Helpers.WindowOpenOption) {
            if (url.startsWith('data:image/png;base64,')) {
                /* workaround because of https://blog.mozilla.org/security/2017/11/27/blocking-top-level-navigations-data-urls-firefox-59/ */
                const blob = await (await fetch(url)).blob()
                const fileURL = URL.createObjectURL(blob)
                window.open(fileURL, '_blank')
            } else {
                window.open(url, '_blank')
            }
        },
    } satisfies Partial<nw.Window> as unknown as nw.Window,
    Clipboard: {
        get() {
            return {
                async set(_content: string, _type: string, _raw: boolean) {},
                get(_type, _raw) {
                    return 'not supported'
                },
            } satisfies Partial<NWJS_Helpers.clip> as unknown as NWJS_Helpers.clip
        },
    } satisfies Partial<nw.Clipboard> as unknown as nw.Clipboard,
    Shell: {
        openExternal(url) {
            window.open(url, '_blank')?.focus()
        },
    } satisfies Partial<nw.Shell> as unknown as nw.Shell,
} as const satisfies Partial<typeof nw>
window.nw = nwGui as typeof nw

const greenworks = {
    init() {},
    activateAchievement() {
        // console.log('activateAchievement', ...args)
    },
    clearAchievement() {
        // console.log('clearAchievement', ...args)
    },
}

export function requireFix() {
    const requireMap: Record<string, any> = {
        fs: fs,
        path: path,
        http: http,
        https: https,
        crypto: crypto,
        stream: stream,
        util: util,
        'nw.gui': nwGui,
        events: events,
        assert: assert,
        module: module,
    }

    // @ts-expect-error
    window.require = (src: string) => {
        const fromMap = requireMap[src]
        if (fromMap) return fromMap

        if (src.includes('greenworks')) return greenworks

        console.groupCollapsed(`requireFix: unknown module: ${src}`)
        console.trace()
        console.groupEnd()
    }
}

declare global {
    var ccbundler: boolean
}
window.ccbundler = true

window.global = window
window.process = {
    on(name: string, _func: () => void) {
        if (name == 'on') {
        } else if (name == 'exit') {
        } else {
            console.warn('Unsupported process.on:', name)
        }
    },
    off(name: string, _func: () => void) {
        if (name == 'on') {
        } else if (name == 'exit') {
        } else {
            console.warn('Unsupported process.on:', name)
        }
    },
    execPath: 'client',
    versions: {
        nw: '100.0.0',
        'node-webkit': '100.0.0',
    },
    env: {},
    cwd() {
        return '/'
    },
    _events: {},
} as any

window.chrome ??= {}
window.chrome.runtime = {
    reload() {
        location.reload()
    },
}
