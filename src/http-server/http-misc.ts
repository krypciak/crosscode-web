import type { Http2ServerRequest, Http2ServerResponse } from 'http2'

export function createChain(...handlers: ((req: Http2ServerRequest, res: Http2ServerResponse) => void)[]) {
    return (req: Http2ServerRequest, res: Http2ServerResponse) => {
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
