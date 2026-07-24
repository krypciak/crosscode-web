import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
    appId: 'cc.krypek.crosscodeweb',
    appName: 'CrossCode',
    webDir: 'dist',
    loggingBehavior: 'none',
    server: {
        cleartext: true,
    },
    android: {
        allowMixedContent: true,
    },
}

export default config
