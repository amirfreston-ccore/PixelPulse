# Design Guidelines: Minimal Music Player

## Design Approach
**Reference-Based with System Foundation**: Drawing inspiration from YouTube Music (API source), Spotify's clean interface, and Apple Music's elegant controls, combined with Material Design principles for consistency and interaction patterns.

## Core Design Principles
1. **Content-First Simplicity**: Music and controls take center stage, minimal chrome
2. **Instant Clarity**: Users should immediately understand how to search and play
3. **Visual Rhythm**: Maintain consistent spacing and alignment throughout
4. **Dark-First Design**: Optimized for immersive listening experience

---

## Color Palette

### Dark Mode (Primary)
- **Background**: 0 0% 8% (deep charcoal, main canvas)
- **Surface**: 0 0% 12% (elevated panels, player card)
- **Surface Elevated**: 0 0% 16% (search bar, hover states)
- **Border**: 0 0% 20% (subtle dividers)
- **Text Primary**: 0 0% 95% (high contrast white)
- **Text Secondary**: 0 0% 65% (artist names, metadata)
- **Text Muted**: 0 0% 45% (timestamps, placeholders)

### Accent Colors
- **Primary Accent**: 0 85% 60% (vibrant red, inspired by YouTube Music branding - play buttons, active states)
- **Primary Hover**: 0 85% 55% (slightly darker for interaction feedback)
- **Success/Active**: 142 70% 50% (green for playing state indicators)

### Light Mode (Secondary)
- **Background**: 0 0% 98%
- **Surface**: 0 0% 100%
- **Text Primary**: 0 0% 10%
- **Primary Accent**: 0 75% 50% (slightly desaturated for light mode)

---

## Typography

### Font Families
- **Primary**: 'Inter', -apple-system, system-ui, sans-serif (UI elements, controls, metadata)
- **Display**: 'DM Sans', sans-serif (song titles, headings)

### Type Scale
- **Hero Title**: text-4xl md:text-5xl, font-bold, tracking-tight (song title when playing)
- **Song Title**: text-lg md:text-xl, font-semibold (search results, queue)
- **Artist Name**: text-sm md:text-base, font-medium (secondary info)
- **Body/Metadata**: text-sm, font-normal (duration, timestamps)
- **Caption**: text-xs, tracking-wide (labels, hints)

---

## Layout System

### Spacing Primitives
Core spacing uses Tailwind units: **2, 3, 4, 6, 8, 12, 16**
- Micro spacing (within components): p-2, gap-2
- Standard spacing (between elements): p-4, gap-4, mb-6
- Section spacing (major blocks): p-6, py-8, gap-8
- Container padding: px-4 md:px-6 lg:px-8

### Grid Structure
- **Main Container**: max-w-7xl mx-auto px-4 md:px-6
- **Search Results Grid**: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- **Player Layout**: Single column stack on mobile, adaptive on desktop

---

## Component Library

### Search Interface
**Search Bar (Hero Position)**
- Fixed/sticky at top: 56px height on mobile, 64px on desktop
- Full-width input with rounded-2xl, subtle border
- Search icon (Heroicons) left-aligned, pl-12
- Background: surface elevated with backdrop-blur-sm
- Focus state: accent color ring (ring-2 ring-red-500)
- Placeholder: "Search for songs, artists, albums..."

### Music Card (Search Results)
- Aspect ratio 1:1 for album artwork section
- Rounded-xl overflow-hidden
- Hover: scale-105 transition, overlay gradient from bottom
- Structure: Image → Title (truncate) → Artist (text-muted) → Duration
- Play button overlay: absolute center, opacity-0 hover:opacity-100
- Background: surface with subtle border

### Audio Player (Bottom Fixed/Sticky)
**Primary Controls Bar**
- Fixed bottom position, backdrop-blur-md, border-top
- Height: 80px mobile, 96px desktop
- Layout: [Artwork + Info | Controls | Volume + Additional]
- Z-index: 50 (always on top)

**Now Playing Section** (Left)
- Album art: 56x56px rounded-lg
- Song title: font-semibold, truncate
- Artist: text-sm text-muted

**Playback Controls** (Center)
- Button sizes: 40px (secondary), 48px (play/pause primary)
- Icons: Previous, Play/Pause (with smooth rotation animation), Next
- Spacing: gap-6 between controls
- Play button: bg-accent, rounded-full, hover:scale-110

**Progress Bar** (Full Width Above Controls)
- Height: 4px, rounded-full
- Track: bg-border
- Fill: bg-accent with transition-all
- Hover: h-6px, show tooltip with timestamp
- Thumb: hidden by default, visible on hover (12px circle)

**Volume Control** (Right)
- Slider: w-24 md:w-32
- Icon (speaker) responsive to volume level
- Range: 0-100, default 70

### Empty State
- Icon: Musical note (Heroicons), size-16, text-muted
- Heading: "Search for music"
- Subtext: "Find your favorite songs from YouTube Music"
- Center-aligned, py-20

### Loading States
- Skeleton cards: animate-pulse with gradient shimmer
- Search: spinning loader icon in search bar
- Audio loading: indeterminate progress on play button

---

## Interaction Patterns

### Micro-Interactions
- Button press: scale-95 active state
- Card hover: transform scale-105 duration-200
- Play button state change: rotate-90 transition
- Progress bar scrubbing: smooth transform with spring physics

### Keyboard Shortcuts
- Space: Play/Pause toggle
- Arrow keys: Seek ±5 seconds
- Enter in search: Focus first result
- Escape: Clear search/close modals

### Mobile Adaptations
- Search bar: Full-width, reduced padding
- Cards: Single column grid
- Player controls: Condensed layout, reduce spacing
- Swipe gestures: Swipe on player bar to skip tracks

---

## Animations

**Minimal and Purposeful Only**:
1. **Play/Pause Icon**: Morph animation between states (duration-300)
2. **Card Hover**: Subtle scale transform (duration-200)
3. **Progress Fill**: Smooth width transition (transition-all duration-150)
4. **Search Results**: Fade-in stagger (delay-[50ms] per card)

No background animations, particles, or distracting effects.

---

## Images

### Album Artwork
**Primary Visual Element**:
- **Search Results**: Square thumbnails, 1:1 aspect ratio, min 200x200px
- **Now Playing**: Larger display, 56x56px in player bar, potential expanded view
- **Fallback**: Gradient placeholder with music note icon when no artwork available
- **Quality**: Fetch medium resolution from API (faster loading)
- **Treatment**: Slight shadow (shadow-lg), rounded corners (rounded-lg to rounded-xl)

**No Hero Section**: This is a functional music player, not a landing page. The search bar serves as the entry point.

---

## Responsive Breakpoints

- **Mobile** (< 768px): Single column, stacked controls, reduced spacing
- **Tablet** (768px - 1024px): 2-column grid, side-by-side player elements
- **Desktop** (> 1024px): 3-column grid, full player bar with all controls visible

---

## Accessibility

- ARIA labels on all controls (play, pause, volume, skip)
- Focus indicators: ring-2 ring-accent ring-offset-2 ring-offset-background
- Keyboard navigation throughout
- Screen reader announcements for now playing changes
- Sufficient color contrast (WCAG AA minimum)
- Touch targets minimum 44px on mobile

---

## Technical Specifications

- **Icons**: Heroicons (via CDN) - use outline variants for most UI, solid for active states
- **Fonts**: Google Fonts CDN (Inter + DM Sans)
- **Audio**: HTML5 Audio API with custom controls (no default browser UI)
- **State Management**: Track current song, play state, progress, volume, search results