import type { SocketRequest, SocketResponse } from './types'

import type { ServerOptions } from 'ws'
import WebSocket, { WebSocketServer } from 'ws'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'stream'

type Namespaces = Map<
  string,
  {
    clients: Map<string, WebSocket>
    events: Set<string>
    methods: Map<string, RegisterFn>
  }
>

type RegisterFn<T = any> = (params: T, socketId: string) => Promise<any> | any

type SocketOpts = {
  binary?: boolean
  compress?: boolean
  fin?: boolean
  mask?: boolean
}

type SocketEvents = {
  listening: () => Promise<void> | void
  connection: (socket: WebSocket, clientId: string) => Promise<void> | void
  disconnection: (socketId: string) => Promise<void> | void
  error: (error: Error) => Promise<void> | void
  'socket-error': (clientId: string, error: Error) => Promise<void> | void
  close: () => Promise<void> | void
}

export async function Server(opts: ServerOptions) {
  const version = '2.0'

  const ws = new WebSocketServer(opts)
  const emitter = new EventEmitter()

  const namespaces: Namespaces = new Map()

  await setup()

  function createJSONResponse(data: Partial<SocketResponse>) {
    return JSON.stringify({
      jsonrpc: version,
      id: data?.id,
      result: data?.result,
      params: data?.params,
      error: data?.error,
    })
  }

  async function setup() {
    await new Promise((resolve, reject) =>
      ws.on('listening', () => {
        emitter.emit('listening')
        resolve(null)
      })
    )

    ws.on('connection', (socket) => {
      const clientId = randomUUID()
      // TODO - Add client to namespace
      // clients.set(clientId, socket)

      emitter.emit('connection', socket, clientId)

      // TODO - Send namespace
      handleRPC(socket, clientId)

      socket.on('error', (error) => emitter.emit('socket-error', clientId, error))

      socket.on('close', () => {
        // TODO - Remove client from namespace
        // clients.delete(clientId)
        emitter.emit('disconnection', clientId)
      })
    })

    ws.on('error', (error) => emitter.emit('error', error))
  }

  function handleRPC(socket: WebSocket.WebSocket, socketId: string, ns = '/') {
    socket.on('message', async (data: any) => {
      const socketOpts: SocketOpts = {}

      try {
        if (data instanceof ArrayBuffer) {
          socketOpts.binary = true
          data = Buffer.from(data).toString()
        }

        const payload = JSON.parse(data) as SocketRequest

        const namespace = namespaces.get(ns)!

        if (payload.method === 'rpc.on') {
          // TODO - Subscribe to event
        }

        if (payload.method === 'rpc.off') {
          // TODO - Unsubscribe to event
        }

        if (!namespace.methods.has(payload.method)) {
          return socket.send(
            createJSONResponse({
              id: payload.id,
              error: {
                message: 'Invalid method name',
              }
            })
          )
        }

        const fn = namespace.methods.get(payload.method)!
        const response = await fn(payload.params, socketId)

        return socket.send(
          createJSONResponse({
            id: payload.id,
            result: response || undefined,
          })
        )
      } catch (error) {
        return socket.send(
          JSON.stringify({
            jsonrpc: version,
            error: 'Unexpected error',
            id: null,
          }),
          socketOpts
        )
      }
    })
  }

  function generateNamespace(ns = '/') {
    namespaces.set(ns, {
      clients: new Map(),
      events: new Set(),
      methods: new Map(),
    })
  }

  function register<T = any>(method: string, fn: RegisterFn<T>, ns = '/') {
    if (!namespaces.get(ns)) generateNamespace(ns)

    const targetNs = namespaces.get('/')!
    targetNs.methods.set(method, fn)

    namespaces.set(ns, targetNs)
  }

  function on<EventKey extends keyof SocketEvents>(
    event: EventKey,
    cb: SocketEvents[EventKey]
  ) {
    emitter.on(event, cb)
  }

  // TODO - register event
  function event() {
    
  }

  function close() {
    return new Promise((resolve, reject) => {
      try {
        ws.close()
        emitter.emit('close')
        resolve(null)
      } catch(err) {
        reject(err)
      }
    })
  }

  return {
    on,
    register,
    close
  }
}
