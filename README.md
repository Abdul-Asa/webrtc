# WebRTC video call (React + Vite)

Multi-party video calling with a mesh of peer-to-peer connections. Max 4 people per room.

## How it works (short)

- **WebSocket** — Signalling only: join/leave room, who’s in the room, and exchanging SDP/ICE (offer, answer, candidates). No media over the socket.
- **WebRTC** — All audio/video is peer-to-peer via [simple-peer](https://github.com/feross/simple-peer). Each participant has a direct connection to every other in the room.
- **Signalling** — Custom JSON over WebSocket. One client is initiator per pair (`clientId < otherId`); they exchange offer → answer and ICE candidates until the P2P connection is up.
- **ICE / STUN / TURN** — Trickle ICE is used. No custom ICE config: the app relies on the browser’s default (usually a public STUN server). No TURN server; add one if you need it for strict NATs.

More details in the blog post (link TBD).

---

## Run

```bash
# install
bun install   # or npm install

# dev: terminal 1 – server
bun run server.ts

# dev: terminal 2 – client
bun run dev
```

## Stack

- **Client:** React, TypeScript, Vite, simple-peer, Tailwind/shadcn-style UI
- **Server:** Bun, Hono, WebSocket on `/ws`
