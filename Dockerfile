FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev --ignore-scripts

# Copy source files and build configuration
COPY tsconfig.json ./
COPY src ./src
COPY gcp-oauth.keys.json ./

# Install dev dependencies for build
RUN npm install typescript --save-dev

# Build the application
RUN npm run build

# Create directory for credentials
RUN mkdir -p /gmail-server

# Set environment variables
ENV NODE_ENV=production
ENV USE_USER_CREDENTIALS=true
ENV DEBUG_USER_AUTH=false

# Expose port for OAuth flow
EXPOSE 3000

# Set entrypoint command
ENTRYPOINT ["node", "dist/index.js"]