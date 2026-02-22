import type Peer from "simple-peer";

// Shared domain types

export type MediaState = {
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
};

export type PeerInfo = {
  clientId: string;
  username: string;
} & MediaState;

// Client -> Server messages

export type ClientMessage =
  | { type: "join"; roomId: string; username: string }
  | { type: "signal"; to: string; data: unknown }
  | { type: "media_state"; isVideoEnabled: boolean; isAudioEnabled: boolean };

// Server -> Client messages

export type ServerMessage =
  | { type: "joined"; roomId: string; clientId: string; peers: PeerInfo[] }
  | { type: "peer_joined"; clientId: string; username: string; isVideoEnabled: boolean; isAudioEnabled: boolean }
  | { type: "signal"; from: string; data: Peer.SignalData }
  | { type: "peer_left"; clientId: string }
  | { type: "peer_media_state"; clientId: string; isVideoEnabled: boolean; isAudioEnabled: boolean }
  | { type: "error"; message: string };

// Server-side WebSocket data

export type WsData = {
  clientId: string;
  username: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
};

// Client-side call state

export type CallPhase = "idle" | "joining" | "in-room";
