import { useEffect, useState } from "react";
import "./globals.css";

function App() {
  const [status, setStatus] = useState("Checking Hono API...");

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/health");

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as {
          ok: boolean;
          runtime: string;
          framework: string;
        };

        setStatus(
          `${payload.framework} API online (${payload.runtime}) - ok: ${String(payload.ok)}`,
        );
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : "Failed to reach /api/health",
        );
      }
    };

    void loadStatus();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Vite + React + Hono (Bun)
        </h1>
        <p className="mt-2 text-sm text-slate-600">{status}</p>
      </section>
    </main>
  );
}

export default App;
