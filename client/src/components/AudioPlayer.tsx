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
  const [hasUnmuted, setHasUnmuted] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [localPosition, setLocalPosition] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastCommandRef = useRef<string>('');
  const lastSeekPositionRef = useRef<number>(-1);
  const hasTriggeredInitialPlayRef = useRef<boolean>(false);

  // Sync local position with server position
  useEffect(() => {
    setLocalPosition(currentPosition);
  }, [currentPosition]);

  // Update local position continuously when playing
  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        setLocalPosition(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isPlaying]);

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
              console.error('Error playing on initial trigger:', e);
            }
          }, 300);
        } catch (e) {
          console.error('Error pausing on initial trigger:', e);
        }
      }, 500);
    }
  }, [isPlaying, iframeReady, hasUnmuted]);

  // Control volume
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady) {
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage(
          `{"event":"command","func":"setVolume","args":[${volume}]}`,
          '*'
        );
      }, 100);
    }
  }, [volume, hasUnmuted, iframeReady]);

  // Control YouTube player based on isPlaying state
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady && currentSong) {
      const command = isPlaying ? 'playVideo' : 'pauseVideo';
      if (lastCommandRef.current !== command) {
        lastCommandRef.current = command;
        setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage(
            `{"event":"command","func":"${command}","args":""}`,
            '*'
          );
        }, 100);
      }
    }
  }, [isPlaying, hasUnmuted, iframeReady, currentSong?.id]);

  // Sync YouTube player position when currentPosition changes significantly (user seeked)
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady && currentSong) {
      const flooredPosition = Math.floor(currentPosition);
      // Only seek if position changed by more than 2 seconds (indicates manual seek, not natural playback)
      if (Math.abs(flooredPosition - lastSeekPositionRef.current) > 2) {
        lastSeekPositionRef.current = flooredPosition;
        setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage(
            `{"event":"command","func":"seekTo","args":[${flooredPosition}, true]}`,
            '*'
          );
        }, 100);
      }
    }
  }, [currentPosition, hasUnmuted, iframeReady, currentSong?.id]);

  // Unmute when user interacts
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

              // If song is already playing when user first interacts, trigger pause-play cycle
              if (isPlaying && iframeReady) {
                setTimeout(() => {
                  try {
                    // Pause
                    iframeRef.current?.contentWindow?.postMessage(
                      '{"event":"command","func":"pauseVideo","args":""}',
                      '*'
                    );

                    // Then play
                    setTimeout(() => {
                      try {
                        iframeRef.current?.contentWindow?.postMessage(
                          '{"event":"command","func":"playVideo","args":""}',
                          '*'
                        );
                      } catch (e) {
                        console.error('Error playing after first interaction:', e);
                      }
                    }, 300);
                  } catch (e) {
                    console.error('Error pausing after first interaction:', e);
                  }
                }, 300);
              }
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
  }, [hasUnmuted, isPlaying, iframeReady]);

  const togglePlayPause = () => {
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

    if (socket) {
      socket.emit('seek', newPosition);

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
              <iframe
                ref={iframeRef}
                key={currentSong.id}
                width="100%"
                height="80"
                src={`https://www.youtube.com/embed/${currentSong.id}?autoplay=0&mute=${hasUnmuted ? 0 : 1}&start=${Math.floor(currentPosition)}&controls=1&enablejsapi=1`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="rounded-lg mb-4 hidden"
              />
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
                />
                <span className="text-xs text-muted-foreground min-w-[40px]">
                  {currentSong.duration || "0:00"}
                </span>
              </div>

              <div className="flex items-center justify-center gap-4">
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
