

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
  const [hasUnmuted, setHasUnmuted] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [localPosition, setLocalPosition] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastCommandRef = useRef<string>('');
  const lastSeekPositionRef = useRef<number>(-1);
  const hasTriggeredInitialPlayRef = useRef<boolean>(false);
  const lastVolumeUpdateRef = useRef<{ muted: boolean, volume: number }>({ muted: false, volume: 70 });
  const isSeekingRef = useRef<boolean>(false);
  // const lastPlayCommandRef = useRef<number>(0);
  const lastPlayCommandRef = useRef<number>(0); // To debounce play commands

  // Sync local position with server position and calculate real-time position
  useEffect(() => {
    if (isPlaying && serverTime) {
      const interval = setInterval(() => {
        const clientTime = Date.now();
        const timeDiff = (clientTime - serverTime) / 1000;
        const newPosition = Math.max(0, currentPosition + timeDiff);
        setLocalPosition(newPosition);
        // Only seek if the difference is significant to avoid over-syncing
        if (Math.abs(Math.floor(newPosition) - lastSeekPositionRef.current) > (isPublicRoom ? 1 : 2)) {
          if (iframeRef.current && !isSeekingRef.current) {
            lastSeekPositionRef.current = Math.floor(newPosition);
            isSeekingRef.current = true;
            iframeRef.current.contentWindow?.postMessage(
              `{"event":"command","func":"seekTo","args":[${lastSeekPositionRef.current}, true]}`,
              '*'
            );
            isSeekingRef.current = false;
          }
        }
      }, 1000); // Increased interval to 1 second to reduce frequency
      return () => clearInterval(interval);
    } else {
      setLocalPosition(currentPosition);
    }
  }, [currentPosition, isPlaying, serverTime]);

  // Listen for YouTube player ready and state changes
  useEffect(() => {
    if (currentSong) {
      console.log('AudioPlayer: Current song changed to:', currentSong.title);
      setIframeReady(false);
      hasTriggeredInitialPlayRef.current = false;
      setLocalPosition(0);

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== 'https://www.youtube.com') return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'onReady') {
          setIframeReady(true);
        } else if (data.event === 'onStateChange') {
          console.log('YouTube Player State:', data.info); // -1: unstarted, 1: playing, 2: paused, 3: buffering
          // Stabilize playback in public rooms
          if (isPublicRoom && isPlaying && [2, 3].includes(data.info) && Date.now() - lastPlayCommandRef.current > 1000) {
            lastPlayCommandRef.current = Date.now();
            iframeRef.current?.contentWindow?.postMessage(
              '{"event":"command","func":"playVideo","args":""}',
              '*'
            );
          }
        }
      };

      window.addEventListener('message', handleMessage);
      const timer = setTimeout(() => {
        setIframeReady(true); // Fallback
        window.removeEventListener('message', handleMessage);
      }, 3000);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('message', handleMessage);
      };
    }
  }, [currentSong?.id, isPlaying, isPublicRoom]);

  // Auto-unmute on first user interaction
  useEffect(() => {
    if (!hasUnmuted) {
      const handleFirstInteraction = () => {
        setHasUnmuted(true);
        const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        audio.play().catch((e) => console.error('Silent audio play failed:', e));

        setTimeout(() => {
          if (iframeRef.current) {
            try {
              iframeRef.current.contentWindow?.postMessage(
                '{"event":"command","func":"unMute","args":""}',
                '*'
              );
              iframeRef.current.contentWindow?.postMessage(
                `{"event":"command","func":"setVolume","args":[${volume}]}`,
                '*'
              );
            } catch (e) {
              console.error('Error unmuting on first interaction:', e);
            }
          }
        }, 500);

        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('touchstart', handleFirstInteraction);
      };

      document.addEventListener('click', handleFirstInteraction);
      document.addEventListener('touchstart', handleFirstInteraction);
      return () => {
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('touchstart', handleFirstInteraction);
      };
    }
  }, [hasUnmuted, volume]);

  // Trigger initial play for public and private rooms
  useEffect(() => {
    if (isPlaying && iframeReady && hasUnmuted && !hasTriggeredInitialPlayRef.current && iframeRef.current) {
      hasTriggeredInitialPlayRef.current = true;

      setTimeout(() => {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            `{"event":"command","func":"setVolume","args":[${volume}]}`,
            '*'
          );

          if (!isMuted) {
            iframeRef.current?.contentWindow?.postMessage(
              '{"event":"command","func":"unMute","args":""}',
              '*'
            );
          }

          if (Date.now() - lastPlayCommandRef.current > 1000) {
            lastPlayCommandRef.current = Date.now();
            iframeRef.current?.contentWindow?.postMessage(
              '{"event":"command","func":"playVideo","args":""}',
              '*'
            );
          }
        } catch (e) {
          console.error('Error playing on initial trigger:', e);
        }
      }, 500);
    }
  }, [isPlaying, iframeReady, hasUnmuted, volume, isMuted]);

  // Control YouTube player based on isPlaying state
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady && currentSong) {
      const command = isPlaying ? 'playVideo' : 'pauseVideo';
      if (lastCommandRef.current !== command && Date.now() - lastPlayCommandRef.current > 1000) {
        lastCommandRef.current = command;
        lastPlayCommandRef.current = Date.now();

        const timeoutId = setTimeout(() => {
          try {
            iframeRef.current?.contentWindow?.postMessage(
              `{"event":"command","func":"${command}","args":""}`,
              '*'
            );

            if (!isPlaying) {
              setTimeout(() => {
                iframeRef.current?.contentWindow?.postMessage(
                  '{"event":"command","func":"mute","args":""}',
                  '*'
                );
              }, 100);
            } else if (!isMuted) {
              setTimeout(() => {
                iframeRef.current?.contentWindow?.postMessage(
                  '{"event":"command","func":"unMute","args":""}',
                  '*'
                );
              }, 100);
            }
          } catch (e) {
            console.error(`Error ${command}:`, e);
          }
        }, 100);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [isPlaying, hasUnmuted, iframeReady, currentSong?.id, isMuted]);

  // Sync YouTube player position when currentPosition changes
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady && currentSong && !isSeekingRef.current) {
      const flooredPosition = Math.floor(currentPosition);
      const syncThreshold = isPublicRoom ? 3 : 5;

      if (Math.abs(flooredPosition - lastSeekPositionRef.current) > syncThreshold) {
        lastSeekPositionRef.current = flooredPosition;
        isSeekingRef.current = true;

        try {
          iframeRef.current?.contentWindow?.postMessage(
            `{"event":"command","func":"seekTo","args":[${flooredPosition}, true]}`,
            '*'
          );

          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
              `{"event":"command","func":"setVolume","args":[${volume}]}`,
              '*'
            );

            if (!isMuted) {
              iframeRef.current?.contentWindow?.postMessage(
                '{"event":"command","func":"unMute","args":""}',
                '*'
              );
            }

            if (isPlaying && Date.now() - lastPlayCommandRef.current > 1000) {
              lastPlayCommandRef.current = Date.now();
              iframeRef.current?.contentWindow?.postMessage(
                '{"event":"command","func":"playVideo","args":""}',
                '*'
              );
            }

            isSeekingRef.current = false;
          }, 300);
        } catch (e) {
          console.error('Error during seek:', e);
          isSeekingRef.current = false;
        }
      }
    }
  }, [currentPosition, hasUnmuted, iframeReady, currentSong?.id, isPublicRoom, isPlaying, isMuted, volume]);

  // Control YouTube iframe volume
  useEffect(() => {
    if (iframeRef.current && hasUnmuted && iframeReady && !isSeekingRef.current) {
      if (lastVolumeUpdateRef.current.muted === isMuted && 
          lastVolumeUpdateRef.current.volume === volume) {
        return;
      }

      lastVolumeUpdateRef.current = { muted: isMuted, volume };

      const timeoutId = setTimeout(() => {
        if (isMuted) {
          iframeRef.current?.contentWindow?.postMessage(
            '{"event":"command","func":"mute","args":""}',
            '*'
          );
        } else {
          iframeRef.current?.contentWindow?.postMessage(
            '{"event":"command","func":"unMute","args":""}',
            '*'
          );
          setTimeout(() => {
            iframeRef.current?.contentWindow?.postMessage(
              `{"event":"command","func":"setVolume","args":[${volume}]}`,
              '*'
            );
          }, 100);
        }
      }, 150);

      return () => clearTimeout(timeoutId);
    }
  }, [isMuted, volume, hasUnmuted, iframeReady]);

  const togglePlayPause = () => {
    if (isPublicRoom) return;

    if (!hasUnmuted) {
      setHasUnmuted(true);
      const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      audio.play().catch(() => {});

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
    setIsMuted(!isMuted);
  };

  const handleSeek = (value: number[]) => {
    if (isPublicRoom) return;

    const newPosition = value[0];

    if (!hasUnmuted) {
      setHasUnmuted(true);
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
            console.error('Error unmuting iframe:', e);
          }
        }
      }, 500);
    }

    if (socket && roomId) {
      socket.emit('seek', { position: newPosition, roomId, isPlaying });
      setLocalPosition(newPosition);
    }
  };

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="px-4 py-4">
          {currentSong && (
            <iframe
              ref={iframeRef}
              key={currentSong.id}
              width="100%"
              height="80"
              src={`https://www.youtube.com/embed/${currentSong.id}?enablejsapi=1&controls=0&start=${Math.floor(currentPosition)}`}
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
  );
});

AudioPlayer.displayName = "AudioPlayer";