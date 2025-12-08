# Knowledge Base SaaS Platform

## Overview

A full-stack SaaS platform enabling users to create and manage multi-tenant knowledge bases with customizable public help centers. It supports article creation via a rich text editor, content organization into categories, analytics tracking, and team collaboration with role-based permissions. The platform features an authenticated admin dashboard for content management and public-facing pages for end-users to browse and search documentation. Key capabilities include article versioning, dark mode, and extensive third-party integrations for enhanced functionality and connectivity.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, Vite.
**UI Library**: Shadcn/ui (Radix UI primitives).
**Styling**: Tailwind CSS with a custom design system based on Material Design, supporting light/dark modes via CSS variables.
**Routing**: Wouter for client-side routing, separating admin and public routes.
**State Management**: TanStack Query for server state, React Hook Form with Zod for form state and validation.
**Rich Text Editing**: TipTap editor with StarterKit and Image extension.
**File Uploads**: Uppy for handling uploads to cloud storage.

### Backend Architecture

**Server Framework**: Express.js on Node.js with TypeScript.
**Authentication**: Replit Auth (OIDC) via Passport.js, express-session with PostgreSQL store.
**API Design**: RESTful API with resource-based handlers and authentication middleware.
**Error Handling**: Centralized system with custom error classes.

### Database Architecture

**Database**: PostgreSQL via Neon's serverless driver.
**ORM**: Drizzle ORM for type-safe interactions.
**Schema Design**: Includes tables for users, knowledge bases, articles (with rich content, categories, and visibility), categories, analytics, article revisions, and sessions. Employs foreign key constraints.
**Full-text search**: Uses PostgreSQL `websearch_to_tsquery()` with GIN indexes for performance.

### Object Storage

**Provider**: Google Cloud Storage via Replit's sidecar service.
**Access Control**: Custom ACL for public/private object visibility.
**Usage**: Stores logos and article images.

### System Design Choices

**Multi-KB Architecture**: `KnowledgeBaseContext` manages selected KB state. All authenticated API routes use `kbId` for scoping. Public routes use generic `:identifier` for slugs/userIds.
**Team Collaboration**: Role-based permissions per knowledge base (owner, admin, contributor, viewer).
**Article Versioning**: Automatic revision history with restore capabilities.
**Email Service**: Abstracted service with mock provider for development, ready for SendGrid/Resend.
**Dark Mode**: ThemeProvider with localStorage persistence and Tailwind's `darkMode: ["class"]`.

## External Dependencies

### Third-Party Services

**Replit Auth**: OIDC authentication (replit.com/oidc).
**Google Cloud Storage**: Object storage via Replit sidecar service.
**Neon Database**: Serverless PostgreSQL.
**ServiceNow Integration**: Sync articles, create incidents.
**Slack Integration**: Search articles via slash commands, publish notifications.
**SSO Integration (SAML 2.0 / OIDC)**: Enterprise single sign-on (Okta, Azure AD, etc.).
**Microsoft Teams Integration**: Search articles, receive notifications.
**Zendesk / Freshdesk Integration**: Bi-directional article sync with support platforms.
**Public API**: Developer API with API key management and rate limiting for external access.

### Key NPM Dependencies

**UI Framework**: `@radix-ui/*`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`.
**Editor**: `@tiptap/react`, `@tiptap/starter-kit`.
**Uploads**: `@uppy/core`, `@uppy/dashboard`, `@uppy/aws-s3`.
**Database**: `drizzle-orm`, `@neondatabase/serverless`, `drizzle-zod`.
**Authentication**: `openid-client`, `passport`, `express-session`, `connect-pg-simple`.
**Build Tools**: `vite`, `esbuild`, `tsx`.

### Environment Configuration

- `DATABASE_URL`
- `ISSUER_URL`
- `REPL_ID`
- `SESSION_SECRET`
- `PUBLIC_OBJECT_SEARCH_PATHS` (optional)
- `NODE_ENV`