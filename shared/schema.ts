import { z } from "zod";

export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  duration: z.string(),
  thumbnail: z.string().optional(),
  audioUrl: z.string().optional(),
});

export const searchResultSchema = z.object({
  songs: z.array(songSchema),
  query: z.string(),
});

export type Song = z.infer<typeof songSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
