import { Search } from "lucide-react";
import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  return (
    <div className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <Search 
              className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" 
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for songs, artists, albums..."
              className="w-full h-14 md:h-16 pl-12 pr-4 bg-card border border-border rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-200"
              data-testid="input-search"
              disabled={isLoading}
              aria-label="Search for music"
            />
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
