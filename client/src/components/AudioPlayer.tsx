import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Song } from "@shared/schema";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

interface AudioPlayerProps {
  currentSong: Song | null;
  playlist: Song[];
  isPlaying: boolean;
  currentPosition: number;
  socket: any;
}

export const AudioPlayer = forwardRef<{ togglePlayPause: () => void }, AudioPlayerProps>(
  ({ currentSong, playlist, isPlaying, currentPosition, socket }, ref) => {
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [hasUnmuted, setHasUnmuted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Force iframe reload when song changes
  useEffect(() => {
    if (currentSong) {
      console.log('AudioPlayer: Current song changed to:', currentSong.title);
      setIframeKey(prev => prev + 1);
    }
  }, [currentSong?.id]);

  // Unmute when user interacts
  useEffect(() => {
    if (!hasUnmuted) {
      const handleFirstInteraction = () => {
        setHasUnmuted(true);
        // Send unmute command to YouTube iframe
        if (iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(
            '{"event":"command","func":"unMute","args":""}',
            '*'
          );
        }
        document.removeEventListener('click', handleFirstInteraction);
      };

      document.addEventListener('click', handleFirstInteraction);
      return () => document.removeEventListener('click', handleFirstInteraction);
    }
  }, [hasUnmuted]);

  const togglePlayPause = () => {
    if (socket) {
      socket.emit('togglePlayPause');
    }
  };

  useImperativeHandle(ref, () => ({
    togglePlayPause
  }));

  const handleNext = () => {
    if (socket) {
      socket.emit('nextSong');
    }
  };

  const handlePrevious = () => {
    if (socket) {
      socket.emit('previousSong');
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (!currentSong) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="px-4 py-4">
            {currentSong && (
              <iframe
                ref={iframeRef}
                key={`player-${currentSong.id}-${iframeKey}`}
                width="100%"
                height="80"
                src={`https://www.youtube.com/embed/${currentSong.id}?autoplay=1&mute=${hasUnmuted ? 0 : 1}&start=${Math.floor(currentPosition)}&controls=1&enablejsapi=1`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="rounded-lg mb-4"
              />
            )}
            <div className="flex items-center justify-center gap-4 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePrevious}
                disabled={!socket}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                onClick={togglePlayPause}
                disabled={!socket}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleNext}
                disabled={!socket}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground text-center mt-2">
              Playing at: {formatTime(currentPosition)} {isPlaying ? '▶' : '⏸'}
            </div>
          </div>

          <div className="flex items-center justify-between px-4 pb-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-14 w-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {currentSong.thumbnail ? (
                  <img 
                    src={currentSong.thumbnail} 
                    alt={currentSong.title}
                    className="w-full h-full object-cover"
                    data-testid="img-now-playing"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-accent">
                    <Music className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate" data-testid="text-now-playing-title">
                  {currentSong.title}
                </p>
                <p className="text-sm text-muted-foreground truncate" data-testid="text-now-playing-artist">
                  {currentSong.artist}
                </p>
              </div>
            </div>

            <div className="flex-1">
              <h4 className="font-semibold mb-2">Playlist ({playlist.length} songs)</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {playlist.map((song, index) => (
                  <div key={song.id} className={`text-sm p-2 rounded ${currentSong?.id === song.id ? 'bg-accent' : 'bg-muted/50'}`}>
                    <div className="font-medium truncate">{song.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{song.artist}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3 flex-1 justify-end">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleMute}
                className="h-10 w-10"
                data-testid="button-mute"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(value) => setVolume(value[0])}
                className="w-24 md:w-32"
                aria-label="Volume"
                data-testid="slider-volume"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

AudioPlayer.displayName = "AudioPlayer";
