import type Peer from "simple-peer";
import type { ServerMessage, ClientMessage } from "../types";

export function parseServerMessage(rawMessage: string): ServerMessage | null {
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

  switch (obj.type) {
    case "joined": {
      if (
        typeof obj.roomId !== "string" ||
        typeof obj.clientId !== "string" ||
        !Array.isArray(obj.peers)
      ) {
        return null;
      }

      return {
        type: "joined",
        roomId: obj.roomId,
        clientId: obj.clientId,
        peers: obj.peers.filter(
          (p): p is { clientId: string; username: string; isVideoEnabled: boolean; isAudioEnabled: boolean } =>
            p &&
            typeof p === "object" &&
            typeof p.clientId === "string" &&
            typeof p.username === "string" &&
            typeof p.isVideoEnabled === "boolean" &&
            typeof p.isAudioEnabled === "boolean",
        ),
      };
    }

    case "peer_joined": {
      if (
        typeof obj.clientId !== "string" ||
        typeof obj.username !== "string" ||
        typeof obj.isVideoEnabled !== "boolean" ||
        typeof obj.isAudioEnabled !== "boolean"
      ) {
        return null;
      }

      return {
        type: "peer_joined",
        clientId: obj.clientId,
        username: obj.username,
        isVideoEnabled: obj.isVideoEnabled,
        isAudioEnabled: obj.isAudioEnabled,
      };
    }

    case "signal": {
      if (typeof obj.from !== "string" || !obj.data || typeof obj.data !== "object") {
        return null;
      }

      return {
        type: "signal",
        from: obj.from,
        data: obj.data as Peer.SignalData,
      };
    }

    case "peer_left": {
      if (typeof obj.clientId !== "string") {
        return null;
      }

      return { type: "peer_left", clientId: obj.clientId };
    }

    case "peer_media_state": {
      if (
        typeof obj.clientId !== "string" ||
        typeof obj.isVideoEnabled !== "boolean" ||
        typeof obj.isAudioEnabled !== "boolean"
      ) {
        return null;
      }

      return {
        type: "peer_media_state",
        clientId: obj.clientId,
        isVideoEnabled: obj.isVideoEnabled,
        isAudioEnabled: obj.isAudioEnabled,
      };
    }

    case "error": {
      if (typeof obj.message !== "string") {
        return null;
      }

      return { type: "error", message: obj.message };
    }

    default:
      return null;
  }
}

export function parseClientMessage(rawMessage: string): ClientMessage | null {
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

  switch (obj.type) {
    case "join": {
      if (typeof obj.roomId !== "string" || typeof obj.username !== "string") {
        return null;
      }

      return { type: "join", roomId: obj.roomId, username: obj.username };
    }

    case "signal": {
      if (typeof obj.to !== "string" || obj.data === undefined) {
        return null;
      }

      return { type: "signal", to: obj.to, data: obj.data };
    }

    case "media_state": {
      if (
        typeof obj.isVideoEnabled !== "boolean" ||
        typeof obj.isAudioEnabled !== "boolean"
      ) {
        return null;
      }

      return {
        type: "media_state",
        isVideoEnabled: obj.isVideoEnabled,
        isAudioEnabled: obj.isAudioEnabled,
      };
    }

    default:
      return null;
  }
}
