import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchBar } from "@/components/SearchBar";
import { MusicCard } from "@/components/MusicCard";
import { AudioPlayer } from "@/components/AudioPlayer";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Song, SearchResult } from "@shared/schema";
import { io, Socket } from "socket.io-client";

export default function MusicPlayer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [serverTime, setServerTime] = useState(0);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const currentSong = playlist[currentSongIndex] || null;

  const { data: searchResults, isLoading, error } = useQuery<SearchResult>({
    queryKey: [`/api/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length > 0,
  });

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('playlistUpdate', (data) => {
      console.log('Playlist update received:', {
        currentSongIndex: data.currentSongIndex,
        isPlaying: data.isPlaying,
        currentSong: data.playlist[data.currentSongIndex]?.title
      });

      setPlaylist(data.playlist);
      setCurrentSongIndex(data.currentSongIndex);
      setIsPlaying(data.isPlaying);
      setServerTime(data.serverTime);

      // Calculate accurate position
      if (data.currentPosition !== undefined) {
        setCurrentPosition(data.currentPosition);
      } else if (data.isPlaying && data.playbackStartTime) {
        const elapsed = Date.now() - data.playbackStartTime;
        setCurrentPosition(data.pausedAt + elapsed / 1000);
      } else {
        setCurrentPosition(data.pausedAt || 0);
      }
    });

    return () => socket.disconnect();
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleAddToPlaylist = async (song: Song) => {
    try {
      await fetch('/api/playlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(song)
      });
    } catch (error) {
      console.error('Failed to add song to playlist:', error);
    }
  };

  const songs = searchResults?.songs || [];

  const handleStartSession = () => {
    setHasUserInteracted(true);
    // Play a silent audio to unlock autoplay
    const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
    audio.play().catch(() => {});
  };

  // Auto-start session when a song is playing
  useEffect(() => {
    if (currentSong && isPlaying && !hasUserInteracted) {
      // Auto-unlock autoplay with user gesture simulation
      const unlockAutoplay = () => {
        setHasUserInteracted(true);
        // Play silent audio to unlock
        const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        audio.play().catch(() => {});
      };

      // Add click listener to unlock on first user interaction
      const handleFirstClick = () => {
        unlockAutoplay();
        document.removeEventListener('click', handleFirstClick);
      };

      document.addEventListener('click', handleFirstClick);

      return () => document.removeEventListener('click', handleFirstClick);
    }
  }, [currentSong, isPlaying, hasUserInteracted]);

  return (
    <div className="min-h-screen bg-background pb-32">
      {!hasUserInteracted && currentSong && isPlaying && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-6 py-3 rounded-lg shadow-lg animate-pulse">
          Click anywhere to enable audio
        </div>
      )}

      <SearchBar onSearch={handleSearch} isLoading={isLoading} />

      <div className="flex h-[calc(100vh-80px)]">
        <div className="flex-1 p-4 overflow-y-auto">
          <h2 className="text-xl font-semibold mb-4">Search Results</h2>
          {isLoading ? (
            <LoadingState />
          ) : songs.length > 0 ? (
            <div className="space-y-2">
              {songs.map((song) => (
                <div key={song.id} className="flex items-center gap-3 p-3 bg-card rounded-lg border hover:bg-accent/50">
                  <img src={song.thumbnail} alt={song.title} className="w-12 h-12 rounded object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
                  </div>
                  <button 
                    onClick={() => handleAddToPlaylist(song)}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        <div className="w-96 border-l bg-card/50 p-4 flex flex-col">
          <h2 className="text-xl font-semibold mb-4">Playlist ({playlist.length})</h2>
          
          {currentSong && (
            <div className="mb-4 p-3 bg-accent rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Now Playing</p>
              <div className="flex items-center gap-3">
                <img src={currentSong.thumbnail} alt={currentSong.title} className="w-16 h-16 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{currentSong.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{currentSong.artist}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.floor(currentPosition)}s / {currentSong.duration} {isPlaying ? '▶' : '⏸'}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto space-y-2">
            {playlist.map((song, index) => (
              <div key={song.id} className={`flex items-center gap-3 p-2 rounded ${currentSong?.id === song.id ? 'bg-primary/20' : 'bg-muted/30'}`}>
                <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                <img src={song.thumbnail} alt={song.title} className="w-8 h-8 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AudioPlayer
        currentSong={currentSong}
        playlist={playlist}
        isPlaying={isPlaying}
        currentPosition={currentPosition}
        socket={socketRef.current}
      />
    </div>
  );
}
