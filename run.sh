#!/bin/bash

# Colors for better readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Travel Agent Chat Application ===${NC}"

# Check for Python
if ! command -v python3 &> /dev/null
then
    echo -e "${YELLOW}Python 3 is required but not found. Please install Python 3.${NC}"
    exit 1
fi

# Check for Node.js and npm
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null
then
    echo -e "${YELLOW}Node.js and npm are required but not found. Please install Node.js and npm.${NC}"
    exit 1
fi

# Function to check and install Python dependencies
setup_python() {
    echo -e "${BLUE}Setting up Python environment...${NC}"
    
    # Check if virtual environment exists
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    if [ -d "venv/bin" ]; then
        source venv/bin/activate
    else
        source venv/Scripts/activate
    fi
    
    # Install dependencies
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
}

# Function to check and install Node.js dependencies
setup_node() {
    echo -e "${BLUE}Setting up Node.js environment...${NC}"
    
    # Install root dependencies
    npm install
    
    # Install frontend dependencies
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
}

# Setup function
setup() {
    setup_python
    setup_node
    echo -e "${GREEN}Setup completed successfully!${NC}"
}

# Run function
run() {
    echo -e "${BLUE}Starting the Travel Agent Chat Application...${NC}"
    echo -e "${YELLOW}The backend will run at http://localhost:8000${NC}"
    echo -e "${YELLOW}The frontend will run at http://localhost:3000${NC}"
    
    # Activate virtual environment if it exists
    if [ -d "venv/bin" ]; then
        source venv/bin/activate
    elif [ -d "venv/Scripts" ]; then
        source venv/Scripts/activate
    fi
    
    # Run the application using concurrently
    npm start
}

# Parse arguments
case "$1" in
    setup)
        setup
        ;;
    run)
        run
        ;;
    *)
        # If no argument or unrecognized, run setup and then run
        echo -e "${BLUE}Running complete setup and startup...${NC}"
        setup
        run
        ;;
esac 