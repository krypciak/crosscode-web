import { handleFunction as modProxyHandle, setAllowedDbs, updateValidUrlSet } from './http-module-mod-proxy.ts'
import {
    handleFunction as liveModUpdatesHandle,
    setModConfigs,
    startWatchingMods,
} from './http-module-live-mod-updates.ts'
import { handleFunction as fsHandle } from './http-module-fs.ts'
import { createServer } from 'https'
import fs from 'fs'
import { createChain } from './http-misc.ts'

export async function startHttpServer() {
    setAllowedDbs([
        'https://raw.githubusercontent.com/CCDirectLink/CCModDB/stable',
        'https://raw.githubusercontent.com/CCDirectLink/CCModDB/testing',
        'https://raw.githubusercontent.com/krypciak/CCModDB/multi',
    ])
    await updateValidUrlSet()

    setModConfigs([
        // {
        //     id: 'cc-multibakery',
        //     repoPath: '/home/krypek/Programming/crosscode/instances/cc-server/assets/mods/cc-multibakery',
        //     buildCmd: 'bun',
        //     buildArguments: [
        //         'build.ts',
        //         'build',
        //         // 'minifySyntax=true',
        //         // 'minifyWhitespace=true',
        //         'physics=false',
        //         'browser=true',
        //         'target=es2024',
        //         'extraTreeShaking=true',
        //         'noWrite=true',
        //     ],
        // },
        // {
        //     id: 'cc-instanceinator',
        //     repoPath: '/home/krypek/Programming/crosscode/instances/cc-server/assets/mods/cc-instanceinator',
        //     buildCmd: 'esbuild',
        //     buildArguments: [
        //         '--target=es2018',
        //         '--format=esm',
        //         '--platform=node',
        //         '--bundle',
        //         '--sourcemap=inline',
        //         'src/plugin.ts',
        //     ],
        // },
        {
            id: 'cc-gamepad-overlay',
            repoPath: '/home/krypek/Programming/repos/cc-gamepad-overlay',
            buildCmd: 'esbuild',
            buildArguments: [
                '--target=es2018',
                '--format=esm',
                '--platform=node',
                '--bundle',
                '--loader:.css=text',
                '--sourcemap=inline',
                'src/plugin.ts',
            ],
        },
    ])
    startWatchingMods()

    const [cert, key] = await Promise.all([
        fs.promises.readFile('./cert/localhost+1.pem'),
        fs.promises.readFile('./cert/localhost+1-key.pem'),
    ])

    const httpServer = createServer({ cert, key }, createChain(modProxyHandle, liveModUpdatesHandle, fsHandle))
    const port = 33405
    console.log('http server listening to', port)
    httpServer.listen(port)
}
startHttpServer()
