import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Song } from "@shared/schema";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

interface AudioPlayerProps {
  currentSong: Song | null;
  onNext?: () => void;
  onPrevious?: () => void;
}

export const AudioPlayer = forwardRef<{ togglePlayPause: () => void }, AudioPlayerProps>(
  ({ currentSong, onNext, onPrevious }, ref) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (currentSong?.audioUrl && audioRef.current) {
      audioRef.current.src = currentSong.audioUrl;
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [currentSong]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  useImperativeHandle(ref, () => ({
    togglePlayPause
  }));

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleProgressChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
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
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
      
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="relative px-4 py-2">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleProgressChange}
              className="w-full cursor-pointer"
              aria-label="Seek"
              data-testid="slider-progress"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span data-testid="text-current-time">{formatTime(currentTime)}</span>
              <span data-testid="text-duration">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 pb-4 md:pb-6">
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

            <div className="flex items-center gap-4 md:gap-6">
              <Button
                size="icon"
                variant="ghost"
                onClick={onPrevious}
                disabled={!onPrevious}
                className="h-10 w-10"
                data-testid="button-previous"
                aria-label="Previous track"
              >
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button
                size="icon"
                onClick={togglePlayPause}
                className="h-12 w-12 rounded-full"
                data-testid="button-play-pause"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-current" />
                ) : (
                  <Play className="h-5 w-5 fill-current" />
                )}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                onClick={onNext}
                disabled={!onNext}
                className="h-10 w-10"
                data-testid="button-next"
                aria-label="Next track"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
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
