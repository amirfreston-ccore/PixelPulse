import { Music, ThumbsDown } from "lucide-react";
import { Song } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface PlaylistCardProps {
  song: Song;
  isCurrentSong?: boolean;
  onVote: (songId: string) => void;
  votes: number;
  requiredVotes: number;
  hasVoted: boolean;
}

export function PlaylistCard({ song, isCurrentSong, onVote, votes, requiredVotes, hasVoted }: PlaylistCardProps) {
  return (
    <div className={`group relative bg-card border rounded-lg p-3 transition-all ${
      isCurrentSong ? 'border-primary bg-primary/5' : 'border-border'
    }`}>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
          {song.thumbnail ? (
            <img
              src={song.thumbnail}
              alt={song.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-accent">
              <Music className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate text-sm">{song.title}</h3>
          <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
          <p className="text-xs text-muted-foreground">{song.duration}</p>
        </div>

        {!isCurrentSong && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {votes}/{requiredVotes}
            </span>
            <Button
              size="sm"
              variant={hasVoted ? "destructive" : "outline"}
              onClick={() => onVote(song.id)}
              className="h-8 w-8 p-0"
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
