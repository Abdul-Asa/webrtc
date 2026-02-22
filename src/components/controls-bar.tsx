import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { useCall } from "../contexts/call-context";
import { cn } from "../lib/utils";

export function ControlsBar() {
  const { isVideoEnabled, isAudioEnabled, toggleVideo, toggleAudio, leaveRoom } = useCall();

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={toggleAudio}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          isAudioEnabled
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-red-500 text-white hover:bg-red-600",
        )}
      >
        {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={toggleVideo}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          isVideoEnabled
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-red-500 text-white hover:bg-red-600",
        )}
      >
        {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={leaveRoom}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}
