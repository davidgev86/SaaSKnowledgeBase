# Knowledge Base SaaS Platform

## Overview

A full-stack SaaS application for creating and managing knowledge bases with public help centers. Users can create articles with a rich text editor, organize content into categories, track analytics, and publish customizable public-facing help centers. The platform features a dual interface: an authenticated admin dashboard for content management and public-facing pages for end-users to browse and search documentation.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Updates (December 2025)

### Completed MVP Features
- **Multi-Tenant Knowledge Bases**: Users can create and manage multiple knowledge bases from a single account with KB switcher in sidebar
- **Team Collaboration**: Invite team members, assign roles (owner/admin/contributor/viewer), manage permissions per KB
- **Email Notifications Framework**: Pluggable email service for invite notifications (mock mode for dev, ready for SendGrid/Resend integration)
- **Analytics Dashboard**: Track article views, search queries, and feedback with interactive charts and date range filtering
- **Settings**: Configure site title, primary color, upload logos per KB
- **Articles**: Create, edit, delete, and toggle visibility with quick publish/unpublish
- **Categories**: Organize articles into categories
- **Public Help Center**: Searchable public-facing documentation site with slug-based URLs (/kb/my-kb-slug)
- **Article Versioning**: Automatic version history on article saves, view revisions in sidebar, restore to previous versions
- **Dark Mode**: Full dark mode support with theme toggle on all pages (Light/Dark/System preference)

### Bug Fixes Applied
- Logo upload: Fixed JSON response parsing and object path construction (`/objects/${param}`)
- Public search: Uses Drizzle ORM `ilike()` and `or()` operators for proper search
- Article visibility toggle: Added quick toggle in article list for publish/unpublish

### Technical Notes
- Object serving route must construct paths as `/objects/${param}` not `/${param}`
- **Full-text search**: Uses PostgreSQL `websearch_to_tsquery()` for relevance-ranked results with fallback to ILIKE for robustness
- **Search indexes**: GIN index on `to_tsvector('english', title || content)` for performance; B-tree indexes on title and (knowledge_base_id, is_public)
- **Multi-KB Architecture**: 
  - `KnowledgeBaseContext` (`client/src/context/KnowledgeBaseContext.tsx`) manages selected KB state with `getApiUrl()` helper
  - All authenticated API routes use `kbId` query parameter for KB-scoping
  - Backend routes validate user access via team membership table or ownership
  - KB switcher in `AppSidebar` allows switching between accessible KBs
  - Public routes use generic `:identifier` parameter supporting both slugs and legacy userId URLs
  - Cache invalidation includes kbId in query keys for proper data isolation
- Team collaboration invites members to specific KBs; each member has a role per KB
- Categories only display on public site when containing at least one public article (intentional UX)
- **Category reordering**: Uses @dnd-kit for drag-and-drop; order field in categories table; PUT /api/categories/reorder endpoint
- Article versioning: Revisions auto-increment version number on each save; restore creates new revision before reverting
- Email service: Abstraction in `server/email.ts` with MockEmailProvider for dev; swap to SendGridProvider/ResendProvider when ready (just uncomment and add API key)
- Article images: Uploaded via `/api/article-images` endpoint using object storage; images stored with public ACL and inserted into TipTap editor; max size 10MB
- **Dark mode**: ThemeProvider in `client/src/components/ThemeProvider.tsx` manages theme state with localStorage persistence; CSS variables in `index.css` define light/dark color schemes; Tailwind's `darkMode: ["class"]` enables class-based toggling

## Testing Infrastructure

### End-to-End Tests (Playwright)
Located in `tests/e2e/`:
- `auth.spec.ts` - Authentication flow (login, logout, navigation)
- `articles.spec.ts` - Article CRUD operations and visibility toggle
- `categories.spec.ts` - Category management and drag-and-drop reordering
- `team.spec.ts` - Team invitation and role management
- `analytics.spec.ts` - Analytics dashboard and date filtering
- `settings.spec.ts` - KB settings configuration
- `public-search.spec.ts` - Public knowledge base and search
- `article-versioning.spec.ts` - Version history and restore

### Integration Tests (Vitest)
Located in `tests/integration/`:
- `permissions.test.ts` - Permission system, role hierarchy, KB access control, revision system

### Running Tests
```bash
# Run integration tests
npx vitest run tests/integration

# Run E2E tests (requires app running)
npx playwright test

# Run specific E2E test
npx playwright test tests/e2e/articles.spec.ts
```

### Test Helpers
- `tests/e2e/utils/test-helpers.ts` - Common utilities (waitForKBReady, generateUniqueId, etc.)

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, using Vite as the build tool and bundler.

