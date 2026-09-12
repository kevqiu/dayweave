import { DurableObject } from "cloudflare:workers";

/**
 * One instance per trip. The single writer that sequences every edit, so two
 * phones dragging the same stop get a deterministic answer. See PLAN.md
 * section 6.
 *
 * Stub: accepts sockets and broadcasts, with no persistence or validation yet.
 * Hibernation is on from the start because retrofitting it means rewriting
 * every handler.
 */
export class TripRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Hibernation: the socket survives the instance being evicted, so an idle
    // trip costs nothing while staying connected.
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(sender: WebSocket, message: string | ArrayBuffer) {
    // TODO: validate membership, assign seq, write to D1, then broadcast.
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== sender) socket.send(message);
    }
  }

  async webSocketClose(socket: WebSocket, code: number) {
    // 1006 is an abnormal close and may not carry a valid code back.
    socket.close(code === 1006 ? 1000 : code);
  }
}
