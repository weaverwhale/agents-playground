"""
Main entry point for the Triple Whale agent system.
"""
import os
import sys
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Add the current directory to the Python path to ensure imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils import log
from http_routes import router as http_router
from socket_routes import register_socketio_handlers

# Load environment variables from .env file
load_dotenv()

# Explicitly set the OpenAI API key in the environment
openai_api_key = os.getenv('OPENAI_API_KEY')
if openai_api_key:
    os.environ['OPENAI_API_KEY'] = openai_api_key
else:
    log("WARNING: No OpenAI API key found in environment!")

# Create a FastAPI app
app = FastAPI(title="Moby Ecommerce Assistant API")

# Add CORS middleware to the FastAPI app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add routes to the FastAPI app
app.include_router(http_router)

# Create Socket.IO server with explicit CORS configuration
sio = socketio.AsyncServer(
    async_mode='asgi', 
    cors_allowed_origins='*',
    logger=False,  # Disable logging
    engineio_logger=False  # Disable Engine.IO logging
)

# Register Socket.IO event handlers
register_socketio_handlers(sio)

# Create Socket.IO ASGI app and mount it on the FastAPI app
socket_app = socketio.ASGIApp(sio, app)

# This is the ASGI application to run
application = socket_app

# Run the API if this script is executed directly
if __name__ == "__main__":
    import uvicorn
    
    # Get the port from environment variable or default to 9876
    port = int(os.getenv("PORT", 9876))
    log(f"Starting server on port {port}")
    
    # Print diagnostic information
    log(f"Python version: {sys.version}")
    log(f"Python path: {sys.path}")
    
    # Run the application with uvicorn
    uvicorn.run(
        "app:application", 
        host="0.0.0.0", 
        port=port, 
        reload=True, 
        log_level="error",  # Only show error logs
        access_log=False,   # Disable access logs
        reload_dirs=["backend"]  # Only watch this directory for changes
    ) 