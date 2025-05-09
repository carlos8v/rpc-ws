export type SocketRequest = {
  id: number;
  jsonrpc: string;
  method: string;
  params: any;
};

export type SocketResponse<T = any> = {
  id?: number | null;
  jsonrpc: string;
  result?: T;
  notification?: string;
  params?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
};

export type SocketSendOptions = {
  timeout?: number;
};

export type SocketQueue = {
  type: "request" | "notification";
  result?: SocketResponse["result"];
  error?: SocketResponse["error"];
};
