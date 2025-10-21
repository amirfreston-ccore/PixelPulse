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
}>();

// Track active listeners per room
const roomListeners = new Map<string, Map<string, { name: string; socketId: string; userId: string }>>();

// Track votes per song per room
const songVotes = new Map<string, Map<string, Set<string>>>();

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
          createdBy: "system"
        });
        roomListeners.set(publicRoom.id, new Map());
        songVotes.set(publicRoom.id, new Map());
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
        createdBy
      });

      roomListeners.set(room.id, new Map());
      songVotes.set(room.id, new Map());

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

      roomState.playlist.push(song);

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
            isCreator: listener.userId === roomState.createdBy
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

  // Update room state
  // roomState.currentPosition = position;
  roomState.isPlaying = isPlaying;
  // Update playbackStartTime only if playing, to maintain sync
  if (isPlaying) {
    roomState.playbackStartTime = Date.now();
  } else {
    // If paused, store position as pausedAt
    roomState.pausedAt = position;
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

    // Handle next song (only for private room creators)
    socket.on('nextSong', (roomId: string) => {
      const roomState = roomStates.get(roomId);
      if (!roomState || !currentUserId) return;
      
      // Only allow creator to control private rooms
      if (roomState.createdBy !== currentUserId || roomState.createdBy === "system") return;

      if (roomState.playlist.length > 0) {
        roomState.currentSongIndex = (roomState.currentSongIndex + 1) % roomState.playlist.length;
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
          roomListener.delete(socket.id);

          // Send updated listeners to room
          const listeners = Array.from(roomListener.values()).map(l => l.name);
          io.to(currentRoomId).emit('listenersUpdate', { listeners });
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
          // Auto-advance to next song (loop)
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
