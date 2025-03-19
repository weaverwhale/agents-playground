import uuid
import json
import sys
from datetime import datetime
from typing import Optional
import os
import asyncio
import socketio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

# Load environment variables from .env file
load_dotenv()

# Explicitly set the OpenAI API key in the environment
openai_api_key = os.getenv('OPENAI_API_KEY')
if openai_api_key:
    os.environ['OPENAI_API_KEY'] = openai_api_key

# Import tools
from tw_tools import (
    moby,
    search_web,
)

from agents import Runner, Agent

# Create a simplified Runner class that just passes context to tools
class SimpleRunner(Runner):
    @classmethod
    async def run(cls, agent, input, context=None, sid=None, socket=None):
        # Make a copy of the original context or create a new one
        run_context = dict(context or {})
        
        # Add socket and sid to context if provided
        if socket and sid:
            run_context['socket'] = socket
            run_context['sid'] = sid
        
        print(f"Starting run with agent: {agent.name}")
        
        try:
            result = await Runner.run(agent, input, context=run_context)
            print(f"Agent run completed")
            return result
        except Exception as e:
            print(f"Error in Runner.run: {str(e)}")
            sys.stdout.flush()
            raise

# Get model from environment or use default
model = os.getenv('MODEL_CHOICE', 'gpt-4o-mini')

# Create Moby - an ecommerce assistant agent with the approved tools
moby_agent = Agent(
    name="Moby",
    instructions="""
    You are Moby 🐳, an assistant for e-commerce and marketing strategies on Triple Whale. Your users are marketing professionals and e-commerce managers. 
    Your mission is to assist without revealing your AI origins or internal reasoning. 
    You will use Consultative/Expert Mode, Professional and Encouraging, and Concise and Insight-numbers Driven in your responses to align with the user's communication preferences. 
    You never generate generic response.
    
    You can provide personalized product recommendations, help users find the best deals, 
    track orders, answer questions about products, and assist with various shopping-related tasks.
    
    You have access to these specific custom tools:
    1. moby: Use this for any e-commerce analytics or insights about products, sales, marketing performance, ROAS, etc.
    2. search_web: Use this to find real-time information about products, prices, reviews from external sources.
    
    Always prefer using tools rather than generating answers from your general knowledge. For most questions, you should use at least one tool to provide accurate, up-to-date information.
    
    Always be helpful, informative, and enthusiastic about helping users find the best products.
    Focus on providing accurate information and making the shopping experience smoother.
    
    When making product recommendations, consider the user's budget, preferences, and past purchases.
    When comparing prices, always try to find the best deals and explain why they're good.
    """,
    model=model,
    tools=[
        moby,
        search_web
    ]
)

# User context storage
user_contexts = {}
chat_histories = {}

# Track active generation tasks - for cancellation
active_tasks = {}

# Create Socket.IO server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

# Create a FastAPI app first
app = FastAPI(title="Moby Ecommerce Assistant API")

# Add CORS middleware to the FastAPI app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for API requests/responses
class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class ChatRequest(BaseModel):
    user_id: str
    message: str

class ChatResponse(BaseModel):
    message: str
    thread_id: str

# Helper function to format agent responses
def format_agent_response(output):
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

# Initialize user context if not exists
def get_or_create_user_context(user_id: str):
    if user_id not in user_contexts:
        user_contexts[user_id] = {"user_id": user_id}
        chat_histories[user_id] = []
    
    return user_contexts[user_id]

