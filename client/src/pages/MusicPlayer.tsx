import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchBar } from "@/components/SearchBar";
import { MusicCard } from "@/components/MusicCard";
import { AudioPlayer } from "@/components/AudioPlayer";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Song, SearchResult } from "@shared/schema";
import { io } from "socket.io-client";

export default function MusicPlayer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioPlayerRef = useRef<{ togglePlayPause: () => void }>(null);
  
  const currentSong = playlist[currentSongIndex] || null;

  const { data: searchResults, isLoading, error } = useQuery<SearchResult>({
    queryKey: [`/api/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length > 0,
  });

  useEffect(() => {
    const socket = io();
    
    socket.on('playlistUpdate', (data) => {
      setPlaylist(data.playlist);
      setCurrentSongIndex(data.currentSongIndex);
      setIsPlaying(data.isPlaying);
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

  return (
    <div className="min-h-screen bg-background">
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
              <div className="flex items-center gap-3 mb-2">
                <img src={currentSong.thumbnail} alt={currentSong.title} className="w-10 h-10 rounded object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{currentSong.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{currentSong.artist}</p>
                </div>
              </div>
              <iframe
                key={currentSong.id}
                width="100%"
                height="60"
                src={`https://www.youtube.com/embed/${currentSong.id}?autoplay=1&controls=1`}
                allow="autoplay; encrypted-media"
                className="rounded"
              />
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
    </div>
  );
}
