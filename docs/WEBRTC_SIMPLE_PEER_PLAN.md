# WebRTC App Plan: simple-peer + Signaling

## 1. Why simple-peer has no built-in signaling

**simple-peer** only handles the WebRTC side: creating the connection, handling SDP/ICE, and exposing streams/data channels. It does **not** move bytes between browsers—that requires a channel that already works (HTTP, WebSockets, etc.). So you must implement **signaling** yourself: a way to exchange the `signal` payloads between peers until the P2P connection is up.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  simple-peer does THIS                          You must build THIS         │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Create RTCPeerConnection                     • Transport for SDP/ICE     │
│  • Emit 'signal' with offer/answer/candidates  • Discovery: who to call?   │
│  • Accept signal data via .signal(data)        • Room / session concept    │
│  • Expose stream + data channel events         • (Optional) auth / IDs     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. High-level architecture (with signaling)

```
                    SIGNALING SERVER (your Hono + WebSocket)
                    ───────────────────────────────────────
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐          ┌─────────┐          ┌─────────┐
    │ Browser │          │ Browser │          │ Browser │
    │   A     │          │   B     │          │   C     │
    └────┬────┘          └────┬────┘          └────┬────┘
         │                    │                    │
         │   signal (offer/   │   signal (answer/  │
         │   answer/ICE)      │   ICE)             │
         └───────────────────┴────────────────────┘
                              │
                    (only until P2P is ready)
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐     P2P      ┌─────────┐     P2P  ┌─────────┐
    │ simple- │◄────────────►│ simple- │◄─────────►│ simple- │
    │  peer   │   (media/    │  peer   │  (media/ │  peer   │
    │   A     │    data)     │   B     │   data)  │   C     │
    └─────────┘              └─────────┘          └─────────┘
```

- **Signaling path:** Browser ↔ **your server** (WebSocket) ↔ other browser(s). Used only to exchange `signal` data and “who’s in the room.”
- **Data path (after connect):** Browser ↔ **browser** (direct or via TURN). simple-peer handles this; no app data goes through your server.

---

## 3. Signaling flow (1-to-1 call)

One peer is **initiator** (creates the offer), the other is **receiver** (creates the answer). Both may send multiple ICE candidate messages if you use trickle ICE.

```
  PEER A (initiator)              SIGNALING SERVER              PEER B (receiver)
        │                                  │                            │
        │  join room "abc"                 │                            │
        │─────────────────────────────────►│                            │
        │                                  │  join room "abc"           │
        │                                  │◄───────────────────────────│
        │                                  │                            │
        │  (optional: "user B joined")     │                            │
        │◄─────────────────────────────────│                            │
        │                                  │                            │
        │  create Peer({ initiator: true })│                            │
        │  → 'signal' fires with OFFER     │                            │
        │  send { to: B, signal: offer }   │                            │
        │─────────────────────────────────►│  forward to B               │
        │                                  │────────────────────────────►│
        │                                  │                            │
        │                                  │                    peer.signal(offer)
        │                                  │                    → 'signal' fires with ANSWER
        │                                  │  send { to: A, signal: answer }
        │  forward to A                    │◄────────────────────────────│
        │◄─────────────────────────────────│                            │
        │  peer.signal(answer)             │                            │
        │                                  │                            │
        │  (if trickle: exchange ICE candidates the same way)           │
        │                                  │                            │
        │  'connect' event                 │                    'connect' event
        │  ←────────────── P2P connection established ──────────────────►│
```

**Summary for 1-to-1:**

- One peer: `new Peer({ initiator: true, ... })`.
- Other peer: `new Peer({ initiator: false, ... })`.
- Every time `peer.on('signal', data => ...)` runs, send `data` to the other peer via your server; the other side calls `otherPeer.signal(data)`.

---

## 4. Scenarios: 1-to-1 vs group (mesh)

### 4.1 1-to-1 call

