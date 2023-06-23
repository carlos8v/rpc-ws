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
console.log(await ws.send('not-exists', 'foo')) // Receives { error: Error }

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

## Browser support

You will need to host the browser bundle file to be able to access in your frontend.

### Serving with express

**src/server.js**:
```js
import { resolve } from 'path'
import express from 'express'

const app = express()
express.use('/', express.static(resolve(__dirname, '../node_modules/rpc-ws/dist')))

app.get('/', (req, res) => res.sendFile(resolve(__dirname, '../public/index.html')))

app.listen(3000)
```

**public/index.html**:
```html
<head>
  <!-- Import browser script -->
  <script src="main.browser.js">
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
