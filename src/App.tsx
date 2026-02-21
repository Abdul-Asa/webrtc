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
} from "./lib/websocket";
import { isRecord } from "../utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import "./globals.css";

const SOCKET_STATUS_LABEL: Record<SocketStatus, string> = {
  connected: "connected",
  connecting: "connecting",
  disconnected: "disconnected",
};

const DISPLAY_NAME_STORAGE_KEY = "mesh-room-display-name";
const ROOM_SESSION_STORAGE_KEY = "mesh-room-session";
const HEARTBEAT_INTERVAL_MS = 15000;
const ACTIVITY_LOG_LIMIT = 8;

type ApiErrorResponse = {
  error?: string;
};

type PersistedRoomSession = {
  roomCode: string;
  memberId: string;
};

function FrameCorners() {
  return (
    <>
      {[
        "-top-px -left-px",
        "-top-px -right-px",
        "-bottom-px -left-px",
        "-bottom-px -right-px",
      ].map((position) => {
        const isTop = position.includes("top");
        const isLeft = position.includes("left");

        return (
          <div key={position} aria-hidden="true" className={`pointer-events-none absolute h-7 w-7 ${position}`}>
            <span
              className={`absolute ${isTop ? "top-0" : "bottom-0"} ${isLeft ? "left-0" : "right-0"} h-px w-full bg-[#30363d]`}
            />
            <span
              className={`absolute ${isTop ? "top-0" : "bottom-0"} ${isLeft ? "left-0" : "right-0"} h-full w-px bg-[#30363d]`}
            />
            <span
              className={`absolute ${isTop ? "-top-2" : "-bottom-2"} ${isLeft ? "-left-2" : "-right-2"} h-4 w-4`}
            >
              <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[#d0d7de]" />
              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#d0d7de]" />
            </span>
          </div>
        );
      })}
    </>
  );
}

async function parseResponse<T>(response: Response): Promise<T & ApiErrorResponse> {
  return (await response.json()) as T & ApiErrorResponse;
}

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
  const hasRestoredSessionRef = useRef(false);

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

    setActivity((current) =>
      [`${stamp} ${message}`, ...current].slice(0, ACTIVITY_LOG_LIMIT),
    );
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
      if (socketRef.current !== socket) {
        return;
      }

      setSocketStatus("connected");
      setStatusMessage(`Room ${roomCode} ready. Presence is live.`);
      pushActivity("Realtime presence connected.");

      stopHeartbeat();
      heartbeatTimerRef.current = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(JSON.stringify({ type: "presence:ping" }));
      }, HEARTBEAT_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket || typeof event.data !== "string") {
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
      if (socketRef.current !== socket) {
        return;
      }

      setStatusMessage("Realtime connection error.");
    };

    socket.onclose = () => {
      stopHeartbeat();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setSocketStatus("disconnected");

      if (roomCode) {
        pushActivity("Realtime presence disconnected.");
      }
    };
  };

  const joinRoom = async (
    rawRoomCode: string,
    skipBusy = false,
    reclaimMemberId?: string,
    displayNameOverride?: string,
  ): Promise<void> => {
    const normalizedRoomCode = normalizeRoomCode(rawRoomCode);
    const safeDisplayName = (displayNameOverride ?? displayName).trim();

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
      const requestBody: { displayName: string; memberId?: string } = {
        displayName: safeDisplayName,
      };

      if (reclaimMemberId) {
        requestBody.memberId = reclaimMemberId;
      }

      const response = await fetch(`/api/rooms/${normalizedRoomCode}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const payload = await parseResponse<JoinRoomResponse>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to join room (${response.status})`);
      }

      setCurrentRoomCode(payload.roomCode);
      setRoomCodeInput(payload.roomCode);
      setSelfMemberId(payload.member.id);
      setMembers(sortMembers([payload.member]));
      setActivity([]);
      pushActivity(`Joined as ${payload.member.displayName}.`);
      window.localStorage.setItem(
        ROOM_SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: payload.roomCode,
          memberId: payload.member.id,
        } satisfies PersistedRoomSession),
      );

      connectPresenceSocket(payload.wsPath, payload.roomCode, payload.member.id);
    } catch (error) {
      if (reclaimMemberId) {
        window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
      }

      setStatusMessage(
        error instanceof Error ? error.message : "Could not join the room.",
      );
    } finally {
      if (!skipBusy) {
        setIsBusy(false);
      }
    }
  };

  const joinRoomRef = useRef(joinRoom);
  joinRoomRef.current = joinRoom;

  const createAndJoinRoom = async (): Promise<void> => {
    setIsBusy(true);
    setStatusMessage("Creating room...");

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
      });

      const payload = await parseResponse<CreateRoomResponse>(response);

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
    window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
    setCurrentRoomCode(null);
    setSelfMemberId(null);
    setMembers([]);
    setActivity([]);
    setStatusMessage("Left room.");
  };

  useEffect(() => {
    if (hasRestoredSessionRef.current) {
      return;
    }

    hasRestoredSessionRef.current = true;

    const savedName = window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
    const savedSessionRaw = window.localStorage.getItem(ROOM_SESSION_STORAGE_KEY);
    const normalizedName = savedName?.trim() ?? "";
    const reconnectName = normalizedName || "Guest";

    if (normalizedName) {
      setDisplayName(normalizedName);
    }

    if (!savedSessionRaw) {
      return;
    }

    let session: PersistedRoomSession | null = null;

    try {
      const parsed = JSON.parse(savedSessionRaw) as unknown;

      if (
        isRecord(parsed) &&
        typeof parsed.roomCode === "string" &&
        typeof parsed.memberId === "string"
      ) {
        session = {
          roomCode: normalizeRoomCode(parsed.roomCode),
          memberId: parsed.memberId,
        };
      }
    } catch {
      window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
      return;
    }

    if (!session?.roomCode || !session.memberId) {
      window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
      return;
    }

    setRoomCodeInput(session.roomCode);
    void joinRoomRef.current(session.roomCode, false, session.memberId, reconnectName);
  }, []);

  useEffect(() => {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      return;
    }

    window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, trimmedName);
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
    <main className="relative min-h-screen overflow-hidden bg-[#06090f] px-4 py-8 text-[#e6edf3] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "radial-gradient(rgba(88,166,255,0.32) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 16%, rgba(88,166,255,0.2), transparent 42%), radial-gradient(circle at 78% 8%, rgba(63,185,80,0.13), transparent 34%), radial-gradient(circle at 48% 100%, rgba(88,166,255,0.1), transparent 40%)",
        }}
      />

      <section className="relative mx-auto w-full max-w-6xl border border-[#30363d] bg-[#0d1117]/95 p-4 shadow-[0_30px_70px_rgba(0,0,0,0.45)] sm:p-6">
        <FrameCorners />
        <header className="border-b border-[#30363d] pb-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#7d8590]">
            websocket + p2p demo
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[0.08em] uppercase sm:text-3xl">
            rtcshare
          </h1>
          <p className="mt-2 text-xs tracking-wide text-[#8b949e]">
            ws: {SOCKET_STATUS_LABEL[socketStatus]}
          </p>
        </header>

        <p className="mt-3 border border-[#30363d] border-l-2 border-l-[#58a6ff] bg-[#010409]/70 px-3 py-2 text-sm text-[#9fb0c3]">
          {statusMessage}
        </p>

        {!currentRoomCode ? (
          <div className="mt-4 grid grid-cols-1 gap-4">
            <Card className="relative border-[#30363d] bg-[#0f141c]/80">
              <FrameCorners />
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base uppercase tracking-widest">Join room</CardTitle>
                <CardDescription>Enter a name and room code.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                <label
                  htmlFor="display-name"
                  className="grid gap-1 text-xs font-semibold tracking-widest uppercase text-[#7d8590]"
                >
                  Display Name
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={32}
                    placeholder="e.g. Asa"
                    className="h-10 border-[#30363d] bg-[#010409]/70 text-[#e6edf3]"
                  />
                </label>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={roomCodeInput}
                    onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
                    placeholder="ROOM"
                    className="h-10 border-[#30363d] bg-[#010409]/70 text-base tracking-[0.2em] uppercase text-[#e6edf3]"
                  />
                  <Button
                    type="button"
                    onClick={() => void joinRoom(roomCodeInput)}
                    disabled={isBusy}
                    className="h-10 border border-[#2f81f7] bg-[#0d1117] text-[#cfe5ff] shadow-[inset_0_0_0_1px_rgba(88,166,255,0.24)] hover:bg-[#111927]"
                  >
                    Join Room
                  </Button>
                </div>

                <Button
                  type="button"
                  onClick={() => void createAndJoinRoom()}
                  disabled={isBusy}
                  variant="outline"
                  className="h-10 w-full border-[#30363d] bg-[#111827]/40 text-[#e6edf3] hover:border-[#8b949e] hover:bg-[#161b22]"
                >
                  Create + Join
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr,1fr]">
            <Card className="relative border-[#30363d] bg-[#0f141c]/80">
              <FrameCorners />
              <CardHeader className="p-4 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardDescription className="uppercase tracking-widest">
                      Current room
                    </CardDescription>
                    <CardTitle className="mt-1 text-3xl tracking-[0.18em] uppercase">
                      {currentRoomCode}
                    </CardTitle>
                  </div>
                  <Button
                    type="button"
                    onClick={leaveRoom}
                    variant="outline"
                    className="h-9 border-[#30363d] bg-[#111827]/40 text-[#e6edf3] hover:border-[#8b949e] hover:bg-[#161b22]"
                  >
                    Leave Room
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2">
                <p className="text-sm text-[#9fb0c3]">
                  {onlineCount} online / {members.length} total members
                </p>

                <ul className="mt-3 space-y-2">
                  {members.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-2 border border-[#30363d] bg-[#010409]/55 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#e6edf3]">
                          {member.displayName}
                          {member.id === selfMemberId ? " (You)" : ""}
                        </p>
                        <p className="text-xs text-[#7a8698]">
                          Last seen {formatLastSeen(member.lastSeenAt)}
                        </p>
                      </div>
                      <span
                        className={`border px-2 py-1 text-[11px] uppercase tracking-[0.08em] ${member.online ? "border-[#2ea043] text-[#3fb950]" : "border-[#6e7681] text-[#9ca3af]"}`}
                      >
                        {member.online ? "Online" : "Offline"}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="relative border-[#30363d] bg-[#0f141c]/80">
              <FrameCorners />
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base uppercase tracking-widest">
                  Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-2">
                {activity.length === 0 ? (
                  <p className="border border-[#30363d] bg-[#010409]/55 px-3 py-2 text-sm text-[#7a8698]">
                    Waiting for room events...
                  </p>
                ) : (
                  activity.map((line) => (
                    <p
                      key={line}
                      className="border border-[#30363d] bg-[#010409]/55 px-3 py-2 text-sm text-[#9fb0c3]"
                    >
                      {line}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
