import { useState } from "react";
import { useCall } from "../contexts/call-context";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function Lobby() {
  const { username, setUsername, joinRoom, phase, error } = useCall();
  const [loading, setLoading] = useState<boolean>(false);
  const [roomInput, setRoomInput] = useState("demo");


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const trimmed = roomInput.trim();
    if (!trimmed) return;
    await joinRoom(trimmed);
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-strong animate-fade-in w-full max-w-sm p-8 shadow-xl pointer-events-auto">
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Join a room</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as{" "}
            <strong className="text-foreground">{username}</strong>
            <button
              type="button"
              onClick={() => setUsername("")}
              className="ml-2 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              change
            </button>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Room ID
            </span>
            <Input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="e.g. demo"
              disabled={phase === "joining"}
              autoFocus
              className="h-11 bg-white/5 border-white/10 placeholder:text-white/20 focus-visible:ring-primary/50"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={!roomInput.trim() || loading}
            className="h-11 w-full text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/20"
          >
            {loading ? "Joining..." : "Join room"}
          </Button>
        </form>
      </div>
    </main>
  );
}
