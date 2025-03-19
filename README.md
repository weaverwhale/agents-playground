# 🕵️ Agent Playground

This project provides a chat interface to interact with an AI agent.

## 🏗️ Project Structure

- **Backend**: FastAPI-based streaming API endpoint for the AI agent, offering http, SSR, and Socket.io endpoints
- **Frontend**: React-based chat interface using Socket.io for real-time communication

## 🚀 Setup and Installation

### 📋 Prerequisites

- Python 3.9+ for the backend
- Node.js v20+ and npm for the frontend

### 🔧 Setup

```bash
nvm use && npm run setup
```

### ▶️ Start the application

```bash
npm run start
```

### 🌐 Accessing the Application

Once running, access the application at:

- http://localhost:9876 (frontend and backend served from the same port)

## 🐋 Docker Support

You can run the application using Docker, which simplifies setup and eliminates the need to install dependencies directly on your machine.

### 📋 Prerequisites for Docker

- Docker and Docker Compose installed on your system
- An OpenAI API key (can be set in your .env file)

### 🛠️ Running with Docker

We provide a convenience script for running the application with Docker:

```bash
# Run with Docker
./docker-run.sh --build

# Clean up Docker resources
./docker-run.sh --clean

# Stop running containers
./docker-run.sh --stop

# Get help
./docker-run.sh --help
```

Alternatively, you can use Docker Compose directly:

```bash
# Build and run
docker-compose build app
docker-compose up app
```

## 🔧 Troubleshooting Docker Issues

### 🔒 Permission Issues

If you encounter permission issues:

```bash
# Fix permissions on the script
chmod +x docker-run.sh
```
