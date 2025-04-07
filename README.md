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

server.event('hello')         // Create event
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

server.register('customError', () => {
  throw new ApplicationError('custom-application-error', { error: true })
})

console.log(server.clients()) // Get client sockets map

const chat = server.of('/chat') // Create namespace

chat.event('messageReceived')

chat.register('message', ([message]) => {
  chat.emit('messageReceived', message)
  return true
})

console.log(chat.clients()) // Get client sockets map in the namespace

// In the client
import { Client } from 'rpc-ws'

const ws = await Client('ws://localhost:3000')

console.log(await ws.ping())      // Receives { result: 'pong' }
console.log(await ws.double(2))   // Receives { result: 4 }
console.log(await ws.sum(5, 7))   // Receives { result: 12 }

// Handling Error

type ResponseError = {
  code: number
  message: string
  data?: unknown
}

const notExists = await ws.notExists()
const error = await ws.error()
const customError = await ws.customError()

console.log(notExists)    // Receives { error: ResponseError }
console.log(error)        // Receives { error: ResponseError }
console.log(customError)  // Receives { error: ResponseError with data prop }

// Receives user data
const { result } = await ws.login({
  login: 'user',
  password: 'pass'
})

ws.close() // Close websocket connection

// Connect to namespace
const wsChat = await Client('ws://localhost:3000/chat')

await wsChat.subscribe('messageReceived', ([message]) => {
  console.log(message) // Get broadcasted message
})

await wsChat.message('Hello world')

wsChat.close()
```

### Usage with express server

```js
import express from 'express'
import { Server } from 'rpc-ws'

const app = express()
... // Setup routes

const httpServer = app.listen(3000)

// Wrap express server with ws server
const wsServer = await Server({ server: httpServer })
```

### Usage with frontend frameworks

You can import the client on frontend repos, like vite or next

```js
import { BrowserClient } from "rpc-ws/frontend";

let rpc = undefined;

export async function getRpcClient() {
  if (rpc) return rpc;
  rpc = await BrowserClient("ws://localhost:3000/rpc");
  return rpc;
}

async function main() {
  const client = await getRpcClient();
  console.log(await client.ping());   // Receives { result: 'pong' }
}
```

## Browser support

You will need to host the browser bundle file to be able to access in your frontend.

### Serving with express

**src/server.js**:

```js
import { resolve } from "path";
import express from "express";

const app = express();
// Expose browser bundle script
app.use("/vendor", express.static(resolve("../node_modules/rpc-ws/dist")));

app.get("/", (req, res) => res.sendFile(resolve("../public/index.html")));

app.listen(3000);
```

**public/index.html**:

```html
<head>
  <!-- Import browser script -->
  <script src="vendor/main.browser.js"></script>
</head>
<body>
  <script>
    async function setupWS() {
      const ws = await RPCWebSocket.Client("ws://localhost:3000");
      console.log(await ws.ping()); // Receives 'pong'
    }

    setupWs();
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

And type client calls:

```ts
const client = await Client("ws://localhost:3000");
const response = await client.sum<number>(1, 2);

console.log(response); //  Receives { result: 3 }
```

## TODO

- [x] Handle client requests timeout
- [ ] Handle client connection timeout
- [ ] Batch client requests
