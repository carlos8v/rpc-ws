import { describe, expect, it } from "vitest";

import { Server } from "./lib/server";
import { Client } from "./lib/client";

describe("RPC methods", () => {
  it("should call method and receive data", async () => {
    const server = makeServer();
    server.register("ping", () => "pong");

    const client = await Client("ws://localhost:3000");
    const { result, error } = await client.ping<string>();

    expect(result).toEqual("pong");
    expect(error).toBeUndefined();

    client.close();
    await server.close();
  });

  it("should be able to call method with params", async () => {
    const server = makeServer();
    server.register<[number]>("double", ([n]) => n * 2);

    const client = await Client("ws://localhost:3000");
    const { result, error } = await client.double<number>(2);

    expect(result).toEqual(4);
    expect(error).toBeUndefined();

    client.close();
    await server.close();
  });

  it("client should be able to call method with multiple params", async () => {
    const server = makeServer();
    server.register<[number, number]>("sum", ([a, b]) => a + b);

    const client = await Client("ws://localhost:3000");
    const { result, error } = await client.sum(2, 3);

    expect(result).toEqual(5);
    expect(error).toBeUndefined();

    client.close();
    await server.close();
  });

  it("should subscribe and unsubscribe to events", async () => {
    const server = makeServer();
    server.event("ping");

    const client = await Client("ws://localhost:3000");

    let receivedPings = 0;
    await client.subscribe("ping", () => {
      receivedPings += 1;
    });

    server.emit("ping");
    await new Promise((res) => setTimeout(res, 200));
    expect(receivedPings).toBe(1);

    server.emit("ping");
    await new Promise((res) => setTimeout(res, 200));
    expect(receivedPings).toBe(2);

    await client.unsubscribe("ping");

    server.emit("ping");
    await new Promise((res) => setTimeout(res, 200));
    expect(receivedPings).toBe(2);

    client.close();
    await server.close();
  });

  it("should return error on non existent method", async () => {
    const server = makeServer();

    const client = await Client("ws://localhost:3000");
    const { result, error } = await client.notExists();

    expect(result).toBeUndefined();
    expect(error).toStrictEqual({
      code: -32601,
      message: "Method not found",
    });

    client.close();
    await server.close();
  });

  it("should return error on method exception", async () => {
    const server = makeServer();
    server.register<[number, number]>("mockError", () => {
      throw new Error("application-error");
    });

    const client = await Client("ws://localhost:3000");
    const { result, error } = await client.mockError();

    expect(result).toBeUndefined();
    expect(error).toStrictEqual({
      code: -32000,
      message: "application-error",
    });

    client.close();
    await server.close();
  });

  it("should return custom error on method exception", async () => {
    class ApplicationError extends Error {
      data: unknown = undefined;

      constructor(message: string, data: unknown) {
        super(message);
        if (data) this.data = data;
      }
    }

    const server = makeServer();
    server.register<[number, number]>("customError", () => {
      throw new ApplicationError("custom-application-error", {
        error: true,
      });
    });

    const client = await Client("ws://localhost:3000");
    const { result, error } = await client.customError();

    expect(result).toBeUndefined();
    expect(error).toStrictEqual({
      code: -32000,
      message: "custom-application-error",
      data: {
        error: true,
      },
    });

    client.close();
    await server.close();
  });
});

describe("Server functions", () => {
  it("should get current clients", async () => {
    const server = makeServer();
    const client = await Client("ws://localhost:3000");

    expect(server.clients().size).toBe(1);

    client.close();
    await new Promise((res) => setTimeout(res, 200));

    expect(server.clients().size).toBe(0);

    await server.close();
  });

  it("should create and emit events", async () => {
    const server = makeServer();
    server.event("messageReceived");

    server.register<[string]>("message", ([message]) => {
      server.emit("messageReceived", message);
    });

    const client1 = await Client("ws://localhost:3000");
    const client2 = await Client("ws://localhost:3000");

    let broadcastedMessage = null;
    await client2.subscribe<[string]>("messageReceived", ([message]) => {
      broadcastedMessage = message;
    });

    client1.message("Hello world");

    await new Promise((res) => setTimeout(res, 200));

    expect(broadcastedMessage).toBe("Hello world");

    client1.close();
    client2.close();
    await server.close();
  });

  it("should create namespaces correctly", async () => {
    const server = makeServer();
    const chat = server.of("/chat");

    const client1 = await Client("ws://localhost:3000");
    const client2 = await Client("ws://localhost:3000/chat");
    const client3 = await Client("ws://localhost:3000/chat");

    expect(server.clients().size).toBe(1);
    expect(chat.clients().size).toBe(2);

    client1.close();
    client2.close();
    client3.close();
    await server.close();
  });
});

function makeServer() {
  const server = Server({
    port: 3000,
    host: "localhost",
  });

  return server;
}
