import { useState } from "react";
import { useCall } from "../contexts/call-context";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-strong animate-fade-in w-full max-w-sm p-8 shadow-xl pointer-events-auto">
        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Join a call</h1>
          <p className="text-sm text-muted-foreground">
            Enter your display name to get started.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Display name
            </span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="h-11 bg-white/5 border-white/10 placeholder:text-white/20 focus-visible:ring-primary/50"
            />
          </label>
          <Button
            type="submit"
            disabled={!value.trim()}
            className="h-11 w-full text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/20"
          >
            Continue
          </Button>
        </form>
      </div>
    </main>
  );
}
