import { useCallback, useRef, useState } from "react";

export function useMedia() {
  const streamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const acquireMedia = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    streamRef.current = stream;
    setLocalStream(stream);
    setIsVideoEnabled(true);
    setIsAudioEnabled(true);

    return stream;
  }, []);

  const toggleVideo = useCallback((): boolean => {
    const stream = streamRef.current;
    if (!stream) return true;

    const next = !stream.getVideoTracks()[0]?.enabled;
    for (const track of stream.getVideoTracks()) {
      track.enabled = next;
    }
    setIsVideoEnabled(next);
    return next;
  }, []);

  const toggleAudio = useCallback((): boolean => {
    const stream = streamRef.current;
    if (!stream) return true;

    const next = !stream.getAudioTracks()[0]?.enabled;
    for (const track of stream.getAudioTracks()) {
      track.enabled = next;
    }
    setIsAudioEnabled(next);
    return next;
  }, []);

  const releaseMedia = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    streamRef.current = null;
    setLocalStream(null);
    setIsVideoEnabled(true);
    setIsAudioEnabled(true);
  }, []);

  return {
    localStream,
    isVideoEnabled,
    isAudioEnabled,
    acquireMedia,
    toggleVideo,
    toggleAudio,
    releaseMedia,
  };
}
