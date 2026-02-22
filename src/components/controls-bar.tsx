import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { useCall } from "../contexts/call-context";
import { cn } from "../lib/utils";

export function ControlsBar() {
  const { isVideoEnabled, isAudioEnabled, toggleVideo, toggleAudio, leaveRoom } = useCall();

  return (
    <div className="glass-strong flex items-center gap-3 rounded-full px-5 py-3 shadow-xl">
      <button
        type="button"
        onClick={toggleAudio}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95",
          isAudioEnabled
            ? "bg-white/10 text-foreground hover:bg-white/15"
            : "bg-red-500/90 text-white hover:bg-red-500",
        )}
      >
        {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>

      <button
        type="button"
        onClick={toggleVideo}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95",
          isVideoEnabled
            ? "bg-white/10 text-foreground hover:bg-white/15"
            : "bg-red-500/90 text-white hover:bg-red-500",
        )}
      >
        {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </button>

      <div className="mx-1 h-6 w-px bg-white/10" />

      <button
        type="button"
        onClick={leaveRoom}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-all duration-200 hover:scale-105 hover:bg-red-500 active:scale-95"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}
