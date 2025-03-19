"""
State management for the Triple Whale agent system.
"""
from typing import Dict, List, Any
import asyncio
from models import UserContext

# User context storage
user_contexts: Dict[str, Dict[str, Any]] = {}
chat_histories: Dict[str, List[Dict[str, Any]]] = {}

# Track active generation tasks - for cancellation
active_tasks: Dict[str, List[asyncio.Task]] = {}

def get_or_create_user_context(user_id: str) -> Dict[str, Any]:
    """Initialize user context if not exists and return it."""
    if user_id not in user_contexts:
        user_contexts[user_id] = {"user_id": user_id}
        chat_histories[user_id] = []
    
    return user_contexts[user_id]

def add_message_to_history(user_id: str, role: str, content: str, timestamp: str):
    """Add a message to the user's chat history."""
    if user_id not in chat_histories:
        chat_histories[user_id] = []
    
    chat_histories[user_id].append({
        "role": role,
        "content": content,
        "timestamp": timestamp
    })

def clear_chat_history(user_id: str):
    """Clear a user's chat history."""
    if user_id in chat_histories:
        chat_histories[user_id] = []

def get_chat_history(user_id: str) -> List[Dict[str, Any]]:
    """Get a user's chat history."""
    if user_id not in chat_histories:
        return []
    
    return chat_histories[user_id]

def format_history_for_agent(user_id: str):
    """Format chat history for input to the agent."""
    if user_id not in chat_histories or len(chat_histories[user_id]) <= 0:
        return None
    
    # Convert chat history to input list format for the agent
    input_list = []
    for msg in chat_histories[user_id]:
        if msg["role"] in ["user", "assistant"]:  # Skip system messages
            input_list.append({"role": msg["role"], "content": msg["content"]})
    
    return input_list

def register_active_task(sid: str, task: asyncio.Task):
    """Register an active task for a session."""
    if sid not in active_tasks:
        active_tasks[sid] = []
    active_tasks[sid].append(task)

def cancel_active_tasks(sid: str) -> bool:
    """Cancel all active tasks for a session."""
    if sid in active_tasks and active_tasks[sid]:
        # Cancel all active tasks for this session
        for task in active_tasks[sid]:
            task.cancel()
        active_tasks[sid] = []
        return True
    return False

def remove_active_task(sid: str, task: asyncio.Task):
    """Remove a task from active tasks."""
    if sid in active_tasks:
        active_tasks[sid] = [t for t in active_tasks[sid] if t != task] 