import { Play, Music } from "lucide-react";
import { Song } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface MusicCardProps {
  song: Song;
  onPlay: (song: Song) => void;
  isPlaying?: boolean;
}

export function MusicCard({ song, onPlay, isPlaying }: MusicCardProps) {
  return (
    <div 
      className="group relative bg-card border border-card-border rounded-xl overflow-hidden transition-all duration-200 hover:scale-105 hover-elevate"
      data-testid={`card-song-${song.id}`}
    >
      <div className="aspect-square relative bg-muted">
        {song.thumbnail ? (
          <img 
            src={song.thumbnail} 
            alt={`${song.title} artwork`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-accent">
            <Music className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        
        <Button
          size="icon"
          variant="default"
          onClick={() => onPlay(song)}
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full transition-all duration-300 ${
            isPlaying 
              ? 'opacity-100 scale-100' 
              : 'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-110'
          }`}
          data-testid={`button-play-${song.id}`}
          aria-label={`Play ${song.title}`}
        >
          <Play className="h-5 w-5 fill-current" />
        </Button>
      </div>
      
      <div className="p-4 space-y-1">
        <h3 className="font-display text-lg font-semibold truncate" data-testid={`text-title-${song.id}`}>
          {song.title}
        </h3>
        <p className="text-sm text-muted-foreground truncate" data-testid={`text-artist-${song.id}`}>
          {song.artist}
        </p>
        {song.duration && (
          <p className="text-xs text-muted-foreground" data-testid={`text-duration-${song.id}`}>
            {song.duration}
          </p>
        )}
      </div>
    </div>
  );
}
