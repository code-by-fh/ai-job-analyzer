import type { RealtimeSocket } from "@/realtime/connection";

/** Stands in for the browser WebSocket; tests drive its lifecycle explicitly. */
export class FakeSocket implements RealtimeSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event("open"));
  }

  receive(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  drop(code: number): void {
    this.onclose?.(new CloseEvent("close", { code }));
  }
}

export function createSocketFactory() {
  const sockets: FakeSocket[] = [];
  const create = (url: string): FakeSocket => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };
  return { sockets, create };
}
