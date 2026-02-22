import { useEffect, useRef } from "react";
import { Mic, MicOff, VideoOff } from "lucide-react";
import { cn } from "../lib/utils";

type VideoTileProps = {
  stream: MediaStream | null;
  username: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isLocal?: boolean;
};

export function VideoTile({
  stream,
  username,
  isVideoEnabled,
  isAudioEnabled,
  isLocal,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  const initials = username
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-sm bg-black/40 transition-shadow duration-300",
        isLocal
          ? "ring-1 ring-primary/30 shadow-lg shadow-primary/5"
          : "ring-1 ring-white/5",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          !isVideoEnabled && "opacity-0 absolute",
        )}
      >
        <track kind="captions" />
      </video>

      {!isVideoEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-primary/30 to-primary/10 text-2xl font-bold text-primary">
            {initials}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-linear-to-t from-black/60 via-black/30 to-transparent px-3 py-2.5">
        <span className="truncate text-xs font-medium text-white/90">
          {username}{isLocal ? " (You)" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isAudioEnabled ? (
            <Mic className="h-3.5 w-3.5 text-white/70" />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-red-400" />
          )}
          {!isVideoEnabled && (
            <VideoOff className="h-3.5 w-3.5 text-red-400" />
          )}
        </div>
      </div>
    </div>
  );
}
