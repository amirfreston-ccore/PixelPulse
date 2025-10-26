import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import play from "play-dl";
import ytdl from "@distube/ytdl-core";
import { z } from "zod";
import { storage } from "./storage";

const searchQuerySchema = z.object({
  q: z.string().min(1),
});

const agent = ytdl.createAgent();

// Room-based playlist state
const roomStates = new Map<string, {
  playlist: any[];
  currentSongIndex: number;
  isPlaying: boolean;
  playbackStartTime: number;
  pausedAt: number;
  createdBy: string;
  isShuffled: boolean;
  isLooped: boolean;
  originalPlaylist: any[];
}>();

// Track active listeners per room
const roomListeners = new Map<string, Map<string, { name: string; socketId: string; userId: string }>>();

// Track votes per song per room
const songVotes = new Map<string, Map<string, Set<string>>>();

// Track chat messages per room
const roomMessages = new Map<string, Array<{ id: string; userId: string; userName: string; message: string; timestamp: number }>>();

export async function registerRoutes(app: Express): Promise<Server> {

  // Initialize default public room
  const initializePublicRoom = async () => {
    try {
      let publicRoom = await storage.getRoomByName("Public Room");
      if (!publicRoom) {
        publicRoom = await storage.createRoom({ name: "Public Room", createdBy: "system" });
      }

      // Initialize room state
      if (!roomStates.has(publicRoom.id)) {
        roomStates.set(publicRoom.id, {
          playlist: [],
          currentSongIndex: 0,
          isPlaying: false,
          playbackStartTime: 0,
          pausedAt: 0,
          createdBy: "system",
          isShuffled: false,
          isLooped: false,
          originalPlaylist: []
        });
        roomListeners.set(publicRoom.id, new Map());
        songVotes.set(publicRoom.id, new Map());
        roomMessages.set(publicRoom.id, []);
      }

      return publicRoom.id;
    } catch (error) {
      console.error("Failed to initialize public room:", error);
      return null;
    }
  };

  const publicRoomId = await initializePublicRoom();

  // Get or create user by username
  app.post("/api/user", async (req, res) => {
    try {
      const { username } = req.body;

      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: 'Username is required' });
      }

      const trimmedUsername = username.trim().substring(0, 20);

      // Check if user already exists
      let user = await storage.getUserByUsername(trimmedUsername);

      // If not, create new user
      if (!user) {
        user = await storage.createUser({ username: trimmedUsername });
      }

      res.json({ user });
    } catch (error) {
      console.error("User creation error:", error);
      res.status(500).json({ error: "Failed to create/get user" });
    }
  });

  // Create room
  app.post("/api/rooms", async (req, res) => {
    try {
      const { name, createdBy, isPrivate = false } = req.body;

      if (!name || !createdBy) {
        return res.status(400).json({ error: 'Room name and creator are required' });
      }

      // Check if room already exists
      const existingRoom = await storage.getRoomByName(name);
      if (existingRoom) {
        return res.status(400).json({ error: 'Room name already exists' });
      }

      const room = await storage.createRoom({ name, createdBy, isPrivate });

      // Initialize room state
      roomStates.set(room.id, {
        playlist: [],
        currentSongIndex: 0,
        isPlaying: false,
        playbackStartTime: 0,
        pausedAt: 0,
        createdBy,
        isShuffled: false,
        isLooped: false,
        originalPlaylist: []
      });

      roomListeners.set(room.id, new Map());
      songVotes.set(room.id, new Map());
      roomMessages.set(room.id, []);

      res.json({ room });
    } catch (error) {
      console.error("Room creation error:", error);
      res.status(500).json({ error: "Failed to create room" });
    }
  });

  // Get all rooms (only public ones for non-creators)
  app.get("/api/rooms", async (req, res) => {
    try {
      const allRooms = await storage.getAllRooms();
      const publicRooms = allRooms.filter(room => !room.isPrivate);
      const roomsWithListeners = publicRooms.map(room => ({
        ...room,
        listenerCount: roomListeners.get(room.id)?.size || 0
      }));
      res.json({ rooms: roomsWithListeners });
    } catch (error) {
      console.error("Get rooms error:", error);
      res.status(500).json({ error: "Failed to get rooms" });
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const { q } = searchQuerySchema.parse(req.query);

      const searchResults = await play.search(q, { limit: 12, source: { youtube: "video" } });

      const songs = searchResults
        .slice(0, 12)
        .map((video: any) => {
          const videoId = video.id;

          return {
            id: videoId,
            title: video.title || "Unknown Title",
            artist: video.channel?.name || "Unknown Artist",
            duration: video.durationRaw || "0:00",
            thumbnail: video.thumbnails?.[0]?.url || "",
            audioUrl: `/api/stream/${videoId}`,
          };
        });

      res.json({
        songs,
        query: q,
      });
    } catch (error) {
      console.error("Search error:", error);
      res.status(400).json({
        error: "Failed to search for music",
        songs: [],
        query: req.query.q || ""
      });
    }
  });

  // Removed audio endpoint - using YouTube iframe directly

  app.get("/api/stream/:videoId", async (req, res) => {
    try {
      const { videoId } = req.params;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const info = await ytdl.getInfo(videoUrl, {
        agent,
      });

      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

      if (audioFormats.length === 0) {
        res.status(404).json({ error: 'No audio format found' });
        return;
      }

      const audioStream = ytdl(videoUrl, {
        quality: 'highestaudio',
        filter: 'audioonly',
        agent,
      });

      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      audioStream.pipe(res);

      audioStream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Streaming failed' });
        }
      });

      req.on('close', () => {
        audioStream.destroy();
      });

    } catch (error) {
      console.error("Stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream audio" });
      }
    }
  });

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected');
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;

    // Handle joining a room
    socket.on('joinRoom', (data: { roomId: string; userName: string; userId: string }) => {
      const { roomId, userName, userId } = data;
      currentRoomId = roomId;
      currentUserId = userId;

      // Leave previous room if any
      if (socket.rooms.size > 1) {
        socket.rooms.forEach(room => {
          if (room !== socket.id) {
            socket.leave(room);
          }
        });
      }

      socket.join(roomId);

      // Add to room listeners
      if (!roomListeners.has(roomId)) {
        roomListeners.set(roomId, new Map());
      }
      roomListeners.get(roomId)!.set(socket.id, { name: userName, socketId: socket.id, userId });

      const roomState = roomStates.get(roomId);
      if (roomState) {
        // Calculate current position
        let currentPosition = roomState.pausedAt;
        if (roomState.isPlaying && roomState.playbackStartTime > 0) {
          const elapsedMs = Date.now() - roomState.playbackStartTime;
          currentPosition = roomState.pausedAt + (elapsedMs / 1000);
        }

        // Send current state to user
        socket.emit('playlistUpdate', {
          ...roomState,
          currentPosition,
          serverTime: Date.now(),
          isCreator: userId === roomState.createdBy
        });
      }

      // Send listeners update to room
      const listeners = Array.from(roomListeners.get(roomId)!.values()).map(l => l.name);
      io.to(roomId).emit('listenersUpdate', { listeners });

      console.log(`${userName} joined room ${roomId}. Total listeners: ${listeners.length}`);
    });

    // Add song to playlist (anyone can add)
    socket.on('addToPlaylist', (data: { song: any; roomId: string }) => {
      const { song, roomId } = data;
      const roomState = roomStates.get(roomId);

      if (!roomState) return;

      // Check for duplicates
      const isDuplicate = roomState.playlist.some(existingSong => existingSong.id === song.id);
      if (isDuplicate) {
        socket.emit('error', { message: 'Song already in playlist' });
        return;
      }

      roomState.playlist.push(song);
      roomState.originalPlaylist.push(song);

      // Initialize votes for this song
      if (!songVotes.has(roomId)) {
        songVotes.set(roomId, new Map());
      }
      songVotes.get(roomId)!.set(song.id, new Set());

      // If no song is playing, start the first song
      if (roomState.playlist.length === 1 && !roomState.isPlaying) {
        roomState.currentSongIndex = 0;
        roomState.isPlaying = true;
        roomState.playbackStartTime = Date.now();
        roomState.pausedAt = 0;
      }

      // Send update to all listeners with their specific isCreator status
      const listeners = roomListeners.get(roomId);
      if (listeners) {
        listeners.forEach((listener) => {
          io.to(listener.socketId).emit('playlistUpdate', {
            ...roomState,
            serverTime: Date.now(),
            isCreator: listener.userId === roomState.createdBy,
            // Prevent audio interruption during playlist modifications
            preserveAudioState: true
          });
        });
      }
    });

    // Handle voting to remove song
    socket.on('voteSong', (data: { songId: string; roomId: string }) => {
      const { songId, roomId } = data;
      if (!currentUserId || !roomListeners.has(roomId)) return;

      const roomVotes = songVotes.get(roomId);
      if (!roomVotes || !roomVotes.has(songId)) return;

      const votes = roomVotes.get(songId)!;
      const totalListeners = roomListeners.get(roomId)!.size;
      const requiredVotes = Math.ceil(totalListeners / 2);

      // Toggle vote
      if (votes.has(currentUserId)) {
        votes.delete(currentUserId);
      } else {
        votes.add(currentUserId);
      }

      // Check if song should be removed
      if (votes.size >= requiredVotes) {
        const roomState = roomStates.get(roomId);
        if (roomState) {
          const songIndex = roomState.playlist.findIndex(s => s.id === songId);
          if (songIndex !== -1) {
            roomState.playlist.splice(songIndex, 1);
            roomVotes.delete(songId);

            // Adjust current index if needed
            if (songIndex <= roomState.currentSongIndex && roomState.currentSongIndex > 0) {
              roomState.currentSongIndex--;
            }

            // Send update to all listeners with their specific isCreator status
            const listeners = roomListeners.get(roomId);
            if (listeners) {
              listeners.forEach((listener) => {
                io.to(listener.socketId).emit('playlistUpdate', {
                  ...roomState,
                  serverTime: Date.now(),
                  isCreator: listener.userId === roomState.createdBy
                });
              });
            }
          }
        }
      }

      // Send vote update
      io.to(roomId).emit('voteUpdate', {
        songId,
        votes: votes.size,
        required: requiredVotes,
        hasVoted: votes.has(currentUserId)
      });
    });

    // Handle play/pause (only for private room creators)
    socket.on('togglePlayPause', (roomId: string) => {
      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) return;

      // Only allow creator to control private rooms
      if (roomState.createdBy !== currentUserId || roomState.createdBy === "system") return;

      roomState.isPlaying = !roomState.isPlaying;

      if (roomState.isPlaying) {
        roomState.playbackStartTime = Date.now();
      } else {
        // Calculate current position when pausing
        const elapsedMs = Date.now() - roomState.playbackStartTime;
        roomState.pausedAt = roomState.pausedAt + (elapsedMs / 1000);
      }

      // Send update to all listeners with their specific isCreator status
      const listeners = roomListeners.get(roomId);
      if (listeners) {
        listeners.forEach((listener) => {
          io.to(listener.socketId).emit('playlistUpdate', {
            ...roomState,
            serverTime: Date.now(),
            isCreator: listener.userId === roomState.createdBy
          });
        });
      }
    });

    // Handle seek (only for private room creators)
    // socket.on('seek', (data: { position: number; roomId: string }) => {
    //   const { position, roomId } = data;
    //   const roomState = roomStates.get(roomId);
    //   if (!roomState || !currentUserId) return;

    //   // Only allow creator to control private rooms
    //   if (roomState.createdBy !== currentUserId || roomState.createdBy === "system") return;

    //   roomState.pausedAt = position;
    //   roomState.playbackStartTime = Date.now();

    //   // Send update to all listeners with their specific isCreator status
    //   const listeners = roomListeners.get(roomId);
    //   if (listeners) {
    //     listeners.forEach((listener) => {
    //       io.to(listener.socketId).emit('playlistUpdate', {
    //         ...roomState,
    //         currentPosition: position,
    //         serverTime: Date.now(),
    //         isCreator: listener.userId === roomState.createdBy
    //       });
    //     });
    //   }
    // });

    socket.on('seek', (data: { position: number; roomId: string; isPlaying: boolean }) => {
      const { position, roomId, isPlaying } = data;
      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) return;

      // Only allow creator to control private rooms
      if (roomState.createdBy !== currentUserId || roomState.createdBy === "system") return;

      roomState.isPlaying = isPlaying;
      roomState.pausedAt = position;
      if (isPlaying) {
        roomState.playbackStartTime = Date.now();
      }

      // Send update to all listeners with their specific isCreator status
      const listeners = roomListeners.get(roomId);
      if (listeners) {
        listeners.forEach((listener) => {
          io.to(listener.socketId).emit('playlistUpdate', {
            ...roomState,
            currentPosition: position,
            isPlaying,
            serverTime: Date.now(),
            isCreator: listener.userId === roomState.createdBy,
          });
        });
      }
    });

    // Handle shuffle toggle
    socket.on('toggleShuffle', (roomId: string) => {
      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) return;

      // Only allow creator to control private rooms, but allow anyone in public rooms
      if (roomState.createdBy !== "system" && roomState.createdBy !== currentUserId) return;

      roomState.isShuffled = !roomState.isShuffled;

      if (roomState.isShuffled) {
        // Shuffle the playlist
        const currentSong = roomState.playlist[roomState.currentSongIndex];
        const shuffled = [...roomState.playlist];

        // Fisher-Yates shuffle
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        roomState.playlist = shuffled;
        roomState.currentSongIndex = shuffled.findIndex(song => song.id === currentSong?.id) || 0;
      } else {
        // Restore original order
        const currentSong = roomState.playlist[roomState.currentSongIndex];
        roomState.playlist = [...roomState.originalPlaylist];
        roomState.currentSongIndex = roomState.playlist.findIndex(song => song.id === currentSong?.id) || 0;
      }

      // Send update to all listeners
      const listeners = roomListeners.get(roomId);
      if (listeners) {
        listeners.forEach((listener) => {
          io.to(listener.socketId).emit('playlistUpdate', {
            ...roomState,
            serverTime: Date.now(),
            isCreator: listener.userId === roomState.createdBy
          });
        });
      }
    });

    // Handle loop toggle
    socket.on('toggleLoop', (roomId: string) => {
      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) return;

      // Only allow creator to control private rooms, but allow anyone in public rooms
      if (roomState.createdBy !== "system" && roomState.createdBy !== currentUserId) return;

      roomState.isLooped = !roomState.isLooped;

      // Send update to all listeners
      const listeners = roomListeners.get(roomId);
      if (listeners) {
        listeners.forEach((listener) => {
          io.to(listener.socketId).emit('playlistUpdate', {
            ...roomState,
            serverTime: Date.now(),
            isCreator: listener.userId === roomState.createdBy
          });
        });
      }
    });

    // Handle song reordering
    socket.on('reorderSongs', (data: { roomId: string; fromIndex: number; toIndex: number }) => {
      const { roomId, fromIndex, toIndex } = data;
      console.log('Server reorder request:', { roomId, fromIndex, toIndex });

      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) {
        console.log('Reorder failed: no room state or user ID');
        return;
      }

      // Only allow creator to control private rooms, but allow anyone in public rooms
      if (roomState.createdBy !== "system" && roomState.createdBy !== currentUserId) {
        console.log('Reorder failed: permission denied');
        return;
      }

      console.log('Before reorder:', roomState.playlist.map(s => s.title));

      const playlist = [...roomState.playlist];

      // Simple reorder logic
      if (fromIndex >= 0 && fromIndex < playlist.length && toIndex >= 0 && toIndex < playlist.length) {
        const [movedSong] = playlist.splice(fromIndex, 1);
        playlist.splice(toIndex, 0, movedSong);

        roomState.playlist = playlist;

        // Update original playlist too
        roomState.originalPlaylist = [...playlist];

        // Adjust current song index
        if (roomState.currentSongIndex === fromIndex) {
          roomState.currentSongIndex = toIndex;
        } else if (fromIndex < roomState.currentSongIndex && toIndex >= roomState.currentSongIndex) {
          roomState.currentSongIndex--;
        } else if (fromIndex > roomState.currentSongIndex && toIndex <= roomState.currentSongIndex) {
          roomState.currentSongIndex++;
        }

        console.log('After reorder:', roomState.playlist.map(s => s.title));

        // Send update to all listeners
        const listeners = roomListeners.get(roomId);
        if (listeners) {
          listeners.forEach((listener) => {
            io.to(listener.socketId).emit('playlistUpdate', {
              ...roomState,
              serverTime: Date.now(),
              isCreator: listener.userId === roomState.createdBy,
              // Prevent audio interruption during reordering
              preserveAudioState: true
            });
          });
        }
      } else {
        console.log('Reorder failed: invalid indices');
      }
    });

    // Handle chat messages
    socket.on('sendMessage', (data: { roomId: string; message: string }) => {
      const { roomId, message } = data;
      if (!currentUserId || !currentRoomId || !message.trim()) return;

      const listener = roomListeners.get(roomId)?.get(socket.id);
      if (!listener) return;

      const chatMessage = {
        id: Date.now().toString(),
        userId: currentUserId,
        userName: listener.name,
        message: message.trim().substring(0, 500), // Limit message length
        timestamp: Date.now()
      };

      // Add to room messages
      if (!roomMessages.has(roomId)) {
        roomMessages.set(roomId, []);
      }
      const messages = roomMessages.get(roomId)!;
      messages.push(chatMessage);

      // Keep only last 100 messages
      if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
      }

      // Send to all listeners in the room
      io.to(roomId).emit('newMessage', chatMessage);
    });

    // Send chat history when user joins
    socket.on('getChatHistory', (roomId: string) => {
      const messages = roomMessages.get(roomId) || [];
      socket.emit('chatHistory', messages);
    });

    // Handle next song (only for private room creators)
    socket.on('nextSong', (roomId: string) => {
      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) return;

      // Only allow creator to control private rooms
      if (roomState.createdBy !== currentUserId || roomState.createdBy === "system") return;

      if (roomState.playlist.length > 0) {
        if (roomState.isLooped && roomState.currentSongIndex === roomState.playlist.length - 1) {
          roomState.currentSongIndex = 0; // Loop back to first song
        } else {
          roomState.currentSongIndex = (roomState.currentSongIndex + 1) % roomState.playlist.length;
        }
        roomState.pausedAt = 0;
        roomState.playbackStartTime = Date.now();

        // Send update to all listeners with their specific isCreator status
        const listeners = roomListeners.get(roomId);
        if (listeners) {
          listeners.forEach((listener) => {
            io.to(listener.socketId).emit('playlistUpdate', {
              ...roomState,
              serverTime: Date.now(),
              isCreator: listener.userId === roomState.createdBy
            });
          });
        }
      }
    });

    // Handle previous song (only for private room creators)
    socket.on('previousSong', (roomId: string) => {
      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) return;

      // Only allow creator to control private rooms
      if (roomState.createdBy !== currentUserId || roomState.createdBy === "system") return;

      if (roomState.playlist.length > 0) {
        roomState.currentSongIndex = roomState.currentSongIndex > 0
          ? roomState.currentSongIndex - 1
          : roomState.playlist.length - 1;
        roomState.pausedAt = 0;
        roomState.playbackStartTime = Date.now();

        // Send update to all listeners with their specific isCreator status
        const listeners = roomListeners.get(roomId);
        if (listeners) {
          listeners.forEach((listener) => {
            io.to(listener.socketId).emit('playlistUpdate', {
              ...roomState,
              serverTime: Date.now(),
              isCreator: listener.userId === roomState.createdBy
            });
          });
        }
      }
    });

    socket.on('disconnect', () => {
      if (currentRoomId && roomListeners.has(currentRoomId)) {
        const roomListener = roomListeners.get(currentRoomId)!;
        const listener = roomListener.get(socket.id);

        if (listener) {
          console.log(`${listener.name} disconnected from room ${currentRoomId}`);
          
          // Remove user's messages from chat
          if (roomMessages.has(currentRoomId)) {
            const messages = roomMessages.get(currentRoomId)!;
            const filteredMessages = messages.filter(msg => msg.userId !== listener.userId);
            roomMessages.set(currentRoomId, filteredMessages);
            
            // Notify remaining users about message removal
            io.to(currentRoomId).emit('messagesRemoved', { userId: listener.userId });
          }
          
          roomListener.delete(socket.id);

          // Send updated listeners to room
          const listeners = Array.from(roomListener.values()).map(l => l.name);
          io.to(currentRoomId).emit('listenersUpdate', { listeners });

          // Auto-delete room if empty and not the public room
          const roomState = roomStates.get(currentRoomId);
          if (roomListener.size === 0 && roomState && roomState.createdBy !== "system") {
            console.log(`Deleting empty room: ${currentRoomId}`);
            roomStates.delete(currentRoomId);
            roomListeners.delete(currentRoomId);
            songVotes.delete(currentRoomId);
            roomMessages.delete(currentRoomId);

            // Optionally delete from database
            storage.deleteRoom(currentRoomId).catch(err =>
              console.error('Failed to delete room from database:', err)
            );
          }
        }
      }
    });
  });

  // Auto-advance songs only for public rooms (system-created)
  setInterval(() => {
    roomStates.forEach((roomState, roomId) => {
      // Only auto-advance for public rooms (created by "system")
      if (roomState.createdBy !== "system") return;

      if (roomState.isPlaying && roomState.playlist.length > 0 && roomState.playlist[roomState.currentSongIndex]) {
        const currentSong = roomState.playlist[roomState.currentSongIndex];
        const durationParts = currentSong.duration?.split(':') || ['3', '0'];
        const durationSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1] || '0');
        const elapsedMs = Date.now() - roomState.playbackStartTime;
        const currentPosition = roomState.pausedAt + (elapsedMs / 1000);

        if (currentPosition >= durationSeconds) {
          // Auto-advance to next song (always loop for public rooms)
          roomState.currentSongIndex = (roomState.currentSongIndex + 1) % roomState.playlist.length;
          roomState.pausedAt = 0;
          roomState.playbackStartTime = Date.now();

          // Only send update when song changes
          const listeners = roomListeners.get(roomId);
          if (listeners) {
            listeners.forEach((listener) => {
              io.to(listener.socketId).emit('playlistUpdate', {
                ...roomState,
                currentPosition: 0,
                serverTime: Date.now(),
                isCreator: listener.userId === roomState.createdBy
              });
            });
          }
        }
      }
    });
  }, 5000); // Check every 5 seconds instead of every second

  return httpServer;
}