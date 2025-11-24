# Knowledge Base SaaS Design Guidelines

## Design Approach
**Design System**: Material Design principles with documentation-optimized modifications
**Rationale**: Content-first architecture prioritizing readability, scanability, and efficient information access. The dual nature (admin dashboard + public help center) requires consistent patterns that adapt across contexts.

## Typography System

**Font Families**:
- Primary: Inter (headings, UI elements, navigation)
- Content: System UI stack for article body text (optimal reading)
- Monospace: JetBrains Mono (code snippets in articles)

**Type Scale**:
- Hero/Landing: text-5xl to text-6xl (48-60px)
- Page Titles: text-3xl to text-4xl (30-36px)
- Section Headers: text-2xl (24px)
- Article Titles: text-xl (20px)
- Body: text-base (16px)
- Meta/Labels: text-sm (14px)
- Captions: text-xs (12px)

**Weights**: 400 (regular), 500 (medium), 600 (semibold) for hierarchy

## Layout & Spacing System

**Core Spacing Units**: Use Tailwind units of 2, 4, 6, 8, 12, and 16 consistently
- Component padding: p-4 to p-6
- Section spacing: py-12 to py-16
- Card spacing: p-6 to p-8
- Button padding: px-6 py-3
- Input padding: px-4 py-2.5

**Container Widths**:
- Admin dashboard: max-w-7xl (full workflow space)
- Article reading: max-w-4xl (optimal reading width ~800px)
- Public help center: max-w-6xl
- Form containers: max-w-2xl

**Grid Systems**:
- Category cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Dashboard widgets: grid-cols-1 lg:grid-cols-2 gap-6
- Article lists: Single column with generous spacing

## Component Library

### Navigation & Headers
**Admin Dashboard Header**:
- Fixed top navigation with shadow
- Logo left, user profile/settings right
- Height: h-16
- Search bar centered (max-w-md)

**Public Help Center Header**:
- Clean, minimal navigation
- Customer logo left, search prominent center
- Breadcrumb navigation below header
- Height: h-20 with breathing room

### Content Components

**Article Editor Interface**:
- Full-screen editor mode option
- Toolbar: sticky top positioning
- Side panel for metadata (category, visibility toggle)
- Auto-save indicator
- Rich text area with generous padding (p-8)

**Article Cards** (Dashboard & Public):
- Rounded corners (rounded-lg)
- Padding: p-6
- Title (text-lg font-semibold)
- Excerpt snippet (2 lines, text-sm)
- Meta row: category badge, view count, date
- Hover state with subtle elevation

**Category Management**:
- Draggable list items with handle icon
- Each category shows article count
- Inline edit capability
- Expandable to show nested articles

**Search Component**:
- Large, prominent search bar on public pages
- Icon left, clear button right
- Height: h-12 to h-14
- Instant results dropdown with keyboard navigation
- Highlight matched terms in results

### Data Display

**Analytics Dashboard**:
- Card-based widget layout
- Stat cards: Large number (text-4xl font-bold), label below, trend indicator
- Chart containers: min-h-64 with proper aspect ratio
- Time range selector (tabs: 7d, 30d, 90d)
- Recent activity list with timestamps

**Feedback Display**:
- Thumbs up/down buttons: Large tap targets (min 44px)
- Success state with subtle animation
- Aggregate counts shown to admins
- Positioned at article end with spacing (mt-16)

### Forms & Inputs

**Authentication Forms**:
- Centered cards (max-w-md)
- Single column layout
- Large input fields (h-12)
- Primary CTA full width
- OAuth buttons with provider logos

**Article Editor Toolbar**:
- Icon buttons in groups (text formatting, lists, media)
- Tooltips on hover
- Active states clearly indicated
- Sticky positioning when scrolling

**Settings & Branding**:
- Two-column layout on desktop (form left, preview right)
- Logo upload: Dashed border dropzone
- Color picker with preset swatches
- Live preview of public help center

### Public Help Center Layout

**Homepage**:
- Hero section (h-96): Search bar prominently centered, brief tagline above
- Popular categories: 3-column grid with icon, title, article count
- Recent articles: List view with timestamps
- Footer: Links, branding, powered-by badge

**Category Pages**:
- Category header with description
- Article list: Clean, scannable with good spacing (space-y-4)
- Sidebar: Related categories, search

**Article View**:
- Wide reading column (max-w-4xl mx-auto)
- Generous line-height (leading-relaxed)
- Table of contents sidebar (sticky, desktop only)
- Feedback buttons at bottom
- Related articles: 3-card row below content

### Utility Components

**Badges & Tags**:
- Category badges: rounded-full, px-3, py-1, text-sm
- Status indicators: Small dot + label
- View counts: Eye icon + number

**Empty States**:
- Centered content (max-w-lg mx-auto)
- Large icon or illustration
- Clear heading + description
- Primary action button

**Loading States**:
- Skeleton screens for article lists
- Spinner for search results
- Progressive content loading

## Accessibility & Interaction

- All interactive elements minimum 44x44px touch targets
- Clear focus states (ring-2)
- Semantic HTML hierarchy
- ARIA labels for icon-only buttons
- Keyboard navigation support throughout
- Skip to content links

## Responsive Behavior

**Breakpoints**:
- Mobile-first approach
- Stack columns to single on mobile
- Hide sidebar navigation behind menu icon (< md)
- Collapsible filters on category pages
- Reading view full-width on mobile

**Touch Optimizations**:
- Larger tap targets on mobile
- Swipe gestures for article navigation
- Bottom navigation bar for mobile admin dashboard

## Images

**Logo/Branding**: Customer logos in header (max height 40px), maintain aspect ratio

**Empty States**: Simple illustrations for "no articles yet", "no search results" (max-w-xs, centered)

**Article Content**: Support inline images within rich text, full-width with captions, responsive sizing

**No Hero Images**: This is a utility application focused on content and functionality, not marketing imagery