import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import { EventEmitter } from 'stream'

import type { SocketRequest, SocketResponse } from './types'

import type { ServerOptions } from 'ws'
import WebSocket, { WebSocketServer } from 'ws'
import { randomUUID } from 'crypto'

type SocketNamespace = {
  clients: Map<string, WebSocket>
  events: Map<string, Set<string>>
  methods: Map<string, RegisterFn>
}

type SocketNamespaces = Map<string, SocketNamespace>

type RegisterFn<T = any> = (params: T, socketId: string) => Promise<any> | any

type SocketOpts = {
  binary?: boolean
  compress?: boolean
  fin?: boolean
  mask?: boolean
}

type SocketEvents = {
  listening: () => Promise<void> | void
  connection: (socket: WebSocket, socketId: string) => Promise<void> | void
  disconnection: (socketId: string) => Promise<void> | void
  error: (error: Error) => Promise<void> | void
  'socket-error': (socketId: string, error: Error) => Promise<void> | void
  close: () => Promise<void> | void
}

export function Server(opts: ServerOptions) {
  let listening = false
  const version = '2.0'

  const ws = new WebSocketServer(opts)
  const emitter = new EventEmitter()

  const namespaces: SocketNamespaces = new Map()
  const internalMethods = new Map<
    string,
    (
      targetNs: SocketNamespace,
      request: SocketRequest,
      socketId: string
    ) => string
  >([
    ['rpc.on', subscribe],
    ['rpc.off', unsubscribe],
  ])

  function createJSONResponse(data: Partial<SocketResponse>) {
    return JSON.stringify({
      jsonrpc: version,
      id: data?.id,
      notification: data?.notification,
      result: data?.result,
      params: data?.params,
      error: data?.error,
    })
  }

  function setup() {
    generateNamespace()

    ws.on('listening', () => {
      listening = true
      emitter.emit('listening')

      ws.on('connection', (socket, req) => {
        const ns = req.url || '/'
        const validNs = /^\/\w*$/g.test(ns)
  
        if (!validNs) {
          // TODO - handle socket terminate
          // new Error(`Invalid namespace ${req.url} for web socket connection`)
          return socket.close()
        }
  
        if (!namespaces.has(ns)) {
          // TODO - handle socket terminate
          // new Error(`Namespace ${req.url} does not exists`)
          return socket.close()
        }
  
        const socketId = randomUUID()
        const targetNs = namespaces.get(ns)!
        targetNs.clients.set(socketId, socket)
  
        emitter.emit('connection', socket, socketId)
  
        handleRPC(socket, socketId, ns)
  
        socket.on('error', (error) =>
          emitter.emit('socket-error', socketId, error)
        )
  
        socket.on('close', () => {
          targetNs.clients.delete(socketId)
          emitter.emit('disconnection', socketId)
        })
      })
  
      ws.on('error', (error) => emitter.emit('error', error))
    })
  }

  function validateRequest(payload: Partial<SocketRequest>) {
    return (
      !!payload.params &&
      Array.isArray(payload.params) &&
      payload.params.length > 0
    )
  }

  function handleRPC(socket: WebSocket.WebSocket, socketId: string, ns = '/') {
    socket.on('message', async (data: any) => {
      const socketOpts: SocketOpts = {}

      try {
        if (data instanceof ArrayBuffer) {
          socketOpts.binary = true
          data = Buffer.from(data).toString()
        }
      } catch (error) {
        return socket.send(
          createJSONResponse({
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
            },
          })
        )
      }

      let payload: SocketRequest

      try {
        payload = JSON.parse(data)
      } catch (error) {
        return socket.send(
          createJSONResponse({
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
            },
          })
        )
      }

      try {
        const targetNs = namespaces.get(ns)!

        if (internalMethods.has(payload.method)) {
          const internalMethod = internalMethods.get(payload.method)!
          return socket.send(
            internalMethod(targetNs, payload, socketId),
            socketOpts
          )
        }

        if (!targetNs.methods.has(payload.method)) {
          return socket.send(
            createJSONResponse({
              id: payload.id,
              error: {
                code: -32601,
                message: 'Method not found',
              },
            }),
            socketOpts
          )
        }

        try {
          const fn = targetNs.methods.get(payload.method)!
          const response = await fn(payload.params, socketId)
  
          return socket.send(
            createJSONResponse({
              id: payload.id,
              result: response || undefined,
            }),
            socketOpts
          )
        } catch (error: Error | any) {
          return socket.send(
            createJSONResponse({
              id: payload.id,
              error: {
                code: -32000,
                message: error?.message || 'Internal error'
              }
            }),
            socketOpts
          )
        }
      } catch (error) {
        return socket.send(
          createJSONResponse({
            id: payload?.id || null,
            error: {
              code: -32603,
              message: 'Internal error',
            },
          }),
          socketOpts
        )
      }
    })
  }

  function generateNamespace(ns = '/') {
    namespaces.set(ns, {
      clients: new Map(),
      events: new Map(),
      methods: new Map(),
    })
  }

  function notify(
    name: string,
    socketIds: Set<string>,
    ns = '/',
    ...params: any[]
  ) {
    const targetNs = namespaces.get(ns)!
    const sockets = [...targetNs.clients.entries()]
      .filter(([socketId]) => socketIds.has(socketId))
      .map(([_, socket]) => socket)

    for (const socket of sockets) {
      socket.send(
        createJSONResponse({
          notification: name,
          params,
        })
      )
    }
  }

  function subscribe(
    targetNs: SocketNamespace,
    payload: SocketRequest,
    socketId: string
  ) {
    if (!validateRequest(payload)) {
      return createJSONResponse({
        id: payload.id,
        error: {
          code: -32602,
          message: 'Invalid params',
        },
      })
    }

    if (!targetNs.events.has(payload.params[0])) {
      return createJSONResponse({
        id: payload.id,
        error: {
          code: -32602,
          message: 'Invalid params',
        },
      })
    }

    const eventName = payload.params[0]
    const eventSubscriptions = targetNs.events.get(eventName)!
    eventSubscriptions.add(socketId)

    return createJSONResponse({
      id: payload.id,
      result: { [eventName]: true },
    })
  }

  function unsubscribe(
    targetNs: SocketNamespace,
    payload: SocketRequest,
    socketId: string
  ) {
    if (!validateRequest(payload)) {
      return createJSONResponse({
        id: payload.id,
        error: {
          code: -32602,
          message: 'Invalid params',
        },
      })
    }

    if (!targetNs.events.has(payload.params[0])) {
      return createJSONResponse({
        id: payload.id,
        error: {
          code: -32602,
          message: 'Invalid params',
        },
      })
    }

    const eventName = payload.params[0]
    const eventSubscriptions = targetNs.events.get(eventName)!
    eventSubscriptions.delete(socketId)

    return createJSONResponse({
      id: payload.id,
      result: { [eventName]: false },
    })
  }

  function register<T = any>(method: string, fn: RegisterFn<T>, ns = '/') {
    if (!namespaces.has(ns)) generateNamespace(ns)

    const targetNs = namespaces.get(ns)!
    targetNs.methods.set(method, fn)
  }

  function on<EventKey extends keyof SocketEvents>(
    event: EventKey,
    cb: SocketEvents[EventKey]
  ) {
    emitter.on(event, cb)
  }

  function event(name: string, ns = '/') {
    if (!namespaces.has(ns)) generateNamespace(ns)
    const targetNs = namespaces.get(ns)!

    if (targetNs.events.has(name)) throw new Error('Event already exists')

    targetNs.events.set(name, new Set())
  }

  function emit(name: string, ns = '/', ...params: any[]) {
    if (!namespaces.has(ns)) return
    const targetNs = namespaces.get(ns)!

    if (!targetNs.events.has(name)) return
    const eventSubscriptions = targetNs.events.get(name)!
    notify(name, eventSubscriptions, ns, ...params)
  }

  function of(ns: string) {
    if (!ns) throw new Error('Namespace is required')

    return {
      emit: (name: string, ...params: any[]) => emit(name, ns, ...params),
      register: <T = any>(method: string, fn: RegisterFn<T>) =>
        register(method, fn, ns),
      event: (name: string) => event(name, ns),
    }
  }

  async function handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    upgradeHead: Buffer,
    callback?: (
      client: WebSocket.WebSocket,
      request: IncomingMessage
    ) => void
  ) {
    ws.handleUpgrade(req, socket, upgradeHead, (socket) => {
      if (!listening) ws.emit('listening')
      ws.emit('connection', socket, req)
      if (callback) callback(socket, req)
    })
  }

  function close() {
    return new Promise((resolve, reject) => {
      try {
        ws.close()
        emitter.emit('close')
        resolve(null)
      } catch (err) {
        reject(err)
      }
    })
  }

  setup()

  return {
    on,
    of,
    event: (e: string) => event(e),
    handleUpgrade,
    register: <T = any>(method: string, fn: RegisterFn<T>) =>
      register(method, fn),
    emit: (name: string, ...params: any[]) => emit(name, '/', ...params),
    close,
  }
}
