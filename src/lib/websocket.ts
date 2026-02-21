import type { RoomMember, ServerEvent } from "../../types";
import { isRecord } from "../../utils";

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isRoomMember(value: unknown): value is RoomMember {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.joinedAt === "string" &&
    typeof value.lastSeenAt === "string" &&
    typeof value.online === "boolean"
  );
}

export function sortMembers(members: RoomMember[]): RoomMember[] {
  return [...members].sort((left, right) => {
    const byJoinOrder = left.joinedAt.localeCompare(right.joinedAt);

    if (byJoinOrder !== 0) {
      return byJoinOrder;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}

export function upsertMember(members: RoomMember[], nextMember: RoomMember): RoomMember[] {
  const withoutMember = members.filter((member) => member.id !== nextMember.id);
  return [...withoutMember, nextMember];
}

export function parseServerEvent(rawMessage: string): ServerEvent | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  if (parsed.type === "room:state") {
    if (typeof parsed.roomCode !== "string" || !Array.isArray(parsed.members)) {
      return null;
    }

    const members = parsed.members.filter(isRoomMember);
    return {
      type: "room:state",
      roomCode: parsed.roomCode,
      members,
    };
  }

  if (parsed.type === "member:joined" || parsed.type === "member:left") {
    if (!isRoomMember(parsed.member)) {
      return null;
    }

    return {
      type: parsed.type,
      member: parsed.member,
    };
  }

  if (parsed.type === "presence:pong") {
    if (typeof parsed.at !== "string") {
      return null;
    }

    return {
      type: "presence:pong",
      at: parsed.at,
    };
  }

  if (parsed.type === "error") {
    if (typeof parsed.message !== "string") {
      return null;
    }

    return {
      type: "error",
      message: parsed.message,
    };
  }

  return null;
}

export function wsUrl(wsPath: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${wsPath}`;
}

export function formatLastSeen(isoTime: string): string {
  const date = new Date(isoTime);

  if (Number.isNaN(date.getTime())) {
    return isoTime;
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
