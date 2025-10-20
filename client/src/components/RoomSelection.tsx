import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface Room {
  id: string;
  name: string;
  createdBy: string;
  listenerCount: number;
}

interface RoomSelectionProps {
  userName: string;
  userId: string;
  onRoomSelect: (roomId: string, isCreator: boolean) => void;
}

export function RoomSelection({ userName, userId, onRoomSelect }: RoomSelectionProps) {
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const { data: roomsData, refetch } = useQuery<{ rooms: Room[] }>({
    queryKey: ['/api/rooms'],
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  const rooms = roomsData?.rooms || [];

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim(), createdBy: userId, isPrivate })
      });

      const data = await response.json();
      if (data.room) {
        onRoomSelect(data.room.id, true);
      }
    } catch (error) {
      console.error('Failed to create room:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl">
        <h2 className="text-2xl font-bold mb-2">Welcome, {userName}!</h2>
        <p className="text-muted-foreground mb-6">Choose a room to join or create your own</p>

        {!showCreateRoom ? (
          <>
            <div className="space-y-3 mb-4">
              {rooms.length > 0 ? (
                rooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border hover:bg-accent/50 cursor-pointer"
                    onClick={() => onRoomSelect(room.id, room.createdBy === userId)}
                  >
                    <div>
                      <p className="font-medium">{room.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {room.listenerCount} {room.listenerCount === 1 ? 'listener' : 'listeners'}
                      </p>
                    </div>
                    <div className="text-sm text-primary">
                      {room.createdBy === userId ? 'Your room' : 'Join'}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No rooms available</p>
              )}
            </div>

            <button
              onClick={() => setShowCreateRoom(true)}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Create New Room
            </button>
          </>
        ) : (
          <form onSubmit={handleCreateRoom}>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room name..."
              className="w-full px-4 py-2 bg-background border border-border rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              maxLength={30}
            />
            <label className="flex items-center gap-2 mb-4 text-sm">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="rounded"
              />
              Private room (hidden from public list)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreateRoom(false)}
                className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
