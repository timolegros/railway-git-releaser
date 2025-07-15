FROM node:22-slim

# Install git and bash (needed for clone.sh)
RUN apt-get update && apt-get install -y git bash && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy application files
COPY tsconfig.json .
COPY src ./src

# Build the TypeScript application
RUN npm run build

COPY src/database/migrations ./build/database/migrations
COPY src/clone.sh ./build/clone.sh

# Make clone.sh executable
RUN chmod +x build/clone.sh

# Remove dev dependencies to reduce image size
RUN npm prune --production

EXPOSE 8080

CMD ["npm", "start"]