**UI Library**: Shadcn/ui components built on Radix UI primitives, providing a comprehensive set of accessible, customizable components following the "new-york" style variant.

**Styling**: Tailwind CSS with a custom design system based on Material Design principles, optimized for documentation and content readability. The design uses CSS variables for theming with support for light/dark modes, a neutral color palette, and content-first spacing and typography scales.

**Routing**: Wouter for lightweight client-side routing, separating authenticated admin routes from public knowledge base routes.

**State Management**: TanStack Query (React Query) for server state management with custom query client configuration. Form state is managed with React Hook Form and Zod for validation.

**Rich Text Editing**: TipTap editor with StarterKit and Image extension for article content creation, providing a WYSIWYG editing experience with inline image support.

**File Uploads**: Uppy integration for handling file uploads to cloud storage.

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript.

**Development/Production Split**: Separate entry points for development (with Vite middleware) and production (serving static files), both using a shared app factory pattern.

**Authentication**: Replit Auth using OpenID Connect (OIDC) with Passport.js strategy. Session management uses express-session with PostgreSQL-backed session storage (connect-pg-simple).

**API Design**: RESTful API with route handlers organized by resource type. Routes are protected with authentication middleware.

**Error Handling**: Centralized error handling with custom error classes (e.g., ObjectNotFoundError) and middleware for logging requests/responses.

### Database Architecture

**Database**: PostgreSQL via Neon's serverless driver with WebSocket support.

**ORM**: Drizzle ORM for type-safe database interactions and schema management.

**Schema Design**:
- Users table for authentication and profile data
- Knowledge bases table (multiple per user) for site configuration with unique slugs
- Articles table with rich content, category associations, and public/private visibility
- Categories table for organizing articles
- Analytics tables for tracking views, searches, and article feedback
- Article revisions table for version history with complete article snapshots
- Sessions table for authentication session persistence

**Relationships**: The schema uses foreign key constraints with cascade deletes to maintain referential integrity. Articles belong to categories and knowledge bases, analytics are tied to articles.

### Object Storage

**Provider**: Google Cloud Storage accessed through Replit's sidecar service using external account credentials.

**Access Control**: Custom ACL (Access Control List) system with object-level permissions supporting public/private visibility and owner-based access rules.

**Usage**: Stores uploaded assets like logos and article images with configurable public search paths.

### Design System

**Typography**: Inter for UI elements, system fonts for article body text, JetBrains Mono for code snippets. Type scale from text-xs (12px) to text-6xl (60px).

**Layout**: Responsive grid systems with container width optimization for different contexts (dashboard: max-w-7xl, article reading: max-w-4xl for optimal readability).

**Spacing**: Consistent spacing units using Tailwind's scale (2, 4, 6, 8, 12, 16) for component padding and section spacing.

**Components**: Material Design-inspired component library with custom elevation system using CSS variables for shadows and borders.

## External Dependencies

### Third-Party Services

**Replit Auth**: Provides OAuth/OIDC authentication with discovery endpoint at replit.com/oidc. Requires `ISSUER_URL`, `REPL_ID`, and `SESSION_SECRET` environment variables.

**Google Cloud Storage**: Object storage for file uploads, accessed through Replit's sidecar service at http://127.0.0.1:1106. Uses external account credentials with automatic token refresh.

**Neon Database**: PostgreSQL database service requiring `DATABASE_URL` environment variable. Configured for serverless operation with WebSocket support.

### Key NPM Dependencies

**UI Framework**: @radix-ui/* components for accessible primitives, @tanstack/react-query for data fetching, react-hook-form with @hookform/resolvers for forms.

**Editor**: @tiptap/react and @tiptap/starter-kit for rich text editing.

**Uploads**: @uppy/core, @uppy/dashboard, @uppy/aws-s3 for file upload UI and S3-compatible storage.

**Database**: drizzle-orm for ORM, @neondatabase/serverless for database connection, drizzle-zod for schema validation.

**Authentication**: openid-client for OIDC, passport for authentication middleware, express-session with connect-pg-simple for session management.

**Build Tools**: vite for frontend bundling, esbuild for backend bundling, tsx for TypeScript execution in development.

### Environment Configuration

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `ISSUER_URL`: OIDC issuer URL (defaults to https://replit.com/oidc)
- `REPL_ID`: Replit application identifier
- `SESSION_SECRET`: Secret for session encryption
- `PUBLIC_OBJECT_SEARCH_PATHS`: Comma-separated paths for public object access (optional)
- `NODE_ENV`: Environment mode (development/production)