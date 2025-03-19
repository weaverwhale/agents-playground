"""
Utility functions for the Triple Whale agent system.
"""
import sys
import uuid
import json
import os
from datetime import datetime
from typing import Any, Dict, Optional

# Global log level - can be DEBUG, INFO, WARNING, ERROR
# Default to INFO, but can be overridden by environment variable
LOG_LEVEL = os.getenv('LOG_LEVEL', 'WARNING').upper()

def log(message, level='INFO'):
    """Print a message to stdout and flush the buffer immediately, respecting log level."""
    # Convert level to uppercase for comparison
    level = level.upper()
    
    # Define log level priorities (higher number = more important)
    log_priorities = {
        'DEBUG': 0,
        'INFO': 1,
        'WARNING': 2,
        'ERROR': 3
    }
    
    # Only print if the message's level is at least as important as the global log level
    if log_priorities.get(level, 0) >= log_priorities.get(LOG_LEVEL, 1):
        # Format with level if not INFO (default)
        if level != 'INFO':
            print(f"[{level}] {message}")
        else:
            print(message)
        sys.stdout.flush()

def format_agent_response(output):
    """Format the agent's response in a consistent way."""
    # Handle None case
    if output is None:
        return "I don't have a specific response for that query."
        
    # Check if output is a Pydantic model and convert to dict
    if hasattr(output, "model_dump"):
        output = output.model_dump()
    elif hasattr(output, "dict"):  # Support for older pydantic versions
        output = output.dict()
    
    # Handle dictionary output
    if isinstance(output, dict):
        if "message" in output:
            return output["message"]
        elif "response" in output:
            return output["response"]
        elif "content" in output:
            return output["content"]
        # Return JSON string if no specific fields found
        return json.dumps(output)
    
    # Default: return as string
    return str(output)
    
def get_timestamp():
    """Get current timestamp in a consistent format."""
    return datetime.now().strftime("%I:%M %p") 