import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  RoomMember,
  SocketStatus,
} from "../types";
import {
  formatLastSeen,
  normalizeRoomCode,
  parseServerEvent,
  sortMembers,
  upsertMember,
  wsUrl,
} from "./helpers";
import "./globals.css";

const SOCKET_STATUS_STYLE: Record<SocketStatus, string> = {
  connected: "bg-emerald-100 text-emerald-700",
  connecting: "bg-amber-100 text-amber-700",
  disconnected: "bg-slate-200 text-slate-700",
};

function App() {
  const [displayName, setDisplayName] = useState("Guest");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(null);
  const [selfMemberId, setSelfMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [statusMessage, setStatusMessage] = useState("Checking Hono API...");
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("disconnected");
  const [activity, setActivity] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);

  const onlineCount = useMemo(() => {
    return members.reduce((count, member) => {
      return member.online ? count + 1 : count;
    }, 0);
  }, [members]);

  const pushActivity = (message: string): void => {
    const stamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setActivity((current) => [`${stamp} ${message}`, ...current].slice(0, 8));
  };

  const stopHeartbeat = (): void => {
    if (heartbeatTimerRef.current === null) {
      return;
    }

    window.clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
  };

  const disconnectSocket = (): void => {
    stopHeartbeat();

    const socket = socketRef.current;

    if (!socket) {
      setSocketStatus("disconnected");
      return;
    }

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();

    socketRef.current = null;
    setSocketStatus("disconnected");
  };

  const connectPresenceSocket = (
    nextWsPath: string,
    roomCode: string,
    currentMemberId: string,
  ): void => {
    disconnectSocket();
    setSocketStatus("connecting");

    const socket = new WebSocket(wsUrl(nextWsPath));
    socketRef.current = socket;

    socket.onopen = () => {
      setSocketStatus("connected");
      setStatusMessage(`Room ${roomCode} ready. Presence is live.`);
      pushActivity("Realtime presence connected.");

      stopHeartbeat();
      heartbeatTimerRef.current = window.setInterval(() => {
        socket.send(JSON.stringify({ type: "presence:ping" }));
      }, 15000);
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      const payload = parseServerEvent(event.data);

      if (!payload) {
        return;
      }

      if (payload.type === "room:state") {
        setCurrentRoomCode(payload.roomCode);
        setMembers(sortMembers(payload.members));
        return;
      }

      if (payload.type === "member:joined") {
        setMembers((current) => sortMembers(upsertMember(current, payload.member)));

        if (payload.member.id !== currentMemberId) {
          pushActivity(`${payload.member.displayName} came online.`);
        }

        return;
      }

      if (payload.type === "member:left") {
        setMembers((current) => sortMembers(upsertMember(current, payload.member)));

        if (payload.member.id !== currentMemberId) {
          pushActivity(`${payload.member.displayName} went offline.`);
        }

        return;
      }

      if (payload.type === "error") {
        setStatusMessage(payload.message);
      }
    };

    socket.onerror = () => {
      setStatusMessage("Realtime connection error.");
    };

    socket.onclose = () => {
      stopHeartbeat();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setSocketStatus("disconnected");

      if (currentRoomCode) {
        pushActivity("Realtime presence disconnected.");
      }
    };
  };

  const joinRoom = async (rawRoomCode: string, skipBusy = false): Promise<void> => {
    const normalizedRoomCode = normalizeRoomCode(rawRoomCode);
    const safeDisplayName = displayName.trim();

    if (!normalizedRoomCode) {
      setStatusMessage("Enter a room code.");
      return;
    }

    if (safeDisplayName.length < 2 || safeDisplayName.length > 32) {
      setStatusMessage("Display name must be 2-32 characters.");
      return;
    }

    if (!skipBusy) {
      setIsBusy(true);
    }

    setStatusMessage(`Joining room ${normalizedRoomCode}...`);

    try {
      const response = await fetch(`/api/rooms/${normalizedRoomCode}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: safeDisplayName }),
      });

      const payload = (await response.json()) as JoinRoomResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to join room (${response.status})`);
      }

      setCurrentRoomCode(payload.roomCode);
      setRoomCodeInput(payload.roomCode);
      setSelfMemberId(payload.member.id);
      setMembers(sortMembers([payload.member]));
      setActivity([]);
      pushActivity(`Joined as ${payload.member.displayName}.`);

      connectPresenceSocket(payload.wsPath, payload.roomCode, payload.member.id);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not join the room.",
      );
    } finally {
      if (!skipBusy) {
        setIsBusy(false);
      }
    }
  };

  const createAndJoinRoom = async (): Promise<void> => {
    setIsBusy(true);
    setStatusMessage("Creating room...");

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
      });

      const payload = (await response.json()) as CreateRoomResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to create room (${response.status})`);
      }

      setRoomCodeInput(payload.roomCode);
      await joinRoom(payload.roomCode, true);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not create room.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const leaveRoom = (): void => {
    disconnectSocket();
    setCurrentRoomCode(null);
    setSelfMemberId(null);
    setMembers([]);
    setActivity([]);
    setStatusMessage("Left room.");
  };

  useEffect(() => {
    const savedName = window.localStorage.getItem("mesh-room-display-name");

    if (savedName) {
      setDisplayName(savedName);
    }
  }, []);

  useEffect(() => {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      return;
    }

    window.localStorage.setItem("mesh-room-display-name", trimmedName);
  }, [displayName]);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch("/api/health");

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          ok: boolean;
          framework: string;
          runtime: string;
        };

        if (!cancelled) {
          setStatusMessage(
            `${payload.framework} API online (${payload.runtime}) - ok: ${String(payload.ok)}`,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(
            error instanceof Error ? error.message : "Failed to reach /api/health",
          );
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (heartbeatTimerRef.current !== null) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }

      const socket = socketRef.current;

      if (socket) {
        socket.close();
        socketRef.current = null;
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#dbeafe_0%,transparent_40%),radial-gradient(circle_at_90%_20%,#dcfce7_0%,transparent_38%),linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-8 text-slate-900 sm:px-6">
      <section className="mx-auto w-full max-w-5xl rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Mesh Room MVP
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
              First slice: create/join room and realtime presence over WebSocket.
              Calls and files come next.
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${SOCKET_STATUS_STYLE[socketStatus]}`}
          >
            {socketStatus}
          </span>
        </div>

        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {statusMessage}
        </p>

        {!currentRoomCode ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.2fr,1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Join Flow</h2>
              <p className="mt-1 text-sm text-slate-600">
                Enter your display name and room code, or create a room and auto-join.
              </p>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Display Name
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={32}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-indigo-300 transition focus:ring-2"
                  placeholder="e.g. Asa"
                />
              </label>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  value={roomCodeInput}
                  onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase outline-none ring-indigo-300 transition focus:ring-2"
                  placeholder="Room code"
                />
                <button
                  type="button"
                  onClick={() => void joinRoom(roomCodeInput)}
                  disabled={isBusy}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  Join Room
                </button>
              </div>

              <button
                type="button"
                onClick={() => void createAndJoinRoom()}
                disabled={isBusy}
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create Room and Join
              </button>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">What is live now</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li>- Room creation endpoint</li>
                <li>- Room join endpoint</li>
                <li>- WebSocket presence updates</li>
                <li>- Online/offline member status in realtime</li>
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                Open another browser tab to join the same room code and watch presence
                update instantly.
              </p>
            </article>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr,1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">Current room</p>
                  <h2 className="text-2xl font-semibold tracking-[0.18em] text-slate-900">
                    {currentRoomCode}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={leaveRoom}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                >
                  Leave Room
                </button>
              </div>

              <p className="mt-3 text-sm text-slate-600">
                {onlineCount} online / {members.length} total members
              </p>

              <ul className="mt-4 space-y-2">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {member.displayName}
                        {member.id === selfMemberId ? " (You)" : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        Last seen {formatLastSeen(member.lastSeenAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${member.online ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}
                    >
                      {member.online ? "Online" : "Offline"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Presence Activity</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {activity.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
                    Waiting for room events...
                  </p>
                ) : (
                  activity.map((line) => (
                    <p
                      key={line}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      {line}
                    </p>
                  ))
                )}
              </div>
            </article>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