- **Topology:** One connection: A ↔ B.
- **Signaling:** Two users (e.g. in a “room” or by ID). One is initiator, one is receiver. Exchange one offer, one answer, and ICE candidates until `connect`.
- **simple-peer:** One `Peer` per side. Easiest case.

```
     ┌─────┐                    ┌─────┐
     │  A  │◄──────────────────►│  B  │
     └─────┘    1 connection    └─────┘
```

**Good for:** Video/voice call, screen share, or data channel between two people.

---

### 4.2 Group call (mesh)

- **Topology:** Every peer connects to every other peer. N people ⇒ N(N−1)/2 connections (e.g. 4 people ⇒ 6 connections).
- **Signaling:** Each peer must get the list of “other peers in the room.” For each other peer, you have one **initiator** and one **receiver** (decide by e.g. `peerId < otherId`). So each pair exchanges one offer/answer + ICE via the signaling server.
- **simple-peer:** Each participant has N−1 `Peer` instances (one per other participant). Your server only forwards `signal` messages between the right pair.

```
     ┌─────┐
     │  A  │
     └──┬──┘
        │ \     \
        │  \     \     Mesh: 4 peers → 6 connections
        │   \     \
     ┌──┴──┐   ┌──┴──┐
     │  B  │───│  C  │
     └──┬──┘   └──┬──┘
        │     /
        │    /
        │   /
     ┌──┴──┐
     │  D  │
     └─────┘
```

**Limits of mesh:** Upload bandwidth and CPU grow with the number of peers. Usually **mesh is only for small groups (e.g. 2–4 people)**. Beyond that, you’d use an SFU (server forwards streams) or similar—not just simple-peer mesh.

| Scenario   | Connections (mesh) | Who initiates per pair      | simple-peer instances per user |
|-----------|--------------------|-----------------------------|---------------------------------|
| 1-to-1   | 1                  | A initiator, B receiver     | 1                               |
| 3 people  | 3                  | Decide by ID for each pair  | 2                               |
| 4 people  | 6                  | Same                        | 3                               |

---

## 5. What to build (recommended order)

### Phase 1: Signaling server (Hono + WebSocket)

- Add WebSocket support to your existing Hono server (e.g. `hono/ws` or a small WS library).
- **Rooms:** When a client joins, send a room id (e.g. from URL or UI). Server keeps a map: `roomId → Set<clientId>`.
- **Messages:** When a client sends `{ type: 'signal', to: clientId, data: signalPayload }`, server forwards to `to`. Optionally also support `{ type: 'join', roomId }` and broadcast “user joined” / “user list” so peers know who to connect to.

### Phase 2: 1-to-1 call (same room = 2 people)

- **Client:** Join room via WebSocket. When “other user joined” (or you get a list of 2), decide initiator (e.g. lower id = initiator). Create one `Peer`, and for every `peer.on('signal', data)` send `{ to: otherId, signal: data }` over the socket. When you receive a signal message, call `peer.signal(data)`.
- **UI:** “Start call” / “Join room” → show local video, and once `connect` fires, show remote video (or data channel open).

### Phase 3: Small group (mesh, 3–4 people)

- **Client:** For each “other peer” in the room, create one `Peer`. For each pair, decide initiator (e.g. `myId < otherId`). Same as 1-to-1: forward all `signal` events to the right `to` client; on receive, find the `Peer` for that sender and call `.signal(data)`.
- **UI:** List of remote streams (one per peer). Keep it to 2–4 participants for a mesh-only design.

### Phase 4 (optional): TURN

- If some users can’t connect (strict NAT), add a TURN server to your ICE config and pass it into simple-peer. STUN is enough for many cases; TURN is the fallback when direct + STUN fail.

---

## 6. Tech choices that fit your stack

