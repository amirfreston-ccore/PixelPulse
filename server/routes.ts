import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import play from "play-dl";
import ytdl from "@distube/ytdl-core";
import { z } from "zod";

const searchQuerySchema = z.object({
  q: z.string().min(1),
});

const agent = ytdl.createAgent();

// Global playlist state
let playlist: any[] = [];
let currentSongIndex = 0;
let isPlaying = false;
let playbackStartTime = 0; // When the current song started playing (server timestamp)
let pausedAt = 0; // Position in seconds where playback was paused

export async function registerRoutes(app: Express): Promise<Server> {
  
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

  // Get current playlist
  app.get("/api/playlist", (req, res) => {
    // Calculate current playback position
    let currentPosition = pausedAt;
    if (isPlaying && playbackStartTime > 0) {
      const elapsedMs = Date.now() - playbackStartTime;
      currentPosition = pausedAt + (elapsedMs / 1000); // Convert to seconds
    }

    res.json({
      playlist,
      currentSongIndex,
      isPlaying,
      playbackStartTime,
      pausedAt,
      currentPosition, // Current playback position in seconds
      serverTime: Date.now() // Send server time for client sync
    });
  });

  // Add song to playlist
  app.post("/api/playlist/add", (req, res) => {
    const song = req.body;

    // Check if song already exists in playlist
    const exists = playlist.find(s => s.id === song.id);
    if (exists) {
      return res.json({ success: false, message: 'Song already in playlist' });
    }

    playlist.push(song);

    // If no song is playing, start the first song
    if (playlist.length === 1 && !isPlaying) {
      currentSongIndex = 0;
      isPlaying = true;
      playbackStartTime = Date.now();
      pausedAt = 0;
    }

    io.emit('playlistUpdate', {
      playlist,
      currentSongIndex,
      isPlaying,
      playbackStartTime,
      pausedAt,
      serverTime: Date.now()
    });

    res.json({ success: true });
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

    // Calculate current position for new user
    let currentPosition = pausedAt;
    if (isPlaying && playbackStartTime > 0) {
      const elapsedMs = Date.now() - playbackStartTime;
      currentPosition = pausedAt + (elapsedMs / 1000);
    }

    // Send current state to new user with accurate timestamp
    socket.emit('playlistUpdate', {
      playlist,
      currentSongIndex,
      isPlaying,
      playbackStartTime,
      pausedAt,
      currentPosition,
      serverTime: Date.now()
    });

    // Handle play/pause
    socket.on('togglePlayPause', () => {
      if (isPlaying) {
        // Pausing - calculate and store current position
        const elapsedMs = Date.now() - playbackStartTime;
        pausedAt = pausedAt + (elapsedMs / 1000);
        isPlaying = false;
      } else {
        // Resuming - reset start time
        isPlaying = true;
        playbackStartTime = Date.now();
      }

      io.emit('playlistUpdate', {
        playlist,
        currentSongIndex,
        isPlaying,
        playbackStartTime,
        pausedAt,
        serverTime: Date.now()
      });
    });

    // Handle seek
    socket.on('seek', (position: number) => {
      pausedAt = position;
      playbackStartTime = Date.now();

      io.emit('playlistUpdate', {
        playlist,
        currentSongIndex,
        isPlaying,
        playbackStartTime,
        pausedAt,
        serverTime: Date.now()
      });
    });

    // Handle next song
    socket.on('nextSong', () => {
      if (currentSongIndex < playlist.length - 1) {
        currentSongIndex++;
      } else {
        currentSongIndex = 0; // Loop back to first
      }
      pausedAt = 0;
      playbackStartTime = Date.now();
      isPlaying = true;

      io.emit('playlistUpdate', {
        playlist,
        currentSongIndex,
        isPlaying,
        playbackStartTime,
        pausedAt,
        serverTime: Date.now()
      });
    });

    // Handle previous song
    socket.on('previousSong', () => {
      if (currentSongIndex > 0) {
        currentSongIndex--;
      } else {
        currentSongIndex = playlist.length - 1; // Loop to last
      }
      pausedAt = 0;
      playbackStartTime = Date.now();
      isPlaying = true;

      io.emit('playlistUpdate', {
        playlist,
        currentSongIndex,
        isPlaying,
        playbackStartTime,
        pausedAt,
        serverTime: Date.now()
      });
    });

    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });

  // Auto-advance to next song based on duration
  setInterval(() => {
    if (isPlaying && playlist.length > 0 && playlist[currentSongIndex]) {
      const currentSong = playlist[currentSongIndex];

      // Parse duration (format: "MM:SS" or "M:SS")
      const durationParts = currentSong.duration?.split(':') || ['3', '0'];
      const durationSeconds = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1] || '0');

      // Calculate current position
      const elapsedMs = Date.now() - playbackStartTime;
      const currentPosition = pausedAt + (elapsedMs / 1000);

      console.log(`[Auto-advance check] Song: "${currentSong.title}", Position: ${Math.floor(currentPosition)}s / ${durationSeconds}s, Playing: ${isPlaying}`);

      // Move to next song if current song has finished
      if (currentPosition >= durationSeconds) {
        if (currentSongIndex < playlist.length - 1) {
          currentSongIndex++;
        } else {
          currentSongIndex = 0; // Loop back to first song
        }
        pausedAt = 0;
        playbackStartTime = Date.now();

        console.log(`🎵 Auto-advancing to song ${currentSongIndex + 1}: ${playlist[currentSongIndex]?.title}`);

        io.emit('playlistUpdate', {
          playlist,
          currentSongIndex,
          isPlaying,
          playbackStartTime,
          pausedAt,
          serverTime: Date.now()
        });
      }
    }
  }, 5000); // Check every 5 seconds

  return httpServer;
}
