import { useState } from "react";
import { useCall } from "../contexts/call-context";

export function UsernameForm() {
  const { setUsername } = useCall();
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      setUsername(trimmed);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="w-full space-y-6 rounded-lg border border-border p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Join a call</h1>
          <p className="text-sm text-muted-foreground">Enter your display name to get started.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Display name</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3"
              placeholder="Your name"
              autoFocus
            />
          </label>
          <button
            type="submit"
            disabled={!value.trim()}
            className="h-10 w-full rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-60"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
