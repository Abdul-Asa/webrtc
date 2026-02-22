/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useState } from "react";
import type { CallPhase, PeerInfo } from "../types";
import { useMedia } from "../hooks/use-media";
import { usePeer } from "../hooks/use-peer";

type CallContextValue = {
  // State
  phase: CallPhase;
  roomId: string | null;
  clientId: string | null;
  username: string;
  peers: Map<string, PeerInfo>;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  error: string | null;
  // Actions
  setUsername: (username: string) => void;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState("");

  const {
    localStream,
    isVideoEnabled,
    isAudioEnabled,
    acquireMedia,
    toggleVideo: toggleMediaVideo,
    toggleAudio: toggleMediaAudio,
    releaseMedia,
  } = useMedia();

  const {
    phase,
    clientId,
    roomId,
    peers,
    remoteStreams,
    error,
    joinRoom: peerJoinRoom,
    leaveRoom: peerLeaveRoom,
    broadcastMediaState,
  } = usePeer({ username, localStream });

  const joinRoom = useCallback(async (targetRoomId: string) => {
    await acquireMedia();
    peerJoinRoom(targetRoomId);
  }, [acquireMedia, peerJoinRoom]);

  const leaveRoom = useCallback(() => {
    peerLeaveRoom();
    releaseMedia();
  }, [peerLeaveRoom, releaseMedia]);

  const toggleVideo = useCallback(() => {
    const next = toggleMediaVideo();
    broadcastMediaState(next, isAudioEnabled);
  }, [toggleMediaVideo, broadcastMediaState, isAudioEnabled]);

  const toggleAudio = useCallback(() => {
    const next = toggleMediaAudio();
    broadcastMediaState(isVideoEnabled, next);
  }, [toggleMediaAudio, broadcastMediaState, isVideoEnabled]);

  const value: CallContextValue = {
    phase,
    roomId,
    clientId,
    username,
    peers,
    localStream,
    remoteStreams,
    isVideoEnabled,
    isAudioEnabled,
    error,
    setUsername,
    joinRoom,
    leaveRoom,
    toggleVideo,
    toggleAudio,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
