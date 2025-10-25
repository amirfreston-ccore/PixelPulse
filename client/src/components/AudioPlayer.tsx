
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
  serverTime: number;
  socket: any;
  roomId: string | null;
  isPublicRoom?: boolean;
}

export const AudioPlayer = forwardRef<{ togglePlayPause: () => void }, AudioPlayerProps>(
  ({ currentSong, playlist, isPlaying, currentPosition, serverTime, socket, roomId, isPublicRoom = true }, ref) => {
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [localPosition, setLocalPosition] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [userActivated, setUserActivated] = useState(false);
  const [useYouTube, setUseYouTube] = useState(true); // Start with YouTube for reliability
  const audioRef = useRef<HTMLAudioElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Single user activation handler
  useEffect(() => {
    const activate = async () => {
      if (userActivated) return;
      
      setUserActivated(true);
      
      // Create and play silent audio to unlock audio context
      const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      try {
        await silentAudio.play();
        console.log('Audio context unlocked');
      } catch (e) {
        console.log('Silent audio failed, but continuing');
      }
      
      // Unmute and set volume on current audio
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = volume / 100;
        console.log('Audio unmuted and volume set');
      }
    };

    const handleFirstInteraction = () => {
      activate();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };

    if (!userActivated) {
      document.addEventListener('click', handleFirstInteraction);
      document.addEventListener('touchstart', handleFirstInteraction);
    }

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [userActivated, volume]);

  // Handle song loading
  useEffect(() => {
    if (!currentSong || !audioRef.current) return;

    const audio = audioRef.current;
    
    console.log('Loading new song:', currentSong.title);
    
    // Reset state
    setAudioReady(false);
    
    // Configure audio element
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    
    // Start muted for autoplay compliance
    audio.muted = !userActivated;
    audio.volume = userActivated ? (isMuted ? 0 : volume / 100) : 0;
    
    const handleCanPlay = () => {
      console.log('Audio can play');
      setAudioReady(true);
      audio.currentTime = currentPosition;
      
      // Unmute if user has activated
      if (userActivated && !isMuted) {
        audio.muted = false;
        audio.volume = volume / 100;
      }
    };

    const handleError = (e: any) => {
      console.error('Audio load failed:', e);
      console.log('Trying direct YouTube embed as fallback');
      
      // Create a simple YouTube embed URL for audio
      const youtubeUrl = `https://www.youtube.com/embed/${currentSong.id}?autoplay=1&controls=0&enablejsapi=1`;
      
      // Create iframe fallback
      const iframe = document.createElement('iframe');
      iframe.src = youtubeUrl;
      iframe.style.display = 'none';
      iframe.allow = 'autoplay';
      document.body.appendChild(iframe);
      
      setAudioReady(false);
    };

    const handleLoadStart = () => {
      console.log('Audio load started');
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);
    
    // Try to load audio directly from our endpoint
    const audioUrl = `/api/audio/${currentSong.id}`;
    console.log('Loading audio from:', audioUrl);
    
    audio.src = audioUrl;
    audio.load();

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
    };
  }, [currentSong?.id, userActivated, volume, isMuted, currentPosition]);

  // Handle play/pause
  useEffect(() => {
    if (useYouTube && iframeRef.current && userActivated) {
      const command = isPlaying ? 'playVideo' : 'pauseVideo';
      iframeRef.current.contentWindow?.postMessage(
        `{"event":"command","func":"${command}","args":""}`,
        '*'
      );
    } else if (!useYouTube && audioRef.current && audioReady) {
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise) {
          playPromise
            .then(() => {
              console.log('Playback started');
              if (userActivated && !isMuted) {
                audioRef.current!.muted = false;
                audioRef.current!.volume = volume / 100;
              }
            })
            .catch((error) => {
              console.error('Play failed:', error);
            });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, audioReady, userActivated, isMuted, volume, useYouTube]);

  // Handle volume changes
  useEffect(() => {
    if (!audioRef.current || !userActivated) return;
    
    const audio = audioRef.current;
    audio.muted = isMuted;
    audio.volume = isMuted ? 0 : volume / 100;
  }, [volume, isMuted, userActivated]);

  // Update position from YouTube iframe
  useEffect(() => {
    if (!useYouTube || !currentSong) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.youtube.com') return;
      
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'onStateChange') {
          console.log('YouTube state:', data.info);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    };

    // Get current time from YouTube player
    const updatePosition = () => {
      if (iframeRef.current && userActivated) {
        iframeRef.current.contentWindow?.postMessage(
          '{"event":"command","func":"getCurrentTime","args":""}',
          '*'
        );
      }
    };

    const interval = setInterval(updatePosition, 1000);
    window.addEventListener('message', handleMessage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('message', handleMessage);
    };
  }, [useYouTube, currentSong, userActivated]);

  // Update local position in real-time
  useEffect(() => {
    if (useYouTube) {
      // For YouTube, sync with server position
      const interval = setInterval(() => {
        if (isPlaying && serverTime) {
          const clientTime = Date.now();
          const timeDiff = (clientTime - serverTime) / 1000;
          const newPosition = Math.max(0, currentPosition + timeDiff);
          setLocalPosition(newPosition);
        } else {
          setLocalPosition(currentPosition);
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      // For HTML5 audio
      const interval = setInterval(() => {
        if (audioRef.current && isPlaying && audioReady) {
          setLocalPosition(audioRef.current.currentTime);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying, audioReady, useYouTube, currentPosition, serverTime]);

  const togglePlayPause = () => {
    if (isPublicRoom) return;
    if (socket && roomId) {
      socket.emit('togglePlayPause', roomId);
    }
  };

  useImperativeHandle(ref, () => ({ togglePlayPause }));

  const handleNext = () => {
    if (isPublicRoom || !socket || !roomId) return;
    socket.emit('nextSong', roomId);
  };

  const handlePrevious = () => {
    if (isPublicRoom || !socket || !roomId) return;
    socket.emit('previousSong', roomId);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const parseDuration = (duration: string): number => {
    if (!duration) return 0;
    const parts = duration.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseInt(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    return 0;
  };

  const handleSeek = (value: number[]) => {
    if (isPublicRoom) return;
    const newPosition = value[0];
    
    if (useYouTube && iframeRef.current && userActivated) {
      iframeRef.current.contentWindow?.postMessage(
        `{"event":"command","func":"seekTo","args":[${newPosition}, true]}`,
        '*'
      );
    } else if (!useYouTube && audioRef.current) {
      audioRef.current.currentTime = newPosition;
    }
    
    setLocalPosition(newPosition);
    
    if (socket && roomId) {
      socket.emit('seek', { position: newPosition, roomId, isPlaying });
    }
  };

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border">
      {useYouTube && currentSong ? (
        <iframe
          ref={iframeRef}
          width="100%"
          height="80"
          src={`https://www.youtube.com/embed/${currentSong.id}?enablejsapi=1&controls=0&autoplay=${userActivated ? 1 : 0}&start=${Math.floor(currentPosition)}`}
          allow="autoplay; encrypted-media"
          className="hidden"
        />
      ) : (
        <audio ref={audioRef} />
      )}
      <div className="max-w-7xl mx-auto">
        <div className="px-4 py-4">
          <div className="space-y-3 mt-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground min-w-[40px] hidden sm:block">
                {formatTime(localPosition)}
              </span>
              <Slider
                value={[localPosition]}
                max={parseDuration(currentSong.duration) || 100}
                step={1}
                onValueChange={handleSeek}
                className="flex-1"
                disabled={isPublicRoom}
              />
              <span className="text-xs text-muted-foreground min-w-[40px] hidden sm:block">
                {currentSong.duration || "0:00"}
              </span>
            </div>

            <div className="flex items-center justify-center gap-4">
              {!userActivated && (
                <div className="text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  🔊 Click anywhere to enable audio
                </div>
              )}
              {!isPublicRoom && userActivated && (
                <>
                  <Button size="sm" variant="outline" onClick={handlePrevious} className="hidden sm:flex">
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={togglePlayPause}>
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleNext} className="hidden sm:flex">
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
              {currentSong.thumbnail ? (
                <img src={currentSong.thumbnail} alt={currentSong.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-accent">
                  <Music className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate text-sm">{currentSong.title}</p>
              <p className="text-xs text-muted-foreground truncate">{currentSong.artist}</p>
            </div>
          </div>

          {userActivated && (
            <div className="hidden md:flex items-center gap-3">
              <Button size="icon" variant="ghost" onClick={() => setIsMuted(!isMuted)} className="h-8 w-8">
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(value) => {
                  const newVolume = value[0];
                  setVolume(newVolume);
                  setIsMuted(newVolume === 0);
                }}
                className="w-24 md:w-32"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

AudioPlayer.displayName = "AudioPlayer";
