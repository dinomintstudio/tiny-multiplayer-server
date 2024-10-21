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
    log(request)
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

    ws.on('message', (rawMsg: Buffer) => {
        const msg = rawMsg.toString()
        log(msg)
        const data = parseMessage(msg)
        switch (data?.type) {
            case 'new-ice-candidate':
            case 'data-offer':
            case 'data-answer': {
                if (!('target' in data)) return
                const target = data.target
                const targetClient = clients.get(target)
                if (targetClient) {
                    log(`forwarding ${data.type} to #${target}`)
                    targetClient.ws.send(msg)
                } else {
                    log(`no target #${target}`)
                }
                break
            }
        }
    })

    ws.on('ping', () => ws.pong())

    ws.on('close', () => {
        log(`client disconnected: #${client.id} ${path}`)
        clients.delete(client.id)
        broadcast(JSON.stringify({ type: 'peer-disconnected', peer: { id: client.id } }))
    })

    ws.send(JSON.stringify({ type: 'you', peer: { id: client.id } }))
    ;[...clients.values()]
        .filter(c => c.id !== client.id)
        .forEach(c => ws.send(JSON.stringify({ type: 'peer-connected', peer: { id: c.id } })))
    broadcast(JSON.stringify({ type: 'peer-connected', peer: { id: client.id } }))
})

const parseMessage = (message: string): { type: string; [key: string]: any } | undefined => {
    try {
        const obj = JSON.parse(message)
        if (typeof obj !== 'object' || !('type' in obj)) return
        return obj
    } catch (e) {
        return undefined
    }
}

const broadcast = (msg: any) => {
    log(`broadcasting: ${msg}`)
    return clients.forEach(c => c.ws.send(msg))
}
