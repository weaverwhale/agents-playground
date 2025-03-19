FROM node:20-slim AS frontend-build

WORKDIR /app

# Set environment variables to avoid architecture-specific build issues
ENV ROLLUP_SKIP_NODE_RESOLUTION=true
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NODE_ENV=production
# Skip architecture-specific rollup binaries
ENV ROLLUP_SKIP_BUNDLING=true

# Install TypeScript globally
RUN npm install -g typescript

# Copy the root package.json and package-lock.json
COPY package.json package-lock.json* ./

# Install root dependencies
RUN npm install

# Copy frontend files including package.json
COPY frontend ./frontend/
COPY .env* .nvmrc ./

# Install frontend dependencies (including dev dependencies needed for build)
RUN npm run install:frontend:prod

# Build frontend with specific configuration for Docker
RUN npm run build:frontend

# Python layer for production
FROM python:3.9-slim

WORKDIR /app

# Install Node.js for running the application
RUN apt-get update && apt-get install -y \
    curl \
    && curl -sL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && echo "Node version: $(node --version)" \
    && echo "NPM version: $(npm --version)"

# Copy package files for production
COPY package.json ./
RUN npm install --omit=dev --no-package-lock

# Copy backend code
COPY backend ./backend/
COPY .env* .nvmrc ./

# Copy frontend build artifacts from frontend-build stage
COPY --from=frontend-build /app/frontend/dist ./frontend/dist/

# Install Python dependencies
RUN pip3 install --no-cache-dir -r backend/requirements.txt

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PORT=9876

# Expose backend port
EXPOSE 9876

# Start the application in production mode
CMD ["npm", "run", "start:prod"] 