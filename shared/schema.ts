import { z } from "zod";

export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  duration: z.string(),
  thumbnail: z.string().optional(),
  audioUrl: z.string().optional(),
  addedBy: z.string().optional(), // Username of who added the song
});

export const searchResultSchema = z.object({
  songs: z.array(songSchema),
  query: z.string(),
});

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
});

export const insertUserSchema = userSchema.omit({ id: true });

export type Song = z.infer<typeof songSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
