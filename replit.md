# Music Player Application

## Overview

A minimal music player web application that allows users to search and play songs from YouTube Music. The application features a clean, dark-first interface inspired by YouTube Music and Spotify design principles. Users can search for songs, view results in a card-based grid layout, and interact with full playback controls including play/pause, next/previous track navigation, volume control, progress tracking, and keyboard shortcuts.

## Current Status

**✅ Completed Features:**
- Beautiful dark-themed UI with YouTube Music-inspired red accent color
- Fully functional search with real-time YouTube Music results
- Grid layout displaying song cards with thumbnails, titles, artists, and durations
- Complete audio player bar with all controls (play/pause, next/previous, volume, progress)
- Keyboard shortcuts (Space for play/pause, Arrow keys for seeking)
- Loading states and empty states
- Responsive design
- Smooth animations and hover effects

**⚠️ Known Limitation:**
- Audio streaming may fail intermittently due to YouTube's anti-bot protections (403 errors)
- YouTube actively updates their player obfuscation to prevent scraping
- This affects all ytdl-based libraries (@distube/ytdl-core, play-dl, etc.)
- The UI and all controls work perfectly; only the actual audio playback is affected by external factors

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tools:**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server, configured for fast hot module replacement
- Wouter for lightweight client-side routing (single-page application)
- TanStack Query (React Query) for server state management and API data fetching

**UI Component System:**
- Shadcn UI component library based on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Custom design system with dark mode as primary theme
- Component structure uses the "New York" style variant from Shadcn

**Design System:**
- Primary accent: YouTube Music red (HSL: 0 85% 60%)
- Dark background with subtle elevation layers
- Typography using system font stack optimized for readability
- Consistent spacing and border radius (8px for cards, 6px for buttons)
- Smooth hover and active state transitions
- Custom elevation utilities (hover-elevate, active-elevate-2)

**Key Components:**
- **MusicPlayer.tsx**: Main page container with search integration
- **SearchBar.tsx**: Search input with debounced queries
- **MusicCard.tsx**: Individual song card with play action
- **AudioPlayer.tsx**: Persistent bottom player bar
- **EmptyState.tsx**: Display when no search performed
- **LoadingState.tsx**: Skeleton loading cards

**State Management:**
- Local component state using React hooks (useState, useRef, useEffect)
- Audio playback state managed in AudioPlayer component
- Search query and current song selection in MusicPlayer component
- TanStack Query handles API caching and loading states

### Backend Architecture

**Server Framework:**
- Express.js server with TypeScript
- ESM (ES Modules) configuration for modern JavaScript syntax
- CORS enabled for API access
- Request logging middleware

**API Endpoints:**
- `GET /api/search?q=<query>` - Search YouTube Music
  - Returns: { songs: Song[], query: string }
  - Uses ytsr library for YouTube search
- `GET /api/stream/:videoId` - Stream audio for a video
  - Uses @distube/ytdl-core with agent configuration
  - Returns: audio/webm stream with CORS headers
  - Note: May fail due to YouTube's anti-bot measures

**Music Data Flow:**
1. User enters search query
2. Frontend calls /api/search
3. Backend uses ytsr to search YouTube
4. Results are normalized to Song format
5. Frontend displays cards with /api/stream/:videoId URLs
6. When user clicks play, audio element requests stream
7. Backend attempts to extract and proxy audio using ytdl-core

### Data Storage Solutions

**Current Implementation:**
- In-memory storage using MemStorage class (Map-based)
- No persistent storage required for music player functionality
- Database infrastructure prepared but not actively used

**Database Schema (Prepared):**
- Drizzle ORM configured for PostgreSQL via Neon serverless
- Schema definitions in shared/schema.ts
- Ready for future features like playlists or favorites

### External Dependencies

**Third-Party Services:**
- **YouTube**: Primary music source
  - Search via ytsr (no API key required)
  - Audio extraction via @distube/ytdl-core
  - Note: Subject to YouTube's anti-scraping measures

**Key Libraries:**
- **ytsr**: YouTube search without authentication
- **@distube/ytdl-core**: YouTube audio extraction
- **Radix UI**: Accessible component primitives
- **TanStack Query**: Async state and caching
- **Zod**: Runtime type validation
- **Lucide React**: Icon library

**Development Tools:**
- **Vite**: Frontend build tool with Replit integration
- **TSX**: TypeScript execution for dev server
- **Tailwind CSS**: Utility-first CSS framework

## Technical Decisions & Rationale

**Why ytsr + ytdl-core?**
- Avoids YouTube API quota limits
- No API key management needed
- Direct access to music content
- Trade-off: Reliability depends on YouTube's tolerance

**Why Dark Theme First?**
- Music apps traditionally use dark interfaces
- Reduces eye strain during extended listening
- YouTube Music and Spotify use dark themes
- Better visual focus on album artwork

**Why In-Memory Storage?**
- MVP doesn't require data persistence
- Faster development iteration
- Easy to migrate to database later if needed

**Why TanStack Query?**
- Built-in caching reduces API calls
- Automatic loading/error states
- Optimistic updates support
- Industry standard for React data fetching

## Project Structure

```
├── client/
│   └── src/
│       ├── components/
│       │   ├── ui/              # Shadcn components
│       │   ├── AudioPlayer.tsx  # Bottom player bar
│       │   ├── MusicCard.tsx    # Song card component
│       │   ├── SearchBar.tsx    # Search input
│       │   ├── EmptyState.tsx   # No search state
│       │   └── LoadingState.tsx # Loading skeleton
│       ├── pages/
│       │   └── MusicPlayer.tsx  # Main page
│       ├── lib/
│       │   └── queryClient.ts   # TanStack Query setup
│       └── App.tsx              # Root component
├── server/
│   ├── routes.ts                # API endpoints
│   ├── storage.ts               # Storage interface
│   └── index.ts                 # Express server
├── shared/
│   └── schema.ts                # Shared types
└── design_guidelines.md         # Design system docs
```

## Recent Changes

**October 16, 2025:**
- Switched from play-dl to ytsr + @distube/ytdl-core for better compatibility
- Added ytdl agent configuration to improve YouTube compatibility
- Implemented comprehensive error handling in streaming endpoint
- Completed E2E testing verifying all UI features work correctly
- Documented YouTube streaming limitation as known issue
- All UI components and interactions are fully functional and tested