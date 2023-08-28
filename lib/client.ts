import type { SocketRequest, SocketResponse, SocketSendOptions } from './types'

import WebSocket from 'ws'
import { EventEmitter } from 'stream'

type SocketQueue = {
  type: 'request' | 'notification'
  result?: SocketResponse['result']
  error?: SocketResponse['error']
}

export async function Client(endpoint: string, opts?: SocketSendOptions) {
  let call_id = 0
  let connected = false

  const timeout = opts?.timeout || 10000

  const version = '2.0'
  const ws = new WebSocket(endpoint)

  const events = new Map<string, (params: any) => void>()
  const emitter = new EventEmitter()
  const queue = new Map<number, SocketQueue>()

  await setup()

  function assertConnection() {
    if (!connected) throw new Error('WebSocket connection not estabilished')
  }

  async function setup() {
    await new Promise((resolve) => {
      // TODO - Connection timeout
      ws.on('open', resolve)
    })

    connected = true

    ws.on('message', (data) => {
      try {
        if (data instanceof ArrayBuffer) {
          data = Buffer.from(data)
        }

        const payload: SocketResponse = JSON.parse(data.toString())

        if (payload.notification && events.has(payload.notification)) {
          const cb = events.get(payload.notification)!
          cb(Array.isArray(payload.params) ? payload.params : [payload.params])
          return
        }

        if (!payload.id) return

        const event = queue.get(payload.id)
        if (!event) return

        if (payload.error) {
          queue.set(payload.id, {
            ...event,
            error: payload.error,
          })
        } else {
          queue.set(payload.id, { ...event, result: payload.result })
        }

        emitter.emit(String(payload.id))
      } catch (error) {
        console.error(error)
      }
    })
  }

  function _send(
    request: SocketRequest
  ): Promise<SocketResponse['error'] | SocketResponse['result']> {
    return new Promise((resolve, reject) => {
      const callTimeout = setTimeout(
        () => emitter.emit(String(request.id), new Error('Request timed out')),
        timeout
      )

      ws.send(JSON.stringify(request), (socketErr) => {
        if (socketErr) {
          console.error(socketErr)
          return reject({ code: -32700, message: 'Parse error' })
        }

        emitter.on(String(request.id), (error?: Error) => {
          clearTimeout(callTimeout)

          if (error) {
            return reject({
              error: {
                code: -32000,
                messsage: error.message,
              },
            })
          }

          const response = queue.get(request.id)!
          queue.delete(request.id)

          return resolve({
            data: response.result,
            error: response.error,
          })
        })
      })
    })
  }

  function subscribe<T = any>(
    namespace: string,
    cb: (params: T) => void
  ): Promise<SocketResponse> {
    assertConnection()

    const request = {
      jsonrpc: version,
      method: 'rpc.on',
      params: [namespace],
      id: ++call_id,
    }

    events.set(namespace, cb)
    queue.set(request.id, { type: 'notification' })

    return _send(request)
  }

  function unsubscribe(namespace: string) {
    assertConnection()

    const request = {
      jsonrpc: version,
      method: 'rpc.off',
      params: [namespace],
      id: ++call_id,
    }

    events.delete(namespace)
    queue.set(request.id, { type: 'notification' })

    return _send(request)
  }

  function send(method: string, ...params: any) {
    assertConnection()

    const request = {
      jsonrpc: version,
      method,
      params,
      id: ++call_id,
    }

    queue.set(request.id, { type: 'request' })

    return _send(request)
  }

  function close() {
    ws.close()
  }

  return {
    subscribe,
    unsubscribe,
    send,
    close,
  }
}
