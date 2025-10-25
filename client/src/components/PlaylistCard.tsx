import { Music, ThumbsDown, GripVertical } from "lucide-react";
import { Song } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface PlaylistCardProps {
  song: Song;
  isCurrentSong?: boolean;
  onVote: (songId: string) => void;
  votes: number;
  requiredVotes: number;
  hasVoted: boolean;
  canReorder?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  index: number;
}

export function PlaylistCard({ 
  song, 
  isCurrentSong, 
  onVote, 
  votes, 
  requiredVotes, 
  hasVoted, 
  canReorder = false,
  onReorder,
  index
}: PlaylistCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (!canReorder) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canReorder) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canReorder || !onReorder) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (fromIndex !== index && !isNaN(fromIndex)) {
      console.log('Drag drop:', { fromIndex, toIndex: index });
      onReorder(fromIndex, index);
    }
  };

  return (
    <div 
      className={`group relative bg-card border rounded-lg p-3 transition-all ${
        isCurrentSong ? 'border-primary bg-primary/5' : 'border-border'
      } ${isDragging ? 'opacity-50 scale-95' : ''} ${
        isDragOver ? 'border-primary border-2 bg-primary/10' : ''
      } ${canReorder ? 'hover:shadow-md' : ''}`}
      draggable={canReorder}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-3">
        {canReorder && (
          <div className="flex-shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        
        <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
          {song.thumbnail ? (
            <img
              src={song.thumbnail}
              alt={song.title}
              className="w-full h-full object-cover"
              draggable={false}
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
