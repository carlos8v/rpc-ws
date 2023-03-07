export type SocketRequest = {
  id: number
  jsonrpc: string
  method: string
  params: any
}

export type SocketResponse = {
  id?: number
  jsonrpc: string
  result?: any
  notification?: string
  params?: any
  error?: any
}
