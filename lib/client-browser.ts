import type {
  SocketRequest,
  SocketResponse,
  SocketSendOptions,
  SocketQueue,
} from './types'

export async function Client(endpoint: string, opts?: SocketSendOptions) {
  let call_id = 0
  let connected = false

  const timeout = opts?.timeout || 10000

  const version = '2.0'
  const ws = new WebSocket(endpoint)

  const events = new Map<string, (res: any) => void>()
  const emitter = new EventTarget()
  const queue = new Map<number, SocketQueue>()

  await setup()

  function assertConnection() {
    if (!connected) throw new Error('WebSocket connection not estabilished')
  }

  async function setup() {
    connected = await Promise.race<boolean>([
      new Promise((resolve) =>
        ws.addEventListener('open', () => resolve(true))
      ),
      new Promise((_, reject) => setTimeout(() => reject(false), timeout)),
    ])
    assertConnection()

    ws.addEventListener('message', (e) => {
      try {
        const payload: SocketResponse = JSON.parse(e.data)

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

        emitter.dispatchEvent(new Event(String(payload.id)))
      } catch (error) {
        console.error(error)
      }
    })
  }

  function _send(
    request: SocketRequest
  ): Promise<SocketResponse['error'] | SocketResponse['result']> {
    return new Promise((resolve, reject) => {
      const callTimeout = setTimeout(() => {
        queue.set(request.id, {
          type: 'request',
          error: {
            code: -32700,
            message: 'Parse error',
          },
        })

        emitter.dispatchEvent(new Event(String(request.id)))
      }, timeout)

      try {
        ws.send(JSON.stringify(request))
      } catch (error) {
        return reject({
          error: {
            code: 32700,
            message: 'Parse error',
          },
        })
      }

      emitter.addEventListener(String(request.id), () => {
        clearTimeout(callTimeout)

        const response = queue.get(request.id)!
        queue.delete(request.id)

        return resolve({
          data: response.result,
          error: response.error,
        })
      })
    })
  }

  function subscribe(
    namespace: string,
    cb: (params: any[]) => void
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
