import type { PluginClass } from 'ultimate-crosscode-typedefs/modloader/mod'
import type { Mod1 } from './types'
import ccmod from '../ccmod.json'
import { Autorun, getAutorun, setAutorun } from '../../autorun'
import { registerOpts } from './options'
import { initVibrationBridge } from './vibration'
import { audioWarningFix } from './audio-warning-fix'

export default class CrossCodeWebRuntimeMod implements PluginClass {
    static dir: string
    static mod: Mod1
    static manifset: typeof import('../ccmod.json') = ccmod

    constructor(mod: Mod1) {
        CrossCodeWebRuntimeMod.dir = mod.baseDirectory
        CrossCodeWebRuntimeMod.mod = mod
        CrossCodeWebRuntimeMod.mod.isCCL3 = mod.findAllAssets ? true : false
        CrossCodeWebRuntimeMod.mod.isCCModPacked = mod.baseDirectory.endsWith('.ccmod/')
    }

    prestart() {
        registerOpts()
        this.ccSaveFix()
        if (WEB) audioWarningFix()
        initVibrationBridge()
    }

    ccSaveFix() {
        ig.StorageData.inject({
            _loadStorageFromData(data) {
                // @ts-expect-error
                if (data && typeof data === 'object' && data instanceof ArrayBuffer)
                    data = new TextDecoder().decode(data)
                return this.parent(data)
            },
        })
    }

    autorunBackup: Autorun = 'off'
    preload() {
        this.autorunBackup = getAutorun()
        setAutorun('off')
    }
    poststart() {
        setTimeout(() => {
            setAutorun(this.autorunBackup)
        }, 300)
    }
}
