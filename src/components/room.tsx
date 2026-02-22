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
    <main className="flex h-screen flex-col">
      <header className="glass flex items-center justify-between px-5 py-3 pointer-events-auto">
        <h1 className="text-sm font-semibold tracking-tight">{roomId}</h1>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {totalParticipants} participant{totalParticipants !== 1 ? "s" : ""}
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center p-4">
        <div
          className={cn(
            "grid w-full max-w-5xl gap-4 animate-fade-in pointer-events-auto",
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

      <footer className="flex justify-center px-4 pb-6 pt-2 pointer-events-auto">
        <ControlsBar />
      </footer>
    </main>
  );
}
