import type { Member, MemberSnapshot, Room, ServerEvent, SocketSession } from "./types.ts";
import { isRecord } from "./shared.ts";

export { isRecord };

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function createRoomCode(): string {
  let result = "";

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    result += ROOM_CODE_CHARS[randomIndex];
  }

  return result;
}

export function createUniqueRoomCode(rooms: Map<string, Room>): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const roomCode = createRoomCode();

    if (!rooms.has(roomCode)) {
      return roomCode;
    }
  }

  throw new Error("Failed to allocate room code");
}

export function sanitizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length < 2 || trimmed.length > 32) {
    return null;
  }

  return trimmed;
}

export function memberSnapshot(member: Member, online: boolean): MemberSnapshot {
  return {
    id: member.id,
    displayName: member.displayName,
    joinedAt: member.joinedAt,
    lastSeenAt: member.lastSeenAt,
    online,
  };
}

export function roomMembersSnapshot(
  room: Room,
  isMemberOnline: (memberId: string) => boolean,
): MemberSnapshot[] {
  return [...room.members.values()]
    .map((member) => memberSnapshot(member, isMemberOnline(member.id)))
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
}

export function touchMember(
  rooms: Map<string, Room>,
  roomCode: string,
  memberId: string,
): string {
  const room = rooms.get(roomCode);
  const member = room?.members.get(memberId);
  const now = new Date().toISOString();

  if (member) {
    member.lastSeenAt = now;
  }

  return now;
}

export function sendEvent(
  socket: Bun.ServerWebSocket<SocketSession>,
  payload: ServerEvent,
): void {
  socket.send(JSON.stringify(payload));
}

export function broadcastRoom(
  room: Room,
  payload: ServerEvent,
  activeSockets: Map<string, Bun.ServerWebSocket<SocketSession>>,
  excludeMemberId?: string,
): void {
  for (const memberId of room.members.keys()) {
    if (memberId === excludeMemberId) {
      continue;
    }

    const socket = activeSockets.get(memberId);

    if (!socket) {
      continue;
    }

    sendEvent(socket, payload);
  }
}
