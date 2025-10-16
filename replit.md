# Music Player Application

## Overview

A minimal music player web application that allows users to search and play songs from YouTube Music. The application features a clean, dark-first interface inspired by YouTube Music, Spotify, and Apple Music design principles. Users can search for songs, view results in a card-based grid layout, and play audio with full playback controls including play/pause, next/previous track navigation, volume control, and progress tracking.

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
- Custom design system following Material Design principles with dark mode as primary theme
- Component structure uses the "New York" style variant from Shadcn

**Design System:**
- Color palette optimized for dark mode with a vibrant red accent (YouTube Music inspired)
- Typography using Inter for UI elements and DM Sans for display text
- Consistent spacing and elevation patterns using CSS custom properties
- Responsive design with mobile-first approach

**State Management:**
- Local component state using React hooks (useState, useRef, useEffect)
- Audio playback state managed in AudioPlayer component with imperative handle for external control
- Search query and current song selection managed in MusicPlayer parent component
- No global state management library needed due to simple state requirements

### Backend Architecture

**Server Framework:**
- Express.js server with TypeScript
- ESM (ES Modules) configuration for modern JavaScript syntax
- Custom middleware for request logging with response time tracking
- Error handling middleware for consistent error responses

**API Design:**
- RESTful API with `/api/search` endpoint for music search
- Query parameter-based search (`?q=<query>`)
- Returns structured JSON with song metadata (id, title, artist, duration, thumbnail, audioUrl)
- Uses Zod schemas for request validation

**Music Data Source:**
- Integrates with YouTube via `play-dl` library to search and retrieve audio streams
- Searches YouTube videos with audio content
- Extracts direct audio URLs from video formats for playback
- Transforms YouTube video data into normalized Song objects

### Data Storage Solutions

**Current Implementation:**
- In-memory storage using MemStorage class (Map-based storage)
- User schema defined but not actively used in current music player functionality
- Prepared for database migration with Drizzle ORM configuration

**Database Schema (Prepared):**
- Drizzle ORM configured for PostgreSQL via Neon serverless
- Schema definitions in shared/schema.ts for type safety across frontend and backend
- Migration files will be generated in ./migrations directory
- Connection string expected via DATABASE_URL environment variable

**Rationale:**
- In-memory storage chosen for development simplicity and fast iteration
- Database infrastructure prepared but not required for core music playback functionality
- User storage interface (IStorage) abstracts storage implementation for easy swapping

### External Dependencies

**Third-Party Services:**
- **YouTube Music/YouTube**: Primary music source accessed via play-dl library
  - Searches video content with audio
  - Retrieves direct audio stream URLs
  - Provides metadata (title, artist/channel, duration, thumbnails)
  - No official API key required (uses play-dl's scraping approach)

**Key Libraries:**
- **play-dl**: YouTube data extraction and audio URL retrieval
- **Radix UI**: Accessible component primitives (@radix-ui/* packages)
- **TanStack Query**: Async state management and caching
- **Zod**: Runtime type validation for API requests/responses
- **Drizzle ORM**: Database toolkit (configured for future use)
- **Neon Database**: Serverless PostgreSQL (configured for future use)

**Development Tools:**
- **Vite**: Frontend build tool with plugins for Replit integration
- **TSX**: TypeScript execution for development server
- **esbuild**: Production backend bundling
- **Tailwind CSS**: Utility-first CSS framework with PostCSS

**Notable Architectural Decisions:**
- Chose play-dl over official YouTube API to avoid quota limits and API key management
- Selected Radix UI for accessibility compliance and headless component architecture
- Implemented shared schema types between frontend and backend for type safety
- Used Vite's alias resolution for clean import paths (@/, @shared/, @assets/)