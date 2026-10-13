import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_BASE_MS, BACKOFF_MAX_MS } from "@/realtime/backoff";
import {
  POLICY_VIOLATION_CLOSE_CODE,
  RealtimeConnection,
  type ConnectionOptions,
} from "@/realtime/connection";
import { createSocketFactory } from "../support/fakeSocket";

const ABNORMAL_CLOSE_CODE = 1006;

function connect(overrides: Partial<ConnectionOptions> = {}) {
  const factory = createSocketFactory();
  const options: ConnectionOptions = {
    url: "ws://api.test/ws",
    createSocket: factory.create,
    onMessage: vi.fn(),
    onReconnected: vi.fn(),
    onAuthRejected: vi.fn(async () => true),
    ...overrides,
  };
  const connection = new RealtimeConnection(options);
  connection.start();
  return { connection, options, sockets: factory.sockets };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RealtimeConnection", () => {
  it("forwards messages as strings", () => {
    const { options, sockets } = connect();
    sockets[0].receive('{"type":"ai_error"}');
    expect(options.onMessage).toHaveBeenCalledWith('{"type":"ai_error"}');
  });

  it("reconnects with exponential backoff", async () => {
    const { sockets } = connect();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS - 1);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    sockets[1].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(2 * BACKOFF_BASE_MS);
    expect(sockets).toHaveLength(3);
  });

  it("resets the backoff after a successful open", async () => {
    const { sockets } = connect();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    sockets[1].open();
    sockets[1].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(sockets).toHaveLength(3);
  });

  it("reports a reconnect only after the first open", async () => {
    const { options, sockets } = connect();
    sockets[0].open();
    expect(options.onReconnected).not.toHaveBeenCalled();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    sockets[1].open();
    expect(options.onReconnected).toHaveBeenCalledTimes(1);
  });

  it("reports a reconnect when the first connection attempt failed before it ever opened", async () => {
    const { options, sockets } = connect();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    sockets[1].open();
    expect(options.onReconnected).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect when close() runs while the 1008 refresh is pending", async () => {
    let resolveRefresh: (refreshed: boolean) => void = () => {};
    const pending = new Promise<boolean>((resolve) => (resolveRefresh = resolve));
    const { connection, sockets } = connect({ onAuthRejected: vi.fn(() => pending) });
    sockets[0].drop(POLICY_VIOLATION_CLOSE_CODE);
    connection.close();
    resolveRefresh(true);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes the session on close code 1008 and reconnects", async () => {
    const { options, sockets } = connect();
    sockets[0].drop(POLICY_VIOLATION_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(options.onAuthRejected).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
  });

  it("stops reconnecting on 1008 when the session cannot be refreshed", async () => {
    const { sockets } = connect({ onAuthRejected: vi.fn(async () => false) });
    sockets[0].drop(POLICY_VIOLATION_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(sockets).toHaveLength(1);
  });

  it("closes the socket and stops reconnecting after close()", async () => {
    const { connection, sockets } = connect();
    connection.close();
    sockets[0].drop(ABNORMAL_CLOSE_CODE);
    await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
    expect(sockets[0].closed).toBe(true);
    expect(sockets).toHaveLength(1);
  });
});
