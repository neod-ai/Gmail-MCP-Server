FROM node:20-slim

# Install jq for JSON parsing
RUN apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev --ignore-scripts

# Copy source files and build configuration
COPY tsconfig.json ./
COPY src ./src
COPY start-server.sh ./

# Install dev dependencies for build
RUN npm install typescript --save-dev

# Build the application
RUN npm run build

# Make start script executable
RUN chmod +x start-server.sh

# Create directory for credentials
RUN mkdir -p /gmail-server

# Set environment variables
ENV NODE_ENV=production
ENV USE_USER_CREDENTIALS=true
ENV DEBUG_USER_AUTH=false
ENV PORT=8080

# Expose port for OAuth flow (Cloud Run uses PORT env var)
EXPOSE $PORT

# Set entrypoint command
ENTRYPOINT ["./start-server.sh"]