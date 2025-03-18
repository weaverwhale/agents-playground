import asyncio
import uuid
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn

# Load environment variables from .env file
load_dotenv()

# Explicitly set the OpenAI API key in the environment
openai_api_key = os.getenv('OPENAI_API_KEY')
if openai_api_key:
    os.environ['OPENAI_API_KEY'] = openai_api_key

# Import our tools (only the ones defined in tw_tools.py)
from tw_tools import (
    text_to_sql,
    knowledge_base,
    search_web
)

from agents import Runner, Agent

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
    1. text_to_sql: Use this tool to convert natural language to SQL and query product databases, order information, inventory, etc.
    2. knowledge_base: Use this tool to search for product information, company policies, FAQs, and other structured content.
    3. search_web: Use this tool to find real-time information about products, prices, reviews from external sources. This tool leverages the system's built-in web search capability.
    
    Always be helpful, informative, and enthusiastic about helping users find the best products.
    Focus on providing accurate information and making the shopping experience smoother.
    
    When making product recommendations, consider the user's budget, preferences, and past purchases.
    When comparing prices, always try to find the best deals and explain why they're good.
    """,
    model=model,
    tools=[
        # Use only the tools that actually exist in tw_tools.py
        text_to_sql,
        knowledge_base,
        search_web
    ]
)

# User context storage - in a production app, this would use a database
user_contexts = {}
chat_histories = {}

# FastAPI app
app = FastAPI(title="Moby Ecommerce Assistant API")

# Enable CORS
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

# Streaming response function
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
            input_list.append({"role": msg["role"], "content": msg["content"]})
    else:
        # First message
        input_list = message
    
    # Initial response to let the client know we're processing
    yield f"data: Processing your request...\n\n"
    
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
        chat_history.append({
            "role": "assistant",
            "content": response_content,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        
        # Stream the response - properly formatted as SSE
        yield f"data: {response_content}\n\n"
        
    except Exception as e:
        error_message = f"Sorry, I encountered an error: {str(e)}"
        chat_history.append({
            "role": "assistant",
            "content": error_message,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        yield f"data: {error_message}\n\n"

# API endpoints
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
            input_list.append({"role": msg["role"], "content": msg["content"]})
    else:
        # First message
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
async def get_chat_history(user_id: str):
    """Get the chat history for a user"""
    if user_id not in chat_histories:
        return {"messages": []}
    
    return {"messages": chat_histories[user_id]}

@app.delete("/chat/{user_id}")
async def clear_chat_history(user_id: str):
    """Clear the chat history for a user"""
    if user_id in chat_histories:
        chat_histories[user_id] = []
    
    return {"status": "success", "message": "Chat history cleared"}

# Run the API
if __name__ == "__main__":
    # Get the port from environment variable or default to 9876
    # to match the port in the Vite proxy configuration
    port = int(os.getenv("PORT", 9876))
    uvicorn.run("tw_agent:app", host="0.0.0.0", port=port, reload=True) 