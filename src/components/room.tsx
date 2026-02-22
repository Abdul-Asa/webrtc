import { useCall } from "../contexts/call-context";
import { VideoTile } from "./video-tile";
import { ControlsBar } from "./controls-bar";
import { cn } from "../lib/utils";

export function Room() {
  const {
    roomId,
    username,
    localStream,
    isVideoEnabled,
    isAudioEnabled,
    peers,
    remoteStreams,
  } = useCall();

  const peerEntries = [...peers.values()];
  const totalParticipants = 1 + peerEntries.length;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-medium">Room: {roomId}</h1>
        <span className="text-xs text-muted-foreground">
          {totalParticipants} participant{totalParticipants !== 1 ? "s" : ""}
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center p-4">
        <div
          className={cn(
            "grid w-full max-w-5xl gap-3",
            totalParticipants === 1 && "max-w-2xl grid-cols-1",
            totalParticipants === 2 && "grid-cols-1 md:grid-cols-2",
            totalParticipants >= 3 && "grid-cols-1 sm:grid-cols-2",
          )}
        >
          <VideoTile
            stream={localStream}
            username={username}
            isVideoEnabled={isVideoEnabled}
            isAudioEnabled={isAudioEnabled}
            isLocal
          />

          {peerEntries.map((peer) => (
            <VideoTile
              key={peer.clientId}
              stream={remoteStreams.get(peer.clientId) ?? null}
              username={peer.username}
              isVideoEnabled={peer.isVideoEnabled}
              isAudioEnabled={peer.isAudioEnabled}
            />
          ))}
        </div>
      </div>

      <footer className="border-t border-border px-4 py-4">
        <ControlsBar />
      </footer>
    </main>
  );
}
