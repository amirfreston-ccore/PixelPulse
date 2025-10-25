import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchBar } from "@/components/SearchBar";
import { MusicCard } from "@/components/MusicCard";
import { AudioPlayer } from "@/components/AudioPlayer";
import { PlaylistCard } from "@/components/PlaylistCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { RoomSelection } from "@/components/RoomSelection";
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
  const [listeners, setListeners] = useState<string[]>([]);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(true);
  const [showRoomSelection, setShowRoomSelection] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [songVotes, setSongVotes] = useState<Record<string, { votes: number; required: number; hasVoted: boolean }>>({});
  const socketRef = useRef<Socket | null>(null);

  const currentSong = playlist[currentSongIndex] || null;

  const { data: searchResults, isLoading, error } = useQuery<SearchResult>({
    queryKey: [`/api/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.length > 0,
  });

  // Check for stored user data on mount
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    const storedUserName = localStorage.getItem('userName');
    
    if (storedUserId && storedUserName) {
      setUserId(storedUserId);
      setUserName(storedUserName);
      setShowNamePrompt(false);
      
      // Auto-join public room
      fetch('/api/rooms')
        .then(res => res.json())
        .then(data => {
          const publicRoom = data.rooms.find((room: any) => room.name === "Public Room");
          if (publicRoom) {
            setCurrentRoomId(publicRoom.id);
            setShowRoomSelection(false);
          } else {
            setShowRoomSelection(true);
          }
        })
        .catch(() => setShowRoomSelection(true));
    }
  }, []);

  useEffect(() => {
    if (currentRoomId) {
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
        setIsCreator(data.isCreator);

        // Calculate accurate position using server time
        if (data.currentPosition !== undefined) {
          setCurrentPosition(data.currentPosition);
        } else if (data.isPlaying && data.playbackStartTime) {
          const serverElapsed = (data.serverTime - data.playbackStartTime) / 1000;
          setCurrentPosition(data.pausedAt + serverElapsed);
        } else {
          setCurrentPosition(data.pausedAt || 0);
        }
      });

      socket.on('listenersUpdate', (data) => {
        console.log('Listeners update:', data.listeners);
        setListeners(data.listeners);
      });

      socket.on('voteUpdate', (data) => {
        setSongVotes(prev => ({
          ...prev,
          [data.songId]: {
            votes: data.votes,
            required: data.required,
            hasVoted: data.hasVoted
          }
        }));
      });

      // Join the room
      socket.emit('joinRoom', {
        roomId: currentRoomId,
        userName,
        userId
      });

      return () => socket.disconnect();
    }
  }, [currentRoomId, userName, userId]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleVoteSong = (songId: string) => {
    if (!currentRoomId || !socketRef.current) return;
    
    socketRef.current.emit('voteSong', {
      songId,
      roomId: currentRoomId
    });
  };

  const handleAddToPlaylist = async (song: Song) => {
    if (!currentRoomId || !socketRef.current) return;

    socketRef.current.emit('addToPlaylist', {
      song: {
        ...song,
        addedBy: userName
      },
      roomId: currentRoomId
    });
  };

  const songs = searchResults?.songs || [];

  const handleStartSession = async () => {
    setHasUserInteracted(true);
    // Play a silent audio to unlock autoplay with proper volume
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      audio.volume = 0.01;
      await audio.play();
      console.log('Audio context unlocked successfully');
    } catch (e) {
      console.log('Audio unlock failed:', e);
    }
  };

  const handleJoinWithName = async (name: string) => {
    if (name.trim()) {
      try {
        // Create or get user from database
        const response = await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name.trim() })
        });

        const data = await response.json();

        if (data.user) {
          setUserName(data.user.username);
          setUserId(data.user.id);
          setShowNamePrompt(false);

          // Store user data in localStorage for persistence
          localStorage.setItem('userId', data.user.id);
          localStorage.setItem('userName', data.user.username);

          // Auto-join public room
          const roomsResponse = await fetch('/api/rooms');
          const roomsData = await roomsResponse.json();
          const publicRoom = roomsData.rooms.find((room: any) => room.name === "Public Room");
          
          if (publicRoom) {
            setCurrentRoomId(publicRoom.id);
            setShowRoomSelection(false);
          } else {
            setShowRoomSelection(true);
          }
        }
      } catch (error) {
        console.error('Failed to create/get user:', error);
      }
    }
  };

  const handleRoomSelect = (roomId: string, roomIsCreator: boolean) => {
    console.log('Room selected:', { roomId, roomIsCreator, userId });
    setCurrentRoomId(roomId);
    setIsCreator(roomIsCreator);
    setShowRoomSelection(false);
  };

  // Auto-start session when component mounts
  useEffect(() => {
    handleStartSession();
  }, []);

  // Auto-start session when a song is playing
  useEffect(() => {
    if (currentSong && isPlaying && !hasUserInteracted) {
      handleStartSession();
    }
  }, [currentSong, isPlaying, hasUserInteracted]);

  if (showNamePrompt) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h2 className="text-2xl font-bold mb-2">Join PixelPulse</h2>
          <p className="text-muted-foreground mb-4">Enter your name to get started</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem('userName') as HTMLInputElement;
            handleJoinWithName(input.value);
          }}>
            <input
              type="text"
              name="userName"
              placeholder="Your name..."
              className="w-full px-4 py-2 bg-background border border-border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              maxLength={20}
            />
            <button
              type="submit"
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (showRoomSelection) {
    return (
      <RoomSelection
        userName={userName}
        userId={userId}
        onRoomSelect={handleRoomSelect}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">

      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          <div className="text-sm text-muted-foreground">
            {isCreator ? '🎮 Private Room • You control the player' : '🌍 Public Room • Everyone can add songs'}
          </div>
        </div>
        <button
          onClick={() => setShowRoomSelection(true)}
          className="px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
        >
          Switch Room
        </button>
      </div>

      <div className="flex h-[calc(100vh-140px)]">
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
          {listeners.length > 0 && (
            <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                {listeners.length} {listeners.length === 1 ? 'person is' : 'people are'} listening
              </p>
              <div className="flex flex-wrap gap-1">
                {listeners.map((listener, index) => (
                  <span key={index} className="px-2 py-1 bg-primary/20 text-xs rounded-full">
                    {listener}
                  </span>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-xl font-semibold mb-4">
            Playlist ({playlist.length})
            <span className="text-sm font-normal text-muted-foreground ml-2">
              • Vote to remove songs
            </span>
          </h2>

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
            {playlist.map((song, index) => {
              const isCurrentSong = currentSong?.id === song.id;
              const voteData = songVotes[song.id] || { votes: 0, required: 1, hasVoted: false };
              
              return (
                <PlaylistCard
                  key={`${song.id}-${index}`}
                  song={song}
                  isCurrentSong={isCurrentSong}
                  onVote={handleVoteSong}
                  votes={voteData.votes}
                  requiredVotes={voteData.required}
                  hasVoted={voteData.hasVoted}
                />
              );
            })}
          </div>
        </div>
      </div>

      <AudioPlayer
        currentSong={currentSong}
        playlist={playlist}
        isPlaying={isPlaying}
        currentPosition={currentPosition}
        serverTime={serverTime}
        socket={socketRef.current}
        roomId={currentRoomId}
        isPublicRoom={!isCreator}
      />
    </div>
  );
}