| Piece           | Suggestion for your project                          |
|-----------------|------------------------------------------------------|
| Backend         | Keep Hono; add WebSocket (e.g. `hono/ws` or `ws`)   |
| Signaling transport | WebSocket (one socket per client, long-lived)   |
| Client WebRTC   | `simple-peer` (browser build with Vite)              |
| 1-to-1          | One `Peer` per client, initiator/receiver by role    |
| Group (small)   | Mesh: N−1 `Peer`s per client, initiator per pair by ID |

---

## 7. Minimal signal message shape (for your server)

You can keep signaling payloads small and opaque. simple-peer’s `signal` payload looks like:

- `{ type: 'offer', sdp: '...' }` or `{ type: 'answer', sdp: '...' }`
- Or with trickle ICE: `{ candidate: '...', sdpMLineIndex: 0, ... }`

So the only thing your server must do is **deliver** the object from one peer to the other (and optionally include `from` / `to` so the client knows which `Peer` to call `.signal(data)` on).

Example:

- Client A → server: `{ type: 'signal', to: 'B', data: { type: 'offer', sdp: '...' } }`
- Server → Client B: same payload (add `from: 'A'` if helpful).
- Client B: `peers.get('A').signal(data)`.

---

## 8. Diagram: when is the server used vs P2P?

```
  BEFORE connect:
    All offer/answer/ICE traffic → via SIGNALING SERVER (WebSocket)

  AFTER 'connect' event:
    Media + data channel → DIRECT P2P (or via TURN if you added one)
    Signaling server is no longer in the media path
```

So: **signaling = only to get connected; simple-peer = the actual P2P pipe.** Your plan is to add a small WebSocket signaling layer, then use simple-peer for 1-to-1 first and mesh for small groups, with diagrams and scenarios as above.

---

## 9. Further reading

