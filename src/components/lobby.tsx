import { useState } from "react";
import { useCall } from "../contexts/call-context";

export function Lobby() {
  const { username, setUsername, joinRoom, phase, error } = useCall();
  const [roomInput, setRoomInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = roomInput.trim();
    if (!trimmed) return;
    await joinRoom(trimmed);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="w-full space-y-6 rounded-lg border border-border p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Join a room</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <strong>{username}</strong>
            <button
              type="button"
              onClick={() => setUsername("")}
              className="ml-2 text-xs underline"
            >
              change
            </button>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Room ID</span>
            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3"
              placeholder="e.g. demo"
              disabled={phase === "joining"}
              autoFocus
            />
          </label>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={!roomInput.trim() || phase === "joining"}
            className="h-10 w-full rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60"
          >
            {phase === "joining" ? "Joining..." : "Join room"}
          </button>
        </form>
      </div>
    </main>
  );
}
