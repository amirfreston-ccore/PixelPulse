import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchBar } from "@/components/SearchBar";
import { MusicCard } from "@/components/MusicCard";
import { AudioPlayer } from "@/components/AudioPlayer";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Song, SearchResult } from "@shared/schema";

export default function MusicPlayer() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const audioPlayerRef = useRef<{ togglePlayPause: () => void }>(null);

  const { data: searchResults, isLoading, error } = useQuery<SearchResult>({
    queryKey: [`/api/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length > 0,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.code === 'Space' && currentSong) {
        e.preventDefault();
        audioPlayerRef.current?.togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSong]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handlePlay = (song: Song) => {
    setCurrentSong(song);
  };

  const songs = searchResults?.songs || [];
  const currentSongIndex = songs.findIndex(s => s.id === currentSong?.id);

  const handleNext = () => {
    if (currentSongIndex < songs.length - 1) {
      setCurrentSong(songs[currentSongIndex + 1]);
    }
  };

  const handlePrevious = () => {
    if (currentSongIndex > 0) {
      setCurrentSong(songs[currentSongIndex - 1]);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <SearchBar onSearch={handleSearch} isLoading={isLoading} />
      
      <main className="max-w-7xl mx-auto">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 px-4" data-testid="error-state">
            <p className="text-destructive text-lg font-semibold mb-2">Search failed</p>
            <p className="text-muted-foreground text-center max-w-md">
              Unable to search for music. Please try again later.
            </p>
          </div>
        ) : songs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4 md:px-6 py-6">
            {songs.map((song) => (
              <MusicCard 
                key={song.id} 
                song={song} 
                onPlay={handlePlay}
                isPlaying={currentSong?.id === song.id}
              />
            ))}
          </div>
        ) : searchQuery ? (
          <div className="flex flex-col items-center justify-center py-20 px-4" data-testid="no-results-state">
            <p className="text-lg font-semibold mb-2">No results found</p>
            <p className="text-muted-foreground text-center max-w-md">
              Try searching with different keywords
            </p>
          </div>
        ) : (
          <EmptyState />
        )}
      </main>

      <AudioPlayer 
        ref={audioPlayerRef}
        currentSong={currentSong}
        onNext={currentSongIndex < songs.length - 1 ? handleNext : undefined}
        onPrevious={currentSongIndex > 0 ? handlePrevious : undefined}
      />
    </div>
  );
}
