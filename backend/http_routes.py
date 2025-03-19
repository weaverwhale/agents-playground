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
from agent import Runner, moby_agent
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
    
    # Create a task to process the agent's response
    process_task = asyncio.create_task(
        Runner.run(
            moby_agent,
            input_list,
            context=stream_context
        )
    )
    
    try:
        # Wait for the process to complete
        result = await process_task
        
        # Format the response safely
        try:
            response_content = format_agent_response(result.final_output)
        except Exception as format_error:
            # If there's an error formatting the output, return a simpler response
            if hasattr(result, 'final_output') and result.final_output is not None:
                response_content = str(result.final_output)
            else:
                response_content = "I'm sorry, I wasn't able to generate a proper response."
        
        # Store the full response for chat history
        full_response = response_content
        
        # First yield a thinking message
        yield f"data: {{\"type\": \"loading\", \"content\": \"Generating response...\"}}\n\n"
        
        # Split the response into words to simulate token-by-token generation
        words = response_content.split()
        chunks = []
        
        # Create chunks of approximately 5-10 words
        chunk_size = min(max(len(words) // 10, 5), 10)  # Between 5-10 words per chunk
        if chunk_size < 1:
            chunk_size = 1
            
        for i in range(0, len(words), chunk_size):
            end = min(i + chunk_size, len(words))
            chunk = ' '.join(words[i:end])
            chunks.append(chunk)
        
        # Keep track of accumulated text to send progressive updates
        accumulated_text = ""
        
        # Stream each chunk with a small delay between them
        for chunk in chunks:
            accumulated_text += chunk + " "
            
            # Send the accumulated text so far
            yield f"data: {{\"type\": \"partial\", \"content\": {json.dumps(accumulated_text.strip())}}}\n\n"
            
            # Add a slight delay between chunks
            await asyncio.sleep(0.05)
        
        # Send the final completed message
        yield f"data: {{\"type\": \"content\", \"content\": {json.dumps(full_response)}}}\n\n"
        
        # Add assistant response to chat history
        state.add_message_to_history(user_id, "assistant", full_response, get_timestamp())
        
    except Exception as e:
        error_message = f"Sorry, I encountered an error: {str(e)}"
        state.add_message_to_history(user_id, "assistant", error_message, get_timestamp())
        yield f"data: {{\"type\": \"error\", \"content\": {json.dumps(error_message)}}}\n\n"

# API endpoints
@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream a response from Moby Ecommerce Assistant"""
    return StreamingResponse(
        stream_agent_response(request.user_id, request.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream"
        }
    )

@router.post("/chat")
async def chat(request: ChatRequest):
    """Get a non-streaming response from Moby Ecommerce Assistant"""
    user_id = request.user_id
    message = request.message
    
    # Initialize or get user context
    context = state.get_or_create_user_context(user_id)
    
    # Add user message to chat history
    timestamp = get_timestamp()
    state.add_message_to_history(user_id, "user", message, timestamp)
    
    # Prepare input for the agent using chat history
    input_list = state.format_history_for_agent(user_id)
    if not input_list:
        input_list = message
    
    try:
        # Process the message with the agent
        result = await Runner.run(
            moby_agent, 
            input_list, 
            context=context
        )
        
        # Format the response safely
        try:
            response_content = format_agent_response(result.final_output)
        except Exception as format_error:
            # If there's an error formatting the output, return a simpler response
            if hasattr(result, 'final_output') and result.final_output is not None:
                response_content = str(result.final_output)
            else:
                response_content = "I'm sorry, I wasn't able to generate a proper response."
        
        # Add assistant response to chat history
        state.add_message_to_history(user_id, "assistant", response_content, get_timestamp())
        
        return ChatResponse(message=response_content, thread_id=str(uuid.uuid4()))
        
    except Exception as e:
        error_message = f"Sorry, I encountered an error: {str(e)}"
        state.add_message_to_history(user_id, "assistant", error_message, get_timestamp())
        return ChatResponse(message=error_message, thread_id=str(uuid.uuid4()))

@router.get("/chat/{user_id}/history")
async def get_chat_history_http(user_id: str):
    """Get the chat history for a user"""
    return {"messages": state.get_chat_history(user_id)}

@router.delete("/chat/{user_id}")
async def clear_chat_history_http(user_id: str):
    """Clear the chat history for a user"""
    state.clear_chat_history(user_id)
    return {"status": "success", "message": "Chat history cleared"} 