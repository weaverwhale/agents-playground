#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Function to display help
show_help() {
    echo "Usage: ./docker-run.sh [OPTION]"
    echo "Run the agents-playground application in Docker"
    echo ""
    echo "Options:"
    echo "  --build           Build the Docker image before starting"
    echo "  --clean           Remove containers and images before starting"
    echo "  --stop            Stop running containers"
    echo "  --help            Display this help and exit"
}

# Default values
BUILD=false
CLEAN=false
STOP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build)
            BUILD=true
            ;;
        --clean)
            CLEAN=true
            ;;
        --stop)
            STOP=true
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
    shift
done

# Stop running containers if requested
if [ "$STOP" = true ]; then
    echo "Stopping containers..."
    docker-compose down
    exit 0
fi

# Clean up if requested
if [ "$CLEAN" = true ]; then
    echo "Cleaning up containers and images..."
    docker-compose down
    docker system prune -f
fi

# Build if requested
if [ "$BUILD" = true ]; then
    echo "Building Docker image..."
    docker-compose build app
fi

# Run application
echo "Starting application..."
docker-compose up app 