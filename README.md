[![Coverage Status](https://coveralls.io/repos/github/timolegros/railway-git-releaser/badge.svg?branch=main)](https://coveralls.io/github/timolegros/railway-git-releaser?branch=main) [![CI Tests](https://github.com/timolegros/railway-git-releaser/actions/workflows/coverage.yml/badge.svg)](https://github.com/timolegros/railway-git-releaser/actions/workflows/coverage.yml) ![GitHub repo size](https://img.shields.io/github/repo-size/timolegros/railway-git-releaser)

## Description

This repository contains a **Railway Git Releaser** service that provides centralized release management for multi-service deployments. It enables you to implement Heroku-style release phases that ensure atomic deployments across multiple services.

### What Problem Does This Solve?

When deploying multiple services on Railway, you often need to run shared operations (like database migrations, asset compilation, or configuration updates) before any service can be safely deployed. Railway's native `preDeployCommands` run independently on each service, which can lead to:

- **Race conditions** between services
- **Partial deployments** where some services deploy before migrations complete
- **Inconsistent states** when release steps fail for some services but not others
- **No coordination** between related services

### How This Service Helps

The Railway Git Releaser acts as a **centralized release coordinator** that:

1. **Receives release requests** from your services via API
2. **Queues and processes releases** one at a time to prevent conflicts
3. **Executes your release scripts** in a controlled environment
4. **Tracks release status** and provides monitoring capabilities
5. **Ensures atomic deployments** - all services wait for the release to complete

### Example Scenario

Imagine you have a web app with:
- **Frontend service** (React app)
- **Backend service** (API server) 
- **Database** (PostgreSQL)

Before deploying either service, you need to:
1. Run database migrations
2. Build and compile frontend assets
3. Update shared configuration

With this service, you can:
- Trigger a release for a specific commit
- Run all pre-deployment steps in a controlled manner
- Only deploy services after the release succeeds
- Prevent deployment if any step fails

This ensures your entire application stack deploys atomically and consistently.

## How it works

This service provides a centralized release management system with the following key features:

### Core Architecture
- **API-driven releases**: Expose REST endpoints to trigger, queue, and monitor releases
- **SQLite database**: Persistent storage for release state and queue management
- **Git integration**: Clone repositories at specific commits and execute release commands
- **Timeout protection**: Configurable timeouts to prevent stuck releases
- **Crash recovery**: Automatic cleanup of stuck releases on service restart

### Release Flow
1. **Request received**: API endpoint receives release request with commit SHA
2. **Lock acquisition**: System attempts to acquire global release lock
3. **Queue management**: If another release is running, request is queued
4. **Execution**: Release script is executed
5. **State tracking**: Release status is tracked throughout the process
6. **Cleanup**: Queue is processed and next release is triggered automatically

### Database Schema
The system uses two main tables:
- **`release_log`**: Tracks all release attempts with status, timing, and metadata

### Environment Variables
- `RELEASER_GIT_URL`: Repository URL to clone
- `RELEASER_RELEASE_COMMAND`: Command to execute inside the cloned repository
- `RELEASE_TIMEOUT_MS`: Maximum execution time (default: 30 minutes)
- `DEFAULT_CLEANUP_DAYS`: Days to keep old records (default: 30)
- `SQLITE_DB_PATH`: Database file path (default: database.sqlite)

## Getting Started

### 1. Setup the Service

1. **Install the template** in your Railway project
2. **Configure environment variables**:
   ```bash
   RELEASER_GIT_URL=https://github.com/your-org/your-repo.git
   RELEASER_RELEASE_COMMAND="./scripts/release.sh"
   RELEASE_TIMEOUT_MS=1800000  # 30 minutes
   ```

### 2. Create Release Scripts

Create a release script in your repository (e.g., `scripts/release.sh`):
```bash
#!/bin/bash
set -e

echo "Starting release process..."

# Run database migrations
echo "Running migrations..."
npm run migrate

# Build assets
echo "Building assets..."
npm run build

# Run tests
echo "Running tests..."
npm test

echo "Release completed successfully!"
```

### 3. Create a pre-deploy script

Create a pre-deploy script (in your repository) that triggers releases:
```bash
#!/bin/bash

# Trigger release for current commit
curl -X POST "https://your-releaser-service.railway.app/queue" \
  -H "Content-Type: application/json" \
  -d "{\"commitSha\": \"$RAILWAY_GIT_COMMIT_SHA\"}"

# Wait for release to complete
while true; do
  STATUS=$(curl -s "https://your-releaser-service.railway.app/release?commit-sha=$RAILWAY_GIT_COMMIT_SHA" | jq -r '.state')
  
  if [ "$STATUS" = "success" ]; then
    echo "Release completed successfully!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Release failed!"
    exit 1
  fi
  
  echo "Release status: $STATUS, waiting..."
  sleep 10
done
```

### 4. Run your pre-deploy script

Set the `preDeployCommand` for all services that depend on the atomic release to run the script you created in step 3.

### Routes

The service exposes the following REST API endpoints:

#### `GET /healthcheck`
Health check endpoint that returns a 200 OK status if the service is running. No JSON body is returned.

**Response:**
```
Status: 200 OK
(No body)
```

**Error Codes:**
- `500` - Internal server error

---

#### `POST /queue`
Queue a new release for a specific commit SHA.

**Request Body:**
```json
{
  "commitSha": "abc1234"
}
```

**Response (200 - Release started immediately):**
```json
{
  "message": "Release triggered for commit abc1234",
  "state": "running"
}
```

**Response (202 - Release queued):**
```json
{
  "message": "Release for commit abc1234 has been queued",
  "state": "queued"
}
```

**Response (409 - Release already running):**
```json
{
  "error": "Release for commit abc1234 is already running",
  "state": "running"
}
```

**Error Codes:**
- `400` - Missing commitSha or invalid commit SHA format
- `409` - Release already running
- `500` - Internal server error

---

#### `DELETE /queue/:commitSha`
Cancel a queued release for a specific commit SHA.

**Response (200):**
```json
{
  "message": "Release for commit abc1234 removed from queue"
}
```

**Response (409 - Cannot cancel running release):**
```json
{
  "error": "Cannot cancel a running release",
  "state": "running"
}
```

**Error Codes:**
- `400` - Missing commit SHA
- `409` - Cannot cancel running release
- `500` - Internal server error

---

#### `GET /queue`
Get the current status of the release queue.

**Response:**
```json
{
  "isRunning": false,
  "queueLength": 2,
  "queue": [
    {
      "git_commit_sha": "abc1234",
      "queued_at": "2024-01-01T12:00:00.000Z"
    },
    {
      "git_commit_sha": "def5678",
      "queued_at": "2024-01-01T12:01:00.000Z"
    }
  ]
}
```

**Error Codes:**
- `500` - Internal server error

---

#### `GET /release`
Get the release state for a specific commit SHA.

**Query Parameters:**
- `commitSha` (required) - The commit SHA to check

**Response:**
```json
{
  "commitSha": "abc1234",
  "state": "success",
  "details": {
    "release_status": "success",
    "created_at": "2024-01-01T12:00:00.000Z",
    "updated_at": "2024-01-01T12:05:00.000Z",
    "started_at": "2024-01-01T12:00:00.000Z",
    "ended_at": "2024-01-01T12:05:00.000Z"
  }
}
```

**Error Codes:**
- `400` - Missing commit-sha parameter
- `500` - Internal server error

---

#### `GET /metrics`
Get release metrics for the specified number of days.

**Query Parameters:**
- `days` (optional) - Number of days to include in metrics (default: 7)

**Response:**
```json
{
  "period": "7 days",
  "metrics": [
    {
      "release_status": "success",
      "count": 10,
      "avg_duration_minutes": 5.2
    },
    {
      "release_status": "failed",
      "count": 2,
      "avg_duration_minutes": 3.1
    }
  ]
}
```

**Error Codes:**
- `500` - Internal server error

---

#### `POST /cleanup`
Manually trigger cleanup of old release records.

**Request Body:**
```json
{
  "days": 30
}
```

**Response:**
```json
{
  "message": "Cleanup completed for releases older than 30 days"
}
```

**Error Codes:**
- `500` - Internal server error

---



## Security

**Important:** The Railway Git Releaser API is publicly exposed (though not accessible) by default. This is because Railway pre-deploy steps do not have access to private networks, so the API must be reachable from the public internet for release coordination to work.

### Recommendations
- **API key protection:** The service requires API key authentication for all routes except `/healthcheck`. Set the `API_KEY` environment variable on all services that need to interact with the releaser.
- **Restrict access:** If you are using an API gateway (such as NGINX), it is highly recommended to configure a whitelist of IPs that can access the releaser service. This typically requires enabling static outbound IPs on Railway for the services that will make API calls to the releaser.
- **Minimal healthcheck exposure:** The `/healthcheck` route is intentionally minimal and does not return any sensitive data—only a 200 OK status code.

**Note:** The API is public by design to support Railway's deployment model. Take appropriate steps to secure your deployment in production environments.

## Development

### Prerequisites
- Node.js 18+
- SQLite3
- Git

### Local Development
```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev
```

### Testing
The project includes comprehensive tests for:
- API endpoints
- Database operations
- Release lifecycle
- Queue management
- Error handling

Run tests with coverage:
```bash
npm run test:coverage
```

# Roadmap
1. Publish v1 of the Docker image to GHCR
2. Build and publish template on Railway
3. Get to 90+ percent test coverage
4. Add support for private repositories for release scripts
5. Support multiple service groups (groups of dependent services that need to deploy atomically)
    - Adds support for multiple git repositories as sources for release scripts
6. Add support for arbitrary runtimes (Deno, Bun, etc)
7. Move npm cache to volume