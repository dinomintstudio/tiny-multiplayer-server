import express, { type Request, type Response } from 'express'
import { v4 } from 'uuid'
import WebSocket from 'ws'

export type WsClient = {
    id: string
    ws: WebSocket
    path: string
}

export class WsConnection {
    constructor(
        public path: string,
        public server: WebSocket.Server,
        public clients: Map<string, WsClient>
    ) {}
}

const generateId = (): string => v4().substring(0, 2)

const log = (message: any): void => console.log(`${now()} ${message.toString()}`)

const now = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, -1)

const httpPort = 8081
const wsPort = 3001

const app = express()
const clients: Map<string, WsClient> = new Map<string, WsClient>()

app.get(`/`, (request: Request, response: Response) => {
    response.status(200).json([])
})

app.listen(httpPort)
log(`started HTTP server on port ${httpPort}`)

const server = new WebSocket.Server({ port: wsPort })
log(`started WS server on port ${wsPort}`)

server.on('connection', (ws, request) => {
    const path = request.url!.substring(1)
    if (path.length === 0 || !path.match(/^\d+$/)) {
        const errMsg = `invalid path \`${path}\``
        log(errMsg)
        ws.close(1000, errMsg)
        return
    }

    const client = { id: generateId(), ws, path }
    clients.set(client.id, client)

    log(`client connected #${client.id} on path ${path}`)
    const ids = [...clients.values()].map(c => `#${c.id}`).join(', ')
    log(`active connections on ${path}: ${clients.size} { ${ids} }`)

    ws.on('message', (message: string) => log(message))

    ws.on('close', () => {
        log(`client disconnected: #${client.id} ${path}`)
        clients.delete(client.id)
    })
})

const broadcast = (path: string) => {
    log(`broadcasting: ${path}`)
    return clients.forEach(c => c.ws.send('open'))
}
