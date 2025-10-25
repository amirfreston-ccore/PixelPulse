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
import { useToast } from "@/hooks/use-toast";

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
  const [isShuffled, setIsShuffled] = useState(false);
  const [isLooped, setIsLooped] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; userId: string; userName: string; message: string; timestamp: number }>>([]);
  const [showChat, setShowChat] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [preserveAudioState, setPreserveAudioState] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const { toast } = useToast();

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
          currentSong: data.playlist[data.currentSongIndex]?.title,
          preserveAudioState: data.preserveAudioState
        });

        // Only preserve audio state if the current song is actually changing
        const newCurrentSong = data.playlist[data.currentSongIndex];
        const currentSongChanged = currentSong?.id !== newCurrentSong?.id;
        
        // Set preserveAudioState ONLY for song changes, not playlist reordering
        if (data.preserveAudioState && currentSongChanged) {
          console.log('Setting preserveAudioState to true - song changed');
          setPreserveAudioState(true);
        }

        setPlaylist(data.playlist);
        setCurrentSongIndex(data.currentSongIndex);
        setIsPlaying(data.isPlaying);
        setServerTime(data.serverTime);
        setIsCreator(data.isCreator);
        setIsShuffled(data.isShuffled || false);
        setIsLooped(data.isLooped || false);

        // Reset preserveAudioState after a short delay to allow normal audio control
        if (data.preserveAudioState && currentSongChanged) {
          setTimeout(() => {
            console.log('Resetting preserveAudioState to false');
            setPreserveAudioState(false);
          }, 100);
        }

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

      socket.on('newMessage', (message) => {
        setChatMessages(prev => [...prev, message]);
        
        // Show toast if chat is closed and message is from another user
        if (!showChat && message.userId !== userId) {
          setUnreadCount(prev => prev + 1);
          toast({
            title: `💬 ${message.userName}`,
            description: message.message.length > 50 ? message.message.substring(0, 50) + "..." : message.message,
          });
        }
      });

      socket.on('chatHistory', (messages) => {
        setChatMessages(messages);
      });

      socket.on('error', (data) => {
        console.error('Socket error:', data.message);
        // You could show a toast notification here
      });

      // Join the room
      socket.emit('joinRoom', {
        roomId: currentRoomId,
        userName,
        userId
      });

      // Request chat history
      socket.emit('getChatHistory', currentRoomId);

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

  const handleToggleShuffle = () => {
    if (!currentRoomId || !socketRef.current) return;
    socketRef.current.emit('toggleShuffle', currentRoomId);
  };

  const handleToggleLoop = () => {
    if (!currentRoomId || !socketRef.current) return;
    socketRef.current.emit('toggleLoop', currentRoomId);
  };

  const handleReorderSongs = (fromIndex: number, toIndex: number) => {
    if (!currentRoomId || !socketRef.current) return;
    console.log('Reordering songs:', { fromIndex, toIndex, roomId: currentRoomId });
    socketRef.current.emit('reorderSongs', {
      roomId: currentRoomId,
      fromIndex,
      toIndex
    });
  };

  const handleSendMessage = () => {
    if (!currentRoomId || !socketRef.current || !newMessage.trim()) return;
    
    socketRef.current.emit('sendMessage', {
      roomId: currentRoomId,
      message: newMessage.trim()
    });
    
    setNewMessage("");
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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-4 border-b gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1">
          <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          <div className="text-sm text-muted-foreground">
            {isCreator ? '🎮 Private Room • You control the player' : '🌍 Public Room • Everyone can add songs'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleShuffle}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              isShuffled 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            🔀 Shuffle
          </button>
          <button
            onClick={handleToggleLoop}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              isLooped 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            🔁 Loop
          </button>
          <button
            onClick={() => {
              setShowChat(!showChat);
              if (!showChat) {
                setUnreadCount(0);
              }
            }}
            className="px-3 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors relative"
          >
            💬 Chat
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowRoomSelection(true)}
            className="px-3 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
          >
            Switch Room
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)]">
        <div className="flex-1 p-4 overflow-y-auto">
          <h2 className="text-xl font-semibold mb-4">Search Results</h2>
          {isLoading ? (
            <LoadingState />
          ) : songs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
              {songs.map((song) => (
                <div key={song.id} className="flex items-center gap-3 p-3 bg-card rounded-lg border hover:bg-accent/50">
                  <img src={song.thumbnail} alt={song.title} className="w-12 h-12 rounded object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
                  </div>
                  <button 
                    onClick={() => handleAddToPlaylist(song)}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm flex-shrink-0"
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

        <div className={`${showChat ? 'lg:w-96' : 'lg:w-80'} border-l bg-card/50 flex flex-col transition-all duration-300`}>
          {showChat ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">Chat</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="bg-muted/50 rounded-lg p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{msg.userName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{msg.message}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm"
                    maxLength={500}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 flex flex-col h-full">
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
                      canReorder={true}
                      onReorder={handleReorderSongs}
                      index={index}
                    />
                  );
                })}
              </div>
            </div>
          )}
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
        preserveAudioState={preserveAudioState}
      />
    </div>
  );
}
