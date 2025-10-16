export function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4 md:px-6 py-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="animate-pulse" data-testid={`skeleton-card-${i}`}>
          <div className="aspect-square bg-muted rounded-xl mb-4" />
          <div className="space-y-2">
            <div className="h-5 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted/70 rounded w-1/2" />
            <div className="h-3 bg-muted/50 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