- **[Build the backend services needed for a WebRTC app](https://web.dev/articles/webrtc-infrastructure)** (web.dev)  
  Why signaling isn’t in the WebRTC spec (JSEP), offer/answer/ICE flow, peer discovery, building signaling (WebSocket, Socket.io, scaling, TLS), STUN/TURN roles, multiparty (mesh vs MCU), and security. Authoritative reference for infrastructure.

- **[Building a Signaling Server for Simple-Peer](https://javascript.plainenglish.io/building-a-signaling-server-for-simple-peer-f92d754edc85)** (JavaScript in Plain English)  
  Explains why simple-peer needs a separate signaling server and introduces [simple-peer-server](https://github.com/lisajamhoury/simple-peer-server) + [simple-peer-wrapper](https://github.com/lisajamhoury/simple-peer-wrapper) (Socket.IO + simple-peer). Good short intro to STUN/TURN in the simple-peer context; points to the web.dev article and Coturn/TURN setup.

---

## 10. Simple step-by-step: build the demo (1-to-1 call)

Follow these in order. Goal: two browser tabs can join the same “room” and get a working video (or data) connection.

### Step 1: Install dependencies

- **Client:** `simple-peer` (Vite will bundle it for the browser).
- **Server:** WebSocket support. Use Bun’s built-in WebSocket (no extra package) or add something like `hono/ws` if you prefer Hono helpers.

```bash
bun add simple-peer
```

(Server can stay with Hono + Bun’s native WebSocket upgrade.)

### Step 2: Signaling server (backend)

- In `server.ts` (or a separate WebSocket handler):
  - Use **Bun.serve** with a route that upgrades HTTP to WebSocket (e.g. path `/ws`), or add a WebSocket route to Hono if your version supports it.
  - Keep in-memory state: **rooms**: `Map<roomId, Set<socketId>>`, and optionally **socketId → roomId**.
  - On **connection:** generate a `clientId` (e.g. `crypto.randomUUID()`), send it to the client.
  - On **message (JSON):**
    - If `type === 'join'` and `roomId`: add this socket to `rooms.get(roomId)`, send back `{ type: 'joined', roomId, clientId, peers: [...other socket ids in room] }`, and notify others in the room `{ type: 'peer_joined', clientId }`.
    - If `type === 'signal'` and `to` and `data`: find the socket with id `to`, send `{ type: 'signal', from: thisSocketId, data }`.
  - On **close:** remove socket from its room, notify others `{ type: 'peer_left', clientId }`.

- Ensure the dev client can reach the WebSocket. Your Vite config already proxies `/ws` to the Hono server (port 3000); so client connects to `wss://localhost:5173/ws` in dev (or the same origin as the page).

### Step 3: Client – connect to signaling and join a room

- In the React app, open a WebSocket to `/ws` (so in dev it goes through Vite proxy to the server).
- Send `{ type: 'join', roomId: 'demo' }` (roomId from an input or fixed for the demo).
- On message:
  - `joined` → store `clientId`, `peers` list.
  - `peer_joined` → add that peer to the list; if you don’t have a peer for them yet, you’ll create one (see Step 4).
  - `signal` → pass `data` to the correct simple-peer instance (see Step 4).
  - `peer_left` → remove peer from list, destroy that Peer if any.

### Step 4: Client – create one simple-peer per other peer (1-to-1 = one peer)

- When you have at least one other peer in the room:
  - **Initiator:** the one with the “smaller” id (e.g. `myId < otherId`). Create `new SimplePeer({ initiator: true, stream: localStream, trickle: true })`.
  - **Receiver:** create `new SimplePeer({ initiator: false, stream: localStream, trickle: true })`.
- For that SimplePeer instance:
  - `peer.on('signal', data => ...)`: send over WebSocket `{ type: 'signal', to: otherClientId, data }`.
  - When you receive a `signal` message from the server with `from === otherClientId`: get the Peer for that id and call `peer.signal(data)`.
  - `peer.on('connect', () => ...)`: mark connected; show remote stream or enable data channel.
  - `peer.on('stream', stream => ...)`: attach `stream` to a `<video ref={remoteVideoRef} autoPlay />`.
  - `peer.on('error', err => ...)`: log; optionally show a message.
- Before creating the peer, get the user’s media: `navigator.mediaDevices.getUserMedia({ video: true, audio: true })` and pass as `stream` in the options (or add it later).

### Step 5: UI (minimal demo)

- **Room name:** input + “Join room” button → connect WebSocket and send `join` with that roomId.
- **Local video:** `<video ref={localVideoRef} muted autoPlay />` with `srcObject = localStream` once you have it.
- **Remote video:** `<video ref={remoteVideoRef} autoPlay />`; set `srcObject` in the `stream` event from the peer (or show “Waiting for peer…” until connected).
- **Status:** “Connecting…”, “Connected”, or “Waiting for peer” depending on WebSocket and peer state.

### Step 6: Run and test

- Run `bun run dev` (client + server).
- Open the app in two browser tabs (or two windows).
- In both, enter the same room name (e.g. `demo`) and click Join.
- Allow camera/mic when prompted. You should see your own video in both; once the peer connection is established, you should see the other tab’s video in each window.

### Step 7 (optional): Data channel

- simple-peer exposes a **data channel** when you use it for video. Use `peer.on('data', data => ...)` to receive and `peer.send(data)` to send (e.g. chat text). No server involvement for the data once connected.

---

**Summary checklist**

| # | Task |
|---|------|
| 1 | `bun add simple-peer` |
| 2 | Add WebSocket server: `/ws` upgrade, rooms map, handle `join` / `signal` / disconnect |
| 3 | Client: WebSocket to `/ws`, send `join`, handle `joined` / `peer_joined` / `signal` / `peer_left` |
| 4 | Client: one SimplePeer per other peer; initiator by id; `on('signal')` → send to server; receive `signal` → `peer.signal(data)`; `on('stream')` → show remote video |
| 5 | UI: room input, Join, local video, remote video, status |
| 6 | Test with two tabs, same room |
| 7 | (Optional) Use `peer.send()` / `on('data')` for chat or other data |
