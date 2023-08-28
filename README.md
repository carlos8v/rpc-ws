# JSON-RPC 2.0 WebSocket

A [JSON-RPC](https://www.jsonrpc.org/specification) implementation using websocket as a wrapper, available in Node.js environments and the web (client)

## Get started

```js
// In the server
import { Server } from 'rpc-ws'

const server = Server({
  port: 3000,
  host: 'localhost'
})

server.event('hello') // Create event
server.emit('hello', 'world') // Emit event

server.register('ping', () => {
  return 'pong'
})

server.register('double', ([n]) => {
  return n * 2
})

server.register('sum', ([n1, n2]) => {
  return n1 * n2
})

server.register('login', ([payload]) => {
  const { login, password } = payload
  const user = ... // Get logged user
  return user
})

// Handling errors

class ApplicationError extends Error {
  data = undefined

  constructor(message, data) {
    super(message)
    if (data) this.data = data
  }
}

server.register('error', () => {
  throw new Error('application-error',)
})

server.register('custom-error', () => {
  throw new ApplicationError('custom-application-error', { error: true })
})

console.log(server.clients()) // Get client sockets map

const chat = server.of('/chat') // Create namespace

chat.event('messageReceive')

chat.register('message', ([message]) => {
  chat.emit('messageReceive', message)
  return true
})

console.log(chat.clients()) // Get client sockets map in the namespace

// In the client
import { Client } from 'rpc-ws'

const ws = await Client('ws://localhost:3000')

console.log(await ws.send('ping'))              // Receives { data: 'pong' }
console.log(await ws.send('double', 2))         // Receives { data: 4 }
console.log(await ws.send('sum', 5, 7))         // Receives { data: 12 }

// Handling Error

type ResponseError = {
  code: number
  message: string
  data?: unknown
}

const notExists = await ws.send('not-exists')
const error = await ws.send('error')
const customError = await ws.send('custom-error')

console.log(notExists)        // ResponseError
console.log(error)            // ResponseError
console.log(customError)      // ResponseError with data prop

// Receives user data
const { data } = await ws.send('login', {
  login: 'user',
  password: 'pass'
})

ws.close() // Close websocket connection

// Connect to namespace
const wsChat = await Client('ws://localhost:3000/chat')

await wsChat.subscribe('messageReceive', ([message]) => {
  console.log(message) // Get broadcasted message
})

await wsChat.send('message', 'Hello world')

wsChat.close()
```

### Using with a express server
```js
import express from 'express'
import { Server } from 'rpc-ws'

const app = express()
... // Setup routes

const httpServer = app.listen(3000)

// Wrap express server with ws server
const wsServer = await Server({ server: httpServer })
```

### Usign with frontend frameworks

You can import the client on frontend repos, like vite or next

```js
import { BrowserClient } from 'rpc-ws/frontend'

let rpc = undefined

export async function getRpcClient() {
  if (rpc) return rpc
  rpc = await BrowserClient('ws://localhost:3000/rpc')
  return rpc
}

async function main() {
  const client = await getRpcClient()
  console.log(await client.send('ping')) // Receives 'pong'
}

```

## Browser support

You will need to host the browser bundle file to be able to access in your frontend.

### Serving with express

**src/server.js**:
```js
import { resolve } from 'path'
import express from 'express'

const app = express()
// Expose browser bundle script
express.use('/vendor', express.static(resolve(__dirname, '../node_modules/rpc-ws/dist')))

app.get('/', (req, res) => res.sendFile(resolve(__dirname, '../public/index.html')))

app.listen(3000)
```

**public/index.html**:
```html
<head>
  <!-- Import browser script -->
  <script src="vendor/main.browser.js">
</head>
<body>
  <script>
    async function setupWS() {
      const ws = await RPCWebSocket.Client('ws://localhost:3000')
      console.log(await ws.send('ping')) // Receives 'pong'
    }

    setupWs()
  </script>
</body>
```

---

## Typing functions

If you are using typescript is possible to type server functions:

```ts
const server = await Server({ ... })

server.register<[number, number]>('sum', (params) => {
  return params[0] + params[1]
}

type UserPayload = {
  email: string
  password: string
}

server.register<[UserPayload]>('login', async ([payload]) => {
  const user = await getUser({
    email: payload.email,
    password: payload.password
  })

  return user
})
```

## TODO

- [x] Handle client requests timeout
- [ ] Handle client connection timeout
- [ ] Batch client requests
