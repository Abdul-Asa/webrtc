import { Hono } from "hono";
import type { Room, SocketSession } from "./types.ts";
import {
  broadcastRoom,
  createUniqueRoomCode,
  isRecord,
  memberSnapshot,
  roomMembersSnapshot,
  sanitizeDisplayName,
  sendEvent,
  touchMember,
  randomId,
} from "./utils.ts";

const app = new Hono();
const rooms = new Map<string, Room>();
const activeSockets = new Map<string, Bun.ServerWebSocket<SocketSession>>();
const pendingMemberRemovals = new Map<string, ReturnType<typeof setTimeout>>();
const DISCONNECTED_MEMBER_TTL_MS = 10_000;

const isMemberOnline = (memberId: string): boolean => activeSockets.has(memberId);

const clearPendingMemberRemoval = (memberId: string): void => {
  const timer = pendingMemberRemovals.get(memberId);

  if (!timer) {
    return;
  }

  clearTimeout(timer);
  pendingMemberRemovals.delete(memberId);
};

const scheduleMemberRemoval = (roomCode: string, memberId: string): void => {
  clearPendingMemberRemoval(memberId);

  const timer = setTimeout(() => {
    pendingMemberRemovals.delete(memberId);

    if (activeSockets.has(memberId)) {
      return;
    }

    const room = rooms.get(roomCode);
    const member = room?.members.get(memberId);

    if (!room || !member) {
      return;
    }

    room.members.delete(memberId);

    broadcastRoom(
      room,
      {
        type: "room:state",
        roomCode: room.code,
        members: roomMembersSnapshot(room, isMemberOnline),
      },
      activeSockets,
    );
  }, DISCONNECTED_MEMBER_TTL_MS);

  pendingMemberRemovals.set(memberId, timer);
};

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    runtime: "bun",
    framework: "hono",
    rooms: rooms.size,
  });
});

app.post("/api/rooms", (c) => {
  const roomCode = createUniqueRoomCode(rooms);
  const createdAt = new Date().toISOString();

  rooms.set(roomCode, {
    code: roomCode,
    createdAt,
    members: new Map(),
  });

  return c.json({ roomCode, createdAt }, 201);
});

app.post("/api/rooms/:roomCode/join", async (c) => {
  const roomCode = c.req.param("roomCode").toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return c.json({ error: "Room not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));

  if (!isRecord(body)) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const displayName = sanitizeDisplayName(body.displayName);

  if (!displayName) {
    return c.json(
      { error: "displayName must be between 2 and 32 characters" },
      400,
    );
  }

  const requestedMemberId =
    typeof body.memberId === "string" ? body.memberId.trim() : "";

  let member = requestedMemberId ? room.members.get(requestedMemberId) : undefined;

  if (member) {
    member.displayName = displayName;
    member.lastSeenAt = new Date().toISOString();
    clearPendingMemberRemoval(member.id);
  } else {
    const joinedAt = new Date().toISOString();
    member = {
      id: randomId("member"),
      displayName,
      joinedAt,
      lastSeenAt: joinedAt,
    };

    room.members.set(member.id, member);
  }

  const wsPath = `/ws?roomCode=${encodeURIComponent(roomCode)}&memberId=${encodeURIComponent(member.id)}`;

  return c.json(
    {
      roomCode,
      member: memberSnapshot(member, isMemberOnline(member.id)),
      wsPath,
    },
    201,
  );
});

app.get("/api/rooms/:roomCode/state", (c) => {
  const roomCode = c.req.param("roomCode").toUpperCase();
  const room = rooms.get(roomCode);

  if (!room) {
    return c.json({ error: "Room not found" }, 404);
  }

  return c.json({
    roomCode,
    createdAt: room.createdAt,
    members: roomMembersSnapshot(room, isMemberOnline),
  });
});

const port = Number(process.env.PORT ?? 3000);

console.log(`Hono server running on http://localhost:${port}`);

Bun.serve<SocketSession>({
  port,
  fetch(request, server) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const roomCode = url.searchParams.get("roomCode")?.toUpperCase() ?? "";
      const memberId = url.searchParams.get("memberId") ?? "";

      const room = rooms.get(roomCode);
      const member = room?.members.get(memberId);

      if (!room || !member) {
        return new Response("Invalid room or member", { status: 400 });
      }

      if (server.upgrade(request, { data: { roomCode, memberId } })) {
        return;
      }

      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    return app.fetch(request);
  },
  websocket: {
    open(socket) {
      const { roomCode, memberId } = socket.data;
      const room = rooms.get(roomCode);

      if (!room) {
        sendEvent(socket, { type: "error", message: "Room no longer exists" });
        socket.close(1008, "Room not found");
        return;
      }

      const member = room.members.get(memberId);

      if (!member) {
        sendEvent(socket, { type: "error", message: "Member not found" });
        socket.close(1008, "Member not found");
        return;
      }

      const existingSocket = activeSockets.get(memberId);
      const wasOnline = Boolean(existingSocket);

      if (existingSocket && existingSocket !== socket) {
        existingSocket.close(4001, "Superseded by a newer connection");
      }

      activeSockets.set(memberId, socket);
      clearPendingMemberRemoval(memberId);
      touchMember(rooms, roomCode, memberId);

      sendEvent(socket, {
        type: "room:state",
        roomCode,
        members: roomMembersSnapshot(room, isMemberOnline),
      });

      if (!wasOnline) {
        broadcastRoom(
          room,
          {
            type: "member:joined",
            member: memberSnapshot(member, true),
          },
          activeSockets,
          memberId,
        );
      }
    },
    message(socket, message) {
      if (typeof message !== "string") {
        return;
      }

      let payload: unknown;

      try {
        payload = JSON.parse(message);
      } catch {
        return;
      }

      if (!isRecord(payload) || payload.type !== "presence:ping") {
        return;
      }

      const updatedAt = touchMember(rooms, socket.data.roomCode, socket.data.memberId);

      sendEvent(socket, {
        type: "presence:pong",
        at: updatedAt,
      });
    },
    close(socket) {
      const { roomCode, memberId } = socket.data;

      if (activeSockets.get(memberId) !== socket) {
        return;
      }

      activeSockets.delete(memberId);

      const room = rooms.get(roomCode);

      if (!room) {
        return;
      }

      const member = room.members.get(memberId);

      if (!member) {
        return;
      }

      touchMember(rooms, roomCode, memberId);

      broadcastRoom(
        room,
        {
          type: "member:left",
          member: memberSnapshot(member, false),
        },
        activeSockets,
        memberId,
      );

      scheduleMemberRemoval(roomCode, memberId);
    },
  },
});
