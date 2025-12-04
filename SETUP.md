# Developer Setup Guide

This guide covers setting up the Knowledge Base SaaS platform for local development or deployment outside of Replit.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Replit)](#quick-start-replit)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Authentication Configuration](#authentication-configuration)
- [Object Storage Setup](#object-storage-setup)
- [Running the Application](#running-the-application)
- [Running Tests](#running-tests)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** 18+ (recommended: 20.x LTS)
- **npm** 9+ or **pnpm**
- **PostgreSQL** 14+ (or a managed PostgreSQL service like Neon, Supabase, or AWS RDS)
- **Git**

---

## Quick Start (Replit)

If you're running this project on Replit, most configuration is handled automatically:

1. Fork or clone the Repl
2. The database is provisioned automatically
3. Click "Run" to start the development server
4. Access the app at the provided URL

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd knowledge-base-saas
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the project root (see [Environment Variables](#environment-variables) section below).

### 4. Initialize the Database

```bash
npm run db:push
```

### 5. Start the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5000`.

---

## Environment Variables

Create a `.env` file with the following variables:

### Required Variables

```env
# Database Connection
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Session Security (generate a random 32+ character string)
SESSION_SECRET=your-super-secret-session-key-here

# Authentication
ISSUER_URL=https://your-oidc-provider.com
REPL_ID=your-app-identifier

# Node Environment
NODE_ENV=development
```

### Optional Variables

```env
# Object Storage (for file uploads)
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your-bucket-id
PUBLIC_OBJECT_SEARCH_PATHS=public
PRIVATE_OBJECT_DIR=.private

# PostgreSQL (alternative to DATABASE_URL)
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your-password
PGDATABASE=knowledge_base
```

### Generating a Session Secret

```bash
# Linux/macOS
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Database Setup

### Option 1: Neon (Recommended for Serverless)

1. Create a free account at [neon.tech](https://neon.tech)
2. Create a new project and database
3. Copy the connection string to `DATABASE_URL`

```env
DATABASE_URL=postgresql://user:password@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### Option 2: Local PostgreSQL

1. Install PostgreSQL locally
2. Create a database:

```bash
psql -U postgres
CREATE DATABASE knowledge_base;
\q
```

3. Set the connection string:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/knowledge_base
```

### Option 3: Docker PostgreSQL

```bash
docker run --name kb-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=knowledge_base \
  -p 5432:5432 \
  -d postgres:14
```

### Applying the Schema

After configuring your database, apply the schema:

```bash
npm run db:push
```

This uses Drizzle Kit to push the schema defined in `shared/schema.ts` to your database.

---

## Authentication Configuration

The app uses OpenID Connect (OIDC) for authentication. You have several options:

### Option 1: Replit Auth (Default)

If running on Replit, authentication is pre-configured. Set:

```env
ISSUER_URL=https://replit.com/oidc
```

### Option 2: Auth0

1. Create an Auth0 account and application
2. Configure callback URLs: `http://localhost:5000/api/callback`
3. Set environment variables:

```env
ISSUER_URL=https://your-tenant.auth0.com
# Note: You'll need to modify server/replitAuth.ts for client ID/secret
```

### Option 3: Keycloak (Self-Hosted)

1. Deploy Keycloak
2. Create a realm and client
3. Configure:

```env
ISSUER_URL=http://localhost:8080/realms/your-realm
```

### Option 4: Development Mode (No Auth)

For local development without authentication, you can modify `server/replitAuth.ts` to use a mock authentication strategy:

```typescript
// In server/replitAuth.ts, add a development bypass:
if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
  // Implement mock user session
}
```

---

## Object Storage Setup

The app uses Google Cloud Storage for file uploads (logos, article images). 

### Option 1: Replit Object Storage (Default)

On Replit, object storage is automatically configured.

### Option 2: Google Cloud Storage

1. Create a GCP project and enable Cloud Storage
2. Create a service account with Storage Admin role
3. Download the JSON key file
4. Set environment variables:

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your-bucket-name
```

### Option 3: AWS S3-Compatible Storage

Modify `server/objectStorage.ts` to use the AWS SDK instead of the Google Cloud client.

### Option 4: Local File Storage (Development)

For local development without cloud storage, you can modify the upload endpoints to use local file system storage.

---

## Running the Application

### Development Mode

```bash
npm run dev
```

This starts:
- Express backend server with hot reload (via tsx)
- Vite frontend development server with HMR
- Both served on port 5000

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Type Checking

```bash
npm run check
```

---

## Running Tests

### Integration Tests (Vitest)

```bash
# Run all integration tests
npx vitest run tests/integration

# Run with watch mode
npx vitest tests/integration

# Run with coverage
npx vitest run tests/integration --coverage
```

### End-to-End Tests (Playwright)

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Start the app in one terminal
npm run dev

# Run E2E tests in another terminal
npx playwright test

# Run specific test file
npx playwright test tests/e2e/articles.spec.ts

# Run with UI mode
npx playwright test --ui

# Run headed (visible browser)
npx playwright test --headed
```

### Test Coverage Summary

| Test Suite | Description |
|------------|-------------|
| `auth.spec.ts` | Authentication flows |
| `articles.spec.ts` | Article CRUD operations |
| `categories.spec.ts` | Category management |
| `team.spec.ts` | Team collaboration |
| `analytics.spec.ts` | Analytics dashboard |
| `settings.spec.ts` | KB settings |
| `public-search.spec.ts` | Public help center |
| `article-versioning.spec.ts` | Version history |
| `permissions.test.ts` | Backend permission logic |

---

## Production Deployment

### Deploying on Replit

1. Click "Deploy" in the Replit interface
2. Configure your deployment settings
3. Set production environment variables

### Deploying on Other Platforms

#### Vercel / Railway / Render

1. Connect your Git repository
2. Set build command: `npm run build`
3. Set start command: `npm start`
4. Configure environment variables in the dashboard

#### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 5000
ENV NODE_ENV=production

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t knowledge-base .
docker run -p 5000:5000 --env-file .env knowledge-base
```

#### Kubernetes / ECS

Use the Docker image with your orchestration platform of choice. Ensure:
- Health check endpoint: `GET /api/health` (you may need to add this)
- Readiness probe: Check database connectivity
- Resource limits: 512MB RAM minimum recommended

---

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React context providers
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility functions
│   │   └── pages/          # Page components
├── server/                 # Backend Express server
│   ├── routes.ts           # API route handlers
│   ├── storage.ts          # Database operations
│   ├── replitAuth.ts       # Authentication logic
│   └── objectStorage.ts    # File upload handling
├── shared/                 # Shared code (types, schema)
│   └── schema.ts           # Drizzle ORM schema
├── tests/                  # Test suites
│   ├── e2e/                # Playwright E2E tests
│   └── integration/        # Vitest integration tests
├── migrations/             # Database migrations
└── public/                 # Static assets
```

---

## Troubleshooting

### Common Issues

#### "DATABASE_URL not found"

Ensure your `.env` file exists and contains `DATABASE_URL`. Restart the dev server after changes.

#### "OIDC Discovery Failed"

Check that `ISSUER_URL` is correct and the OIDC provider is accessible. For local development without OIDC, consider implementing a mock auth strategy.

#### "Cannot connect to database"

1. Verify PostgreSQL is running
2. Check connection string format
3. Ensure SSL mode matches your database (use `?sslmode=disable` for local PostgreSQL)

#### "Port 5000 already in use"

```bash
# Find and kill the process
lsof -i :5000
kill -9 <PID>
```

#### Database Schema Out of Sync

```bash
# Force push schema (use carefully in development only)
npm run db:push
```

### Getting Help

- Check existing issues in the repository
- Review the `replit.md` for architecture details
- Consult the Drizzle ORM documentation for database questions
- Review Playwright docs for E2E testing issues

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm run check && npx vitest run`
5. Submit a pull request

Please ensure all tests pass before submitting PRs.

---

## License

[Add your license here]
