import type { IncomingMessage, ServerResponse } from 'http'

export function createChain(...handlers: ((req: IncomingMessage, res: ServerResponse) => void)[]) {
    return (req: IncomingMessage, res: ServerResponse) => {
        let index = 0
        const next = () => {
            const handler = handlers[index]
            if (handler) {
                index++
                handler(req, res)
            } else {
                res.writeHead(404)
                res.end()
            }
        }
        res.on('next', next)
        next()
    }
}
