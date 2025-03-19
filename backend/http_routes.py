"""
HTTP routes for the Triple Whale agent API.
"""
import uuid
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio
from datetime import datetime

from models import ChatRequest, ChatResponse
from agent import CustomRunner, moby_agent
from utils import format_agent_response, log, get_timestamp
import state

# Create a router
router = APIRouter()

# Streaming response function for HTTP API
async def stream_agent_response(user_id: str, message: str):
    context = state.get_or_create_user_context(user_id)
    
    # Add user message to chat history
    timestamp = get_timestamp()
    state.add_message_to_history(user_id, "user", message, timestamp)
    
    # Prepare input for the agent using chat history
    input_list = state.format_history_for_agent(user_id)
    if not input_list:
        input_list = message
    
    # First yield a thinking message
    yield f"data: {{\"type\": \"loading\", \"content\": \"Processing your request...\"}}\n\n"
    
    # Create a modified context for HTTP streaming
    stream_context = dict(context or {})
    
    # Reset tool notification tracking for this run - using a dictionary now instead of a set
    stream_context['sent_tool_notifications'] = {}
    
    # Create a task to process the agent's response
    process_task = asyncio.create_task(
        CustomRunner.run(
            moby_agent,
            input_list,
            context=stream_context
        )
    )
    
    # Wait for the task to complete, capturing any exceptions
    try:
        result = await process_task
        
        # Format the response safely
        try:
            response_content = format_agent_response(result.final_output)
        except Exception as format_error:
            # If there's an error formatting the output, return a simpler response
            log(f"Error formatting response: {str(format_error)}")
            if hasattr(result, 'final_output') and result.final_output is not None:
                response_content = str(result.final_output)
            else:
                response_content = "I'm sorry, I wasn't able to generate a proper response."
        
        # Send a short thinking message
        yield f"data: {{\"type\": \"loading\", \"content\": \"Preparing response...\"}}\n\n"
        
        # Split the response into words to simulate token-by-token generation
        words = response_content.split()
        accumulated_text = ""
        
        # Stream each word with a minor delay
        for i, word in enumerate(words):
            accumulated_text += word + " "
            
            # Send partial update for each chunk of words (simulate token streaming)
            if i % 5 == 0 or i == len(words) - 1:
                yield f"data: {{\"type\": \"partial\", \"content\": \"{accumulated_text.strip()}\"}}\n\n"
                await asyncio.sleep(0.05)  # Small delay between chunks
        
        # Send the final completed message
        yield f"data: {{\"type\": \"content\", \"content\": \"{response_content}\"}}\n\n"
        
        # Add to chat history
        state.add_message_to_history(user_id, "assistant", response_content, get_timestamp())
        
    except Exception as e:
        # Handle errors
        error_msg = f"Error processing your request: {str(e)}"
        log(f"Error: {error_msg}", "ERROR")
        yield f"data: {{\"type\": \"error\", \"content\": \"{error_msg}\"}}\n\n"
        
        # Add error message to chat history
        state.add_message_to_history(
            user_id, 
            "system", 
            error_msg,
            get_timestamp()
        )

# Define the HTTP API routes
@router.post("/chat")
async def chat(request: ChatRequest):
    """
    Handle chat request via HTTP API
    """
    try:
        # Process the chat request
        return StreamingResponse(
            stream_agent_response(request.user_id, request.message),
            media_type="text/event-stream"
        )
    except Exception as e:
        log(f"Error in /chat endpoint: {str(e)}", "ERROR")
        return {"error": str(e)}

@router.get("/health")
async def health_check():
    """
    Health check endpoint to verify the API is running properly
    """
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@router.get("/chat/{user_id}/history")
async def get_chat_history_http(user_id: str):
    """Get the chat history for a user"""
    return {"messages": state.get_chat_history(user_id)}

@router.delete("/chat/{user_id}")
async def clear_chat_history_http(user_id: str):
    """Clear the chat history for a user"""
    state.clear_chat_history(user_id)
    return {"status": "success", "message": "Chat history cleared"} 