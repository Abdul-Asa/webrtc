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
    <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn(
          "h-full w-full object-cover",
          !isVideoEnabled && "hidden",
        )}
      >
        <track kind="captions" />
      </video>

      {!isVideoEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted-foreground/20 text-xl font-semibold text-muted-foreground">
            {initials}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-black/50 px-2 py-1">
        <span className="truncate text-xs text-white">
          {username}{isLocal ? " (You)" : ""}
        </span>
        <span className="ml-auto">
          {isAudioEnabled ? (
            <Mic className="h-3 w-3 text-white" />
          ) : (
            <MicOff className="h-3 w-3 text-red-400" />
          )}
        </span>
        {!isVideoEnabled && (
          <VideoOff className="h-3 w-3 text-red-400" />
        )}
      </div>
    </div>
  );
}
