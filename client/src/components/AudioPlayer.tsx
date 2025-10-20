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
  const [hasUnmuted, setHasUnmuted] = useState(true); // Always enable audio for sync
  const [iframeReady, setIframeReady] = useState(false);
  const [localPosition, setLocalPosition] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastCommandRef = useRef<string>('');
  const lastSeekPositionRef = useRef<number>(-1);
  const hasTriggeredInitialPlayRef = useRef<boolean>(false);

  // Sync local position with server position and calculate real-time position
  useEffect(() => {
    if (isPlaying && serverTime) {
      const interval = setInterval(() => {
        // Calculate position based on server time to avoid drift
        const clientTime = Date.now();
        const timeDiff = (clientTime - serverTime) / 1000;
        setLocalPosition(Math.max(0, currentPosition + timeDiff));
      }, 100); // Update more frequently for smoother seekbar
      return () => clearInterval(interval);
    } else {
      setLocalPosition(currentPosition);
    }
  }, [currentPosition, isPlaying, serverTime]);

  // Wait for iframe to be ready when song changes
  useEffect(() => {
    if (currentSong) {
      console.log('AudioPlayer: Current song changed to:', currentSong.title);
      setIframeReady(false);
      hasTriggeredInitialPlayRef.current = false;
      setLocalPosition(0);
      const timer = setTimeout(() => setIframeReady(true), 2000); // Increased delay to ensure API is ready
      return () => clearTimeout(timer);
    }
  }, [currentSong?.id]);

  // Trigger initial pause-play when new user joins and song is playing
  useEffect(() => {
    if (isPlaying && iframeReady && hasUnmuted && !hasTriggeredInitialPlayRef.current && iframeRef.current) {
      hasTriggeredInitialPlayRef.current = true;

      setTimeout(() => {
        try {
          // First unmute to ensure audio
          iframeRef.current?.contentWindow?.postMessage(
            '{"event":"command","func":"unMute","args":""}',
            '*'
          );
          
          // Then play
          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
              '{"event":"command","func":"playVideo","args":""}',
              '*'
            );
          }, 200);
        } catch (e) {
          console.error('Error playing on initial trigger:', e);
        }
      }, 500);
    }
  }, [isPlaying, iframeReady, hasUnmuted]);

  // Auto-interact and mute iframe after ready
  useEffect(() => {
    if (iframeRef.current && iframeReady && currentSong) {
      setTimeout(() => {
        // First interact (unmute briefly to enable API)
        iframeRef.current?.contentWindow?.postMessage(
          '{"event":"command","func":"unMute","args":""}',
          '*'
        );
        // Then immediately mute for sync-only purpose
        setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage(
            '{"event":"command","func":"mute","args":""}',
            '*'
          );
        }, 100);
      }, 500);
    }
  }, [iframeReady, currentSong?.id]);

  // Control YouTube player based on isPlaying state but keep muted
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady && currentSong) {
      const command = isPlaying ? 'playVideo' : 'pauseVideo';
      if (lastCommandRef.current !== command) {
        lastCommandRef.current = command;
        setTimeout(() => {
          // Ensure muted
          iframeRef.current?.contentWindow?.postMessage(
            '{"event":"command","func":"mute","args":""}',
            '*'
          );
          // Then play/pause
          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
              `{"event":"command","func":"${command}","args":""}`,
              '*'
            );
          }, 100);
        }, 100);
      }
    }
  }, [isPlaying, hasUnmuted, iframeReady, currentSong?.id]);

  // Sync YouTube player position when currentPosition changes significantly (user seeked)
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady && currentSong) {
      const flooredPosition = Math.floor(currentPosition);
      // For public rooms, sync more frequently to ensure synchronization
      const syncThreshold = isPublicRoom ? 1 : 2;
      
      if (Math.abs(flooredPosition - lastSeekPositionRef.current) > syncThreshold) {
        lastSeekPositionRef.current = flooredPosition;
        setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage(
            `{"event":"command","func":"seekTo","args":[${flooredPosition}, true]}`,
            '*'
          );
        }, 100);
      }
    }
  }, [currentPosition, hasUnmuted, iframeReady, currentSong?.id, isPublicRoom]);

  // Control audio element for actual sound
  useEffect(() => {
    if (audioRef.current && currentSong) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
      
      if (isPlaying) {
        audioRef.current.currentTime = localPosition;
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSong?.id, volume, isMuted]);

  // Sync audio position
  useEffect(() => {
    if (audioRef.current && Math.abs(audioRef.current.currentTime - localPosition) > 2) {
      audioRef.current.currentTime = localPosition;
    }
  }, [localPosition]);

  // Unmute when user interacts (for public rooms only if needed)
  useEffect(() => {
    if (!hasUnmuted) {
      const handleFirstInteraction = () => {
        setHasUnmuted(true);
        // Play silent audio to unlock autoplay
        const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        audio.play().catch(() => {});

        setTimeout(() => {
          if (iframeRef.current) {
            try {
              iframeRef.current.contentWindow?.postMessage(
                '{"event":"command","func":"unMute","args":""}',
                '*'
              );
            } catch (e) {
              console.error('Error unmuting on first interaction:', e);
            }
          }
        }, 500);
        document.removeEventListener('click', handleFirstInteraction);
      };

      document.addEventListener('click', handleFirstInteraction);
      return () => document.removeEventListener('click', handleFirstInteraction);
    }
  }, [hasUnmuted]);

  const togglePlayPause = () => {
    // Disabled for public room
    if (isPublicRoom) return;
    
    // Ensure user interaction is registered for autoplay
    if (!hasUnmuted) {
      setHasUnmuted(true);
      // Play silent audio to unlock autoplay
      const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      audio.play().catch(() => {});

      // Unmute the iframe
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(
            '{"event":"command","func":"unMute","args":""}',
            '*'
          );
        }
      }, 100);
    }

    if (socket && roomId) {
      socket.emit('togglePlayPause', roomId);
    }
  };

  useImperativeHandle(ref, () => ({
    togglePlayPause
  }));

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

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);

    if (iframeRef.current && hasUnmuted && iframeReady) {
      setTimeout(() => {
        const command = newMutedState ? 'mute' : 'unMute';
        iframeRef.current?.contentWindow?.postMessage(
          `{"event":"command","func":"${command}","args":[]}`,
          '*'
        );
      }, 100);
    }
  };

  const handleSeek = (value: number[]) => {
    if (isPublicRoom) return; // Disabled for public room
    
    const newPosition = value[0];

    // Ensure user interaction is registered for autoplay
    if (!hasUnmuted) {
      setHasUnmuted(true);
      // Play silent audio to unlock autoplay
      const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      audio.play().catch(() => {});

      // Unmute the iframe
      setTimeout(() => {
        if (iframeRef.current) {
          try {
            iframeRef.current.contentWindow?.postMessage(
              '{"event":"command","func":"unMute","args":""}',
              '*'
            );
          } catch (e) {
            console.error('Error unmuting iframe:', e);
          }
        }
      }, 500);
    }

    if (socket && roomId) {
      socket.emit('seek', { position: newPosition, roomId });

      // Trigger pause-play cycle to ensure audio plays after seeking
      if (isPlaying && iframeRef.current && iframeReady && hasUnmuted) {
        setTimeout(() => {
          try {
            // Pause
            iframeRef.current?.contentWindow?.postMessage(
              '{"event":"command","func":"pauseVideo","args":""}',
              '*'
            );

            // Then play after a short delay
            setTimeout(() => {
              try {
                iframeRef.current?.contentWindow?.postMessage(
                  '{"event":"command","func":"playVideo","args":""}',
                  '*'
                );
              } catch (e) {
                console.error('Error playing after seek:', e);
              }
            }, 300);
          } catch (e) {
            console.error('Error pausing for seek:', e);
          }
        }, 500);
      }
    }
  };

  if (!currentSong) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="px-4 py-4">
            {currentSong && (
              <>
                <iframe
                  ref={iframeRef}
                  key={currentSong.id}
                  width="100%"
                  height="80"
                  src={`https://www.youtube.com/embed/${currentSong.id}?autoplay=0&mute=0&start=${Math.floor(currentPosition)}&controls=1&enablejsapi=1`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="rounded-lg mb-4 hidden"
                />
                <audio
                  ref={audioRef}
                  key={`audio-${currentSong.id}`}
                  src={currentSong.audioUrl}
                  preload="auto"
                />
              </>
            )}
            <div className="space-y-3 mt-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground min-w-[40px]">
                  {formatTime(localPosition)}
                </span>
                <Slider
                  value={[localPosition]}
                  max={parseDuration(currentSong.duration) || 100}
                  step={1}
                  onValueChange={handleSeek}
                  className="flex-1"
                  aria-label="Seek"
                  disabled={isPublicRoom}
                />
                <span className="text-xs text-muted-foreground min-w-[40px]">
                  {currentSong.duration || "0:00"}
                </span>
              </div>

              <div className="flex items-center justify-center gap-4">
                {!isPublicRoom && (
                  <>
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
                  </>
                )}
                {isPublicRoom && (
                  <div className="text-sm text-muted-foreground">
                    Auto-playing • No manual controls
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {currentSong.thumbnail ? (
                  <img
                    src={currentSong.thumbnail}
                    alt={currentSong.title}
                    className="w-full h-full object-cover"
                    data-testid="img-now-playing"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-accent">
                    <Music className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate text-sm" data-testid="text-now-playing-title">
                  {currentSong.title}
                </p>
                <p className="text-xs text-muted-foreground truncate" data-testid="text-now-playing-artist">
                  {currentSong.artist}
                </p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleMute}
                className="h-8 w-8"
                data-testid="button-mute"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(value) => {
                  const newVolume = value[0];
                  setVolume(newVolume);
                  if (newVolume === 0) {
                    setIsMuted(true);
                  } else if (isMuted) {
                    setIsMuted(false);
                  }
                }}
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
