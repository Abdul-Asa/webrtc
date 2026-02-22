import { useCallback, useEffect, useRef, useState } from "react";
import Peer from "simple-peer";
import type { CallPhase, PeerInfo } from "../types";
import { parseServerMessage } from "../lib/parse-messages";
import { wsUrl } from "../lib/utils";

const MAX_ROOM_SIZE = 4;

type UsePeerOptions = {
  username: string;
  localStream: MediaStream | null;
};

export function usePeer({ username, localStream }: UsePeerOptions) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [clientId, setClientId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const peersRef = useRef<Map<string, Peer.Instance>>(new Map());
  const myIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Keep localStream ref in sync
  localStreamRef.current = localStream;

  const addRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.set(peerId, stream);
      return next;
    });
  }, []);

  const removeRemoteStream = useCallback((peerId: string) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const destroyPeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.destroy();
      peersRef.current.delete(peerId);
    }
    removeRemoteStream(peerId);
    setPeers((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, [removeRemoteStream]);

  const destroyAllPeers = useCallback(() => {
    for (const peer of peersRef.current.values()) {
      peer.destroy();
    }
    peersRef.current.clear();
    setRemoteStreams(new Map());
    setPeers(new Map());
  }, []);

  const createPeer = useCallback((otherPeerId: string) => {
    const myId = myIdRef.current;
    const stream = localStreamRef.current;
    const socket = socketRef.current;

    if (!myId || !stream || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (peersRef.current.has(otherPeerId)) {
      return;
    }

    const initiator = myId < otherPeerId;

    const peer = new Peer({
      initiator,
      stream,
      trickle: true,
    });

    peersRef.current.set(otherPeerId, peer);

    peer.on("signal", (data) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      socketRef.current.send(JSON.stringify({ type: "signal", to: otherPeerId, data }));
    });

    peer.on("connect", () => {
      // Peer connected - no action needed beyond state already tracked
    });

    peer.on("stream", (remoteStream) => {
      addRemoteStream(otherPeerId, remoteStream);
    });

    peer.on("close", () => {
      destroyPeer(otherPeerId);
    });

    peer.on("error", () => {
      destroyPeer(otherPeerId);
    });
  }, [addRemoteStream, destroyPeer]);

  const joinRoom = useCallback((targetRoomId: string) => {
    if (socketRef.current) return;

    setPhase("joining");
    setError(null);

    const socket = new WebSocket(wsUrl("/ws"));
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join", roomId: targetRoomId, username }));
    });

    socket.addEventListener("message", (event) => {
      const message = parseServerMessage(String(event.data));
      if (!message) return;

      if (message.type === "error") {
        setError(message.message);
        return;
      }

      if (message.type === "joined") {
        myIdRef.current = message.clientId;
        setClientId(message.clientId);
        setRoomId(message.roomId);
        setPhase("in-room");

        const peerMap = new Map<string, PeerInfo>();
        for (const p of message.peers) {
          peerMap.set(p.clientId, p);
          createPeer(p.clientId);
        }
        setPeers(peerMap);
        return;
      }

      if (message.type === "peer_joined") {
        setPeers((prev) => {
          const next = new Map(prev);
          next.set(message.clientId, {
            clientId: message.clientId,
            username: message.username,
            isVideoEnabled: message.isVideoEnabled,
            isAudioEnabled: message.isAudioEnabled,
          });
          return next;
        });
        createPeer(message.clientId);
        return;
      }

      if (message.type === "signal") {
        let peer = peersRef.current.get(message.from);
        if (!peer) {
          createPeer(message.from);
          peer = peersRef.current.get(message.from);
        }
        peer?.signal(message.data);
        return;
      }

      if (message.type === "peer_left") {
        destroyPeer(message.clientId);
        return;
      }

      if (message.type === "peer_media_state") {
        setPeers((prev) => {
          const existing = prev.get(message.clientId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(message.clientId, {
            ...existing,
            isVideoEnabled: message.isVideoEnabled,
            isAudioEnabled: message.isAudioEnabled,
          });
          return next;
        });
        return;
      }
    });

    socket.addEventListener("close", () => {
      socketRef.current = null;
      destroyAllPeers();
      myIdRef.current = null;
      setClientId(null);
      setRoomId(null);
      setPhase("idle");
    });

    socket.addEventListener("error", () => {
      setError("WebSocket error");
    });
  }, [username, createPeer, destroyPeer, destroyAllPeers]);

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    destroyAllPeers();
    myIdRef.current = null;
    setClientId(null);
    setRoomId(null);
    setPhase("idle");
    setError(null);
  }, [destroyAllPeers]);

  const broadcastMediaState = useCallback((isVideoEnabled: boolean, isAudioEnabled: boolean) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify({ type: "media_state", isVideoEnabled, isAudioEnabled }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      for (const peer of peersRef.current.values()) {
        peer.destroy();
      }
      peersRef.current.clear();
    };
  }, []);

  return {
    phase,
    clientId,
    roomId,
    peers,
    remoteStreams,
    error,
    joinRoom,
    leaveRoom,
    broadcastMediaState,
  };
}