# Streaming response function for HTTP API
async def stream_agent_response(user_id: str, message: str):
    context = get_or_create_user_context(user_id)
    chat_history = chat_histories[user_id]
    
    # Add user message to chat history
    timestamp = datetime.now().strftime("%I:%M %p")
    chat_history.append({
        "role": "user",
        "content": message,
        "timestamp": timestamp
    })
    
    # Prepare input for the agent using chat history
    if len(chat_history) > 1:
        # Convert chat history to input list format for the agent
        input_list = []
        for msg in chat_history:
            if msg["role"] in ["user", "assistant"]:  # Skip system messages
                input_list.append({"role": msg["role"], "content": msg["content"]})
    else:
        # First message
        input_list = message
    
    # First yield a thinking message
    yield f"data: {{\"type\": \"loading\", \"content\": \"Processing your request...\"}}\n\n"
    
    # Create a modified context for HTTP streaming
    stream_context = dict(context or {})
    
    # Create a task to process the agent's response
    process_task = asyncio.create_task(
        SimpleRunner.run(
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
        chat_history.append({
            "role": "assistant",
            "content": full_response,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        
    except Exception as e:
        error_message = f"Sorry, I encountered an error: {str(e)}"
        chat_history.append({
            "role": "assistant",
            "content": error_message,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        yield f"data: {{\"type\": \"error\", \"content\": {json.dumps(error_message)}}}\n\n"

# API endpoints (HTTP)
@app.post("/chat/stream")
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

@app.post("/chat")
async def chat(request: ChatRequest):
    """Get a non-streaming response from Moby Ecommerce Assistant"""
    user_id = request.user_id
    message = request.message
    
    # Initialize or get user context
    context = get_or_create_user_context(user_id)
    chat_history = chat_histories[user_id]
    
    # Add user message to chat history
    timestamp = datetime.now().strftime("%I:%M %p")
    chat_history.append({
        "role": "user",
        "content": message,
        "timestamp": timestamp
    })
    
    # Prepare input for the agent using chat history
    if len(chat_history) > 1:
        # Convert chat history to input list format for the agent
        input_list = []
        for msg in chat_history:
            if msg["role"] in ["user", "assistant"]:  # Skip system messages
                input_list.append({"role": msg["role"], "content": msg["content"]})
    else:
        # First message
        input_list = message
    
    try:
        # Process the message with the agent
        result = await SimpleRunner.run(
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
        chat_history.append({
            "role": "assistant",
            "content": response_content,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        
        return ChatResponse(message=response_content, thread_id=str(uuid.uuid4()))
        
    except Exception as e:
        error_message = f"Sorry, I encountered an error: {str(e)}"
        chat_history.append({
            "role": "assistant",
            "content": error_message,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        return ChatResponse(message=error_message, thread_id=str(uuid.uuid4()))

@app.get("/chat/{user_id}/history")
async def get_chat_history_http(user_id: str):
    """Get the chat history for a user"""
    if user_id not in chat_histories:
        return {"messages": []}
    
    return {"messages": chat_histories[user_id]}

@app.delete("/chat/{user_id}")
async def clear_chat_history_http(user_id: str):
    """Clear the chat history for a user"""
    if user_id in chat_histories:
        chat_histories[user_id] = []
    
    return {"status": "success", "message": "Chat history cleared"}

# Create Socket.IO ASGI app and mount it on the FastAPI app
socket_app = socketio.ASGIApp(sio, app)
app = socket_app

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    # Cancel any active tasks for this session
    if sid in active_tasks and active_tasks[sid]:
        for task in active_tasks[sid]:
            task.cancel()
        active_tasks[sid] = []

@sio.event
async def cancel_stream(sid, data):
    """Cancel the stream for a specific user"""
    if sid in active_tasks and active_tasks[sid]:
        # Cancel all active tasks for this session
        for task in active_tasks[sid]:
            task.cancel()
        active_tasks[sid] = []
        
        # Send cancellation confirmation
        await sio.emit('stream_cancelled', {}, room=sid)
        
        # Add cancellation message to chat history
        if 'user_id' in data:
            user_id = data['user_id']
            if user_id in chat_histories:
                timestamp = datetime.now().strftime("%I:%M %p")
                chat_histories[user_id].append({
                    "role": "system",
                    "content": "[Response generation was cancelled]",
                    "timestamp": timestamp
                })
        
        return True
    return False

@sio.event
async def chat_request(sid, data):
    """Handle a chat request via Socket.IO"""
    if not isinstance(data, dict) or 'user_id' not in data or 'message' not in data:
        await sio.emit('error', {'message': 'Invalid request format'}, room=sid)
        return
    
    user_id = data['user_id']
    message = data['message']
    
    # Initialize or get user context
    context = get_or_create_user_context(user_id)
    chat_history = chat_histories[user_id]
    
    # Determine which tool is likely to be used based on the message content
    likely_tool = None
    # Common patterns for ROAS, analytics, marketing questions
    if any(term in message.lower() for term in ['roas', 'analytics', 'sales', 'revenue', 'marketing', 'ads', 'performance']):
        likely_tool = "moby"
    # Common patterns for search or external information
    elif any(term in message.lower() for term in ['search', 'find', 'look up', 'compare', 'reviews', 'prices']):
        likely_tool = "search_web"
    
    # Add user message to chat history
    timestamp = datetime.now().strftime("%I:%M %p")
    chat_history.append({
        "role": "user",
        "content": message,
        "timestamp": timestamp
    })
    
    # Prepare input for the agent using chat history
    if len(chat_history) > 1:
        # Convert chat history to input list format for the agent
        input_list = []
        for msg in chat_history:
            if msg["role"] in ["user", "assistant"]:  # Skip system messages
                input_list.append({"role": msg["role"], "content": msg["content"]})
    else:
        # First message
        input_list = message
    
    # Initial response to let the client know we're processing
    await sio.emit('stream_update', {
        "type": "loading", 
        "content": "Processing your request..."
    }, room=sid)
    
    # IMMEDIATE TOOL NOTIFICATION: Don't wait for the agent to start
    if likely_tool:
        # Send a direct tool notification right away
        await sio.emit('stream_update', {
            "type": "tool",
            "content": f"Using tool: {likely_tool}...",
            "tool": likely_tool
        }, room=sid)
    
    # Create an async task to handle the streaming
    async def process_agent_response():
        try:
            # Emit loading indicator
            await sio.emit('stream_update', {
                "type": "loading", 
                "content": "Generating response..."
            }, room=sid)
            
            # Create a context with socket and sid for the tools
            socket_context = dict(context)
            socket_context['socket'] = sio
            socket_context['sid'] = sid
            
            # Process the message with the agent
            result = await SimpleRunner.run(
                moby_agent, 
                input_list, 
                context=socket_context,
                socket=sio,
                sid=sid
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
            
            # Store the full response for chat history
            full_response = response_content
            
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
                await sio.emit('stream_update', {
                    "type": "partial", 
                    "content": accumulated_text.strip()
                }, room=sid)
                
                # Add a slight delay between chunks
                await asyncio.sleep(0.05)
            
            # Send the final completed message
            await sio.emit('stream_update', {
                "type": "content", 
                "content": full_response
            }, room=sid)
            
            # Add assistant response to chat history
            chat_history.append({
                "role": "assistant",
                "content": full_response,
                "timestamp": datetime.now().strftime("%I:%M %p")
            })
            
            # Remove task from active tasks
            if sid in active_tasks:
                active_tasks[sid] = [t for t in active_tasks[sid] if t != asyncio.current_task()]
                
        except asyncio.CancelledError:
            # Task was cancelled - don't need to do anything else as the cancel_stream handler
            # takes care of sending the appropriate messages
            pass
        except Exception as e:
            error_message = f"Sorry, I encountered an error: {str(e)}"
            await sio.emit('stream_update', {
                "type": "error", 
                "content": error_message
            }, room=sid)
            
            chat_history.append({
                "role": "assistant",
                "content": error_message,
                "timestamp": datetime.now().strftime("%I:%M %p")
            })
            
            # Remove task from active tasks
            if sid in active_tasks:
                active_tasks[sid] = [t for t in active_tasks[sid] if t != asyncio.current_task()]
    
    # Start the task and track it
    task = asyncio.create_task(process_agent_response())
    if sid not in active_tasks:
        active_tasks[sid] = []
    active_tasks[sid].append(task)
    
    # Return acknowledgment
    return {"status": "processing"}

@sio.event
async def get_chat_history(sid, data):
    """Get the chat history for a user via Socket.IO"""
    if not isinstance(data, dict) or 'user_id' not in data:
        await sio.emit('error', {'message': 'Invalid request format'}, room=sid)
        return
    
    user_id = data['user_id']
    if user_id not in chat_histories:
        await sio.emit('chat_history', {"messages": []}, room=sid)
        return
    
    await sio.emit('chat_history', {"messages": chat_histories[user_id]}, room=sid)

@sio.event
async def clear_chat_history(sid, data):
    """Clear the chat history for a user via Socket.IO"""
    if not isinstance(data, dict) or 'user_id' not in data:
        await sio.emit('error', {'message': 'Invalid request format'}, room=sid)
        return
    
    user_id = data['user_id']
    if user_id in chat_histories:
        chat_histories[user_id] = []
    
    await sio.emit('history_cleared', {"status": "success"}, room=sid)

# Run the API
if __name__ == "__main__":
    # Get the port from environment variable or default to 9876
    port = int(os.getenv("PORT", 9876))
    print(f"Starting server on port {port}")
    uvicorn.run("tw_agent:app", host="0.0.0.0", port=port, reload=True) 