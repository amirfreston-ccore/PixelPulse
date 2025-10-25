import { Play, Pause, Volume2, VolumeX, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Song } from "@shared/schema";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

interface AudioPlayerProps {
  currentSong: Song | null;
  isPlaying: boolean;
  currentPosition: number;
  serverTime: number;
  socket: any;
  roomId: string | null;
  isPublicRoom?: boolean;
}

export const AudioPlayer = forwardRef<{ togglePlayPause: () => void }, AudioPlayerProps>(
  ({ currentSong, isPlaying, currentPosition, serverTime, socket, roomId, isPublicRoom = true }, ref) => {
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [userClicked, setUserClicked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Handle user click
  useEffect(() => {
    const handleClick = () => setUserClicked(true);
    if (!userClicked) {
      document.addEventListener('click', handleClick);
    }
    return () => document.removeEventListener('click', handleClick);
  }, [userClicked]);

  // Real-time position sync
  useEffect(() => {
    if (isPlaying && serverTime) {
      const interval = setInterval(() => {
        const clientTime = Date.now();
        const timeDiff = (clientTime - serverTime) / 1000;
        const newPosition = Math.max(0, currentPosition + timeDiff);
        setPosition(Math.floor(newPosition));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setPosition(currentPosition);
    }
  }, [isPlaying, currentPosition, serverTime]);

  // Reset position and sync on song change
  useEffect(() => {
    setPosition(0);
    
    // Sync YouTube player to correct position when song changes
    if (iframeRef.current && userClicked && currentPosition > 0) {
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage(
          `{"event":"command","func":"seekTo","args":[${currentPosition}, true]}`,
          '*'
        );
      }, 1000); // Wait for iframe to load
    }
  }, [currentSong?.id, currentPosition, userClicked]);

  // YouTube controls and sync
  useEffect(() => {
    if (!iframeRef.current || !userClicked) return;
    
    const command = isPlaying ? 'playVideo' : 'pauseVideo';
    iframeRef.current.contentWindow?.postMessage(
      `{"event":"command","func":"${command}","args":""}`,
      '*'
    );

    // Sync position every 3 seconds to keep all users aligned
    if (isPlaying) {
      const syncInterval = setInterval(() => {
        iframeRef.current?.contentWindow?.postMessage(
          `{"event":"command","func":"seekTo","args":[${position}, true]}`,
          '*'
        );
      }, 3000);
      return () => clearInterval(syncInterval);
    }
  }, [isPlaying, userClicked, position]);

  const togglePlayPause = () => {
    if (isPublicRoom || !socket || !roomId) return;
    socket.emit('togglePlayPause', roomId);
  };

  useImperativeHandle(ref, () => ({ togglePlayPause }));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border">
      <iframe
        ref={iframeRef}
        width="100%"
        height="80"
        src={`https://www.youtube.com/embed/${currentSong.id}?enablejsapi=1&controls=0&autoplay=${userClicked ? 1 : 0}`}
        allow="autoplay; encrypted-media"
        className="hidden"
      />
      
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Song Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
              {currentSong.thumbnail ? (
                <img src={currentSong.thumbnail} alt={currentSong.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate text-sm">{currentSong.title}</p>
              <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
              <p className="text-xs text-muted-foreground">
                {formatTime(position)} / {currentSong.duration || "0:00"}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            {!userClicked && (
              <div className="text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-lg">
                🔊 Click to enable audio
              </div>
            )}
            
            {!isPublicRoom && userClicked && (
              <Button size="sm" onClick={togglePlayPause}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            )}

            {/* Volume */}
            <div className="hidden md:flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={() => setIsMuted(!isMuted)} className="h-8 w-8">
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(value) => {
                  setVolume(value[0]);
                  setIsMuted(value[0] === 0);
                }}
                className="w-20"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

AudioPlayer.displayName = "AudioPlayer";
