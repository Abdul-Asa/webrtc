import path from "node:path";
import { Hono } from "hono";
import type { ClientMessage, WsData } from "./src/types";

const app = new Hono();
const port = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3000);
const distRoot = path.join(import.meta.dir, "dist");

const clientsById = new Map<string, Bun.ServerWebSocket<WsData>>();
const roomByClientId = new Map<string, string>();
const membersByRoom = new Map<string, Set<string>>();

function send(ws: Bun.ServerWebSocket<WsData>, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

function parseClientMessage(rawMessage: string): ClientMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.type === "join") {
    if (typeof obj.roomId !== "string" || typeof obj.username !== "string") {
      return null;
    }
    return { type: "join", roomId: obj.roomId, username: obj.username };
  }

  if (obj.type === "signal") {
    if (typeof obj.to !== "string" || obj.data === undefined) {
      return null;
    }
    return { type: "signal", to: obj.to, data: obj.data };
  }

  if (obj.type === "media_state") {
    if (typeof obj.isVideoEnabled !== "boolean" || typeof obj.isAudioEnabled !== "boolean") {
      return null;
    }
    return { type: "media_state", isVideoEnabled: obj.isVideoEnabled, isAudioEnabled: obj.isAudioEnabled };
  }

  return null;
}

function removeClientFromRoom(clientId: string): string | null {
  const currentRoomId = roomByClientId.get(clientId);

  if (!currentRoomId) {
    return null;
  }

  const members = membersByRoom.get(currentRoomId);

  if (!members) {
    roomByClientId.delete(clientId);
    return currentRoomId;
  }

  members.delete(clientId);
  roomByClientId.delete(clientId);

  if (members.size === 0) {
    membersByRoom.delete(currentRoomId);
  }

  return currentRoomId;
}

function handleJoin(ws: Bun.ServerWebSocket<WsData>, roomId: string, username: string): void {
  const normalizedRoomId = roomId.trim();

  if (!normalizedRoomId) {
    send(ws, { type: "error", message: "Room is required" });
    return;
  }

  removeClientFromRoom(ws.data.clientId);

  const members = membersByRoom.get(normalizedRoomId) ?? new Set<string>();

  if (!membersByRoom.has(normalizedRoomId)) {
    membersByRoom.set(normalizedRoomId, members);
  }

  if (members.size >= 4) {
    send(ws, { type: "error", message: "Room is full (max 4)" });
    return;
  }

  ws.data.username = username;

  const peers = [...members].map((memberId) => {
    const memberSocket = clientsById.get(memberId)!;
    return {
      clientId: memberId,
      username: memberSocket.data.username,
      isVideoEnabled: memberSocket.data.isVideoEnabled,
      isAudioEnabled: memberSocket.data.isAudioEnabled,
    };
  });

  members.add(ws.data.clientId);
  roomByClientId.set(ws.data.clientId, normalizedRoomId);

  send(ws, {
    type: "joined",
    roomId: normalizedRoomId,
    clientId: ws.data.clientId,
    peers,
  });

  for (const memberId of [...members]) {
    if (memberId === ws.data.clientId) continue;
    const memberSocket = clientsById.get(memberId);
    if (memberSocket) {
      send(memberSocket, {
        type: "peer_joined",
        clientId: ws.data.clientId,
        username: ws.data.username,
        isVideoEnabled: ws.data.isVideoEnabled,
        isAudioEnabled: ws.data.isAudioEnabled,
      });
    }
  }
}

function handleSignal(ws: Bun.ServerWebSocket<WsData>, to: string, data: unknown): void {
  const targetSocket = clientsById.get(to);

  if (!targetSocket) {
    send(ws, { type: "error", message: "Peer is not connected" });
    return;
  }

  const fromRoom = roomByClientId.get(ws.data.clientId);
  const toRoom = roomByClientId.get(to);

  if (!fromRoom || fromRoom !== toRoom) {
    send(ws, { type: "error", message: "Peer is not in your room" });
    return;
  }

  send(targetSocket, {
    type: "signal",
    from: ws.data.clientId,
    data,
  });
}

function handleMediaState(ws: Bun.ServerWebSocket<WsData>, isVideoEnabled: boolean, isAudioEnabled: boolean): void {
  ws.data.isVideoEnabled = isVideoEnabled;
  ws.data.isAudioEnabled = isAudioEnabled;

  const roomId = roomByClientId.get(ws.data.clientId);
  if (!roomId) return;

  const members = membersByRoom.get(roomId);
  if (!members) return;

  for (const memberId of members) {
    if (memberId === ws.data.clientId) continue;
    const memberSocket = clientsById.get(memberId);
    if (memberSocket) {
      send(memberSocket, {
        type: "peer_media_state",
        clientId: ws.data.clientId,
        isVideoEnabled,
        isAudioEnabled,
      });
    }
  }
}

async function serveStatic(pathname: string): Promise<Response | null> {
  if (pathname.includes("..")) return null;
  const subPath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const filePath = path.join(distRoot, subPath);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  return new Response(file, {
    headers: { "Content-Type": getMime(subPath) },
  });
}

function getMime(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const server = Bun.serve<WsData>({
  port,
  async fetch(request, bunServer) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgraded = bunServer.upgrade(request, {
        data: {
          clientId: crypto.randomUUID(),
          username: "",
          isVideoEnabled: true,
          isAudioEnabled: true,
        },
      });

      if (upgraded) {
        return;
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    const staticResponse = await serveStatic(url.pathname);
    if (staticResponse) return staticResponse;
    if (request.method === "GET") {
      const indexResponse = await serveStatic("/index.html");
      if (indexResponse) return indexResponse;
    }
    return app.fetch(request);
  },
  websocket: {
    open(ws) {
      clientsById.set(ws.data.clientId, ws);
    },
    message(ws, message) {
      const rawMessage = typeof message === "string" ? message : Buffer.from(message).toString();
      const parsed = parseClientMessage(rawMessage);

      if (!parsed) {
        send(ws, { type: "error", message: "Invalid message" });
        return;
      }

      if (parsed.type === "join") {
        handleJoin(ws, parsed.roomId, parsed.username);
        return;
      }

      if (parsed.type === "signal") {
        handleSignal(ws, parsed.to, parsed.data);
        return;
      }

      if (parsed.type === "media_state") {
        handleMediaState(ws, parsed.isVideoEnabled, parsed.isAudioEnabled);
        return;
      }
    },
    close(ws) {
      clientsById.delete(ws.data.clientId);

      const roomId = removeClientFromRoom(ws.data.clientId);

      if (!roomId) {
        return;
      }

      const members = membersByRoom.get(roomId);

      if (!members) {
        return;
      }

      for (const memberId of members) {
        const memberSocket = clientsById.get(memberId);

        if (memberSocket) {
          send(memberSocket, {
            type: "peer_left",
            clientId: ws.data.clientId,
          });
        }
      }
    },
  },
});

console.log(`Hono server running on http://localhost:${server.port}`);
