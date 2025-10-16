import { Music } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4" data-testid="empty-state">
      <Music className="h-16 w-16 text-muted-foreground mb-4" aria-hidden="true" />
      <h2 className="text-2xl font-display font-semibold mb-2">Search for music</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Find your favorite songs from YouTube Music
      </p>
    </div>
  );
}
