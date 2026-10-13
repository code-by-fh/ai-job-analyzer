import { api } from "@/api/instance";
import { WS_URL } from "@/config";
import { refetchAfterReconnect, type RealtimeDeps } from "./applyEvent";
import { RealtimeConnection } from "./connection";
import { handleRealtimeMessage } from "./handleMessage";

/** Opens the tab's single socket for the signed-in user. */
export function openRealtime(userId: number, deps: RealtimeDeps): RealtimeConnection {
  const connection = new RealtimeConnection({
    url: WS_URL,
    createSocket: (url) => new WebSocket(url),
    onMessage: (raw) => handleRealtimeMessage(raw, userId, deps),
    onReconnected: () => void refetchAfterReconnect(deps.queryClient),
    onAuthRejected: reauthenticate,
  });
  connection.start();
  return connection;
}

// A rejected refresh already sends the user to /login through the client's onAuthLost.
async function reauthenticate(): Promise<boolean> {
  try {
    return await api.refreshSession();
  } catch {
    // Network trouble, not an expired session: keep reconnecting with backoff.
    return true;
  }
}
