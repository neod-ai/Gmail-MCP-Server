#!/bin/bash

echo "Starting Gmail MCP Server for Cloud Run..."

# Set up OAuth credentials from environment variables if provided
if [ -n "$OAUTH_CREDENTIALS" ]; then
    echo "Setting up OAuth credentials from environment variable..."
    echo "$OAUTH_CREDENTIALS" > /app/gcp-oauth.keys.json
    echo "OAuth credentials file created successfully"
else
    echo "Warning: OAUTH_CREDENTIALS environment variable not set"
    # Try to use local file if it exists
    if [ ! -f "/app/gcp-oauth.keys.json" ]; then
        echo "Error: No OAuth credentials found"
        exit 1
    fi
fi

# Verify the credentials file is valid JSON
if ! jq empty /app/gcp-oauth.keys.json 2>/dev/null; then
    echo "Error: Invalid JSON in OAuth credentials file"
    exit 1
fi

echo "OAuth credentials configured successfully"

# Start the server
echo "Starting HTTP server..."
exec node dist/http-server.js
