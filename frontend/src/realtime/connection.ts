import { backoffDelay } from "./backoff";

/** Close code the API uses for a missing, expired or revoked access token. */
export const POLICY_VIOLATION_CLOSE_CODE = 1008;

/** The part of the browser WebSocket this module uses; tests provide a fake. */
export interface RealtimeSocket {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(): void;
}

export interface ConnectionOptions {
  url: string;
  createSocket: (url: string) => RealtimeSocket;
  onMessage: (data: string) => void;
  /** Runs after every open that follows a lost connection (not the first successful one); the app refetches active queries here. */
  onReconnected: () => void;
  /** Runs on close code 1008; resolve false to stop reconnecting because the session is gone. */
  onAuthRejected: () => Promise<boolean>;
}

/** One socket per tab with exponential reconnect. The server ignores client messages, so it only listens. */
export class RealtimeConnection {
  private attempt = 0;
  private connectionLost = false;
  private stopped = false;
  private socket: RealtimeSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: ConnectionOptions) {}

  start(): void {
    this.open();
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }

  private open(): void {
    const socket = this.options.createSocket(this.options.url);
    socket.onopen = () => this.handleOpen();
    socket.onmessage = (event) => this.options.onMessage(String(event.data));
    socket.onclose = (event) => void this.handleClose(event.code);
    this.socket = socket;
  }

  private handleOpen(): void {
    if (this.connectionLost) this.options.onReconnected();
    this.connectionLost = false;
    this.attempt = 0;
  }

  private async handleClose(code: number): Promise<void> {
    if (this.stopped) return;
    // Also true when the very first attempt failed: events may have been missed from the start.
    this.connectionLost = true;
    if (code === POLICY_VIOLATION_CLOSE_CODE && !(await this.options.onAuthRejected())) return;
    // close() may have run while the refresh was pending.
    if (this.stopped) return;
    this.timer = setTimeout(() => this.open(), backoffDelay(this.attempt));
    this.attempt += 1;
  }
}
