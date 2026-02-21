import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => {
	return c.json({ ok: true, runtime: "bun", framework: "hono" });
});

const port = Number(process.env.PORT ?? 3000);

console.log(`Hono server running on http://localhost:${port}`);

Bun.serve({
	port,
	fetch: app.fetch,
});
