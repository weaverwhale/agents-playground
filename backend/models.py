"""
Pydantic models for the Triple Whale agent system.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime

class Message(BaseModel):
    """Model for a chat message"""
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    """Model for a chat request"""
    user_id: str
    message: str

class ChatResponse(BaseModel):
    """Model for a chat response"""
    message: str
    thread_id: str

class UserContext(BaseModel):
    """Model for user context"""
    user_id: str
    # Additional fields can be added as needed
    
    class Config:
        extra = "allow"  # Allow additional fields not defined in the model 