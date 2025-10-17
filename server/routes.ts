import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import ytsr from "ytsr";
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
let startTime = 0;

export async function registerRoutes(app: Express): Promise<Server> {
  
  app.get("/api/search", async (req, res) => {
    try {
      const { q } = searchQuerySchema.parse(req.query);
      
      const searchResults = await ytsr(q, { limit: 12 });
      
      const songs = searchResults.items
        .filter((item: any) => item.type === 'video')
        .slice(0, 12)
        .map((video: any) => {
          const videoId = video.id;
          
          return {
            id: videoId,
            title: video.title || "Unknown Title",
            artist: video.author?.name || "Unknown Artist",
            duration: video.duration || "0:00",
            thumbnail: video.thumbnails?.[0]?.url || video.bestThumbnail?.url || "",
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
    res.json({
      playlist,
      currentSongIndex,
      isPlaying,
      startTime
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
      startTime = Date.now();
    }
    
    io.emit('playlistUpdate', {
      playlist,
      currentSongIndex,
      isPlaying,
      startTime
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
    
    // Send current state to new user
    socket.emit('playlistUpdate', {
      playlist,
      currentSongIndex,
      isPlaying,
      startTime
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });

  // Auto-advance to next song
  setInterval(() => {
    if (isPlaying && playlist.length > 0) {
      const elapsed = Date.now() - startTime;
      
      // Move to next song after 3 minutes (180000ms)
      if (elapsed > 180000) {
        if (currentSongIndex < playlist.length - 1) {
          currentSongIndex++;
        } else {
          currentSongIndex = 0; // Loop back to first song
        }
        startTime = Date.now();
        
        console.log(`Auto-advancing to song ${currentSongIndex + 1}: ${playlist[currentSongIndex]?.title}`);
        
        io.emit('playlistUpdate', {
          playlist,
          currentSongIndex,
          isPlaying,
          startTime
        });
      }
    }
  }, 10000);

  return httpServer;
}
