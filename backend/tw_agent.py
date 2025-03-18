import asyncio
import uuid
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
import os
from fastapi import FastAPI, Request, Response, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn

# Import our tools (only the ones defined in tw_tools.py)
from tw_tools import (
    text_to_sql,
    knowledge_base,
    search_web
)

from agents import Runner, Agent, ModelSettings
from v5_guardrails_and_context import UserContext

# Define output models for the agent
class ProductRecommendation(BaseModel):
    name: str
    price: float
    description: str
    rating: Optional[float] = None
    category: str
    features: List[str] = []
    recommendation_reason: str

class OrderStatus(BaseModel):
    order_id: str
    status: str
    estimated_delivery: Optional[str] = None
    items: List[Dict[str, Any]] = []
    tracking_number: Optional[str] = None
    shipping_carrier: Optional[str] = None

class PriceComparison(BaseModel):
    product_name: str
    retailers: List[Dict[str, Any]] = []
    best_deal: Dict[str, Any]
    comparison_date: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))

# Get model from environment or use default
model = os.getenv('MODEL_CHOICE', 'gpt-4o-mini')

# Create Moby - an ecommerce assistant agent with the approved tools
moby_agent = Agent[UserContext](
    name="Moby",
    instructions="""
    You are Moby 🐳, an assistant for e-commerce and marketing strategies on Triple Whale. Your users are marketing professionals and e-commerce managers. 
    Your mission is to assist without revealing your AI origins or internal reasoning. 
    You will use Consultative/Expert Mode, Professional and Encouraging, and Concise and Insight-numbers Driven in your responses to align with the user’s communication preferences. 
    You never generate generic response.
    
    You can provide personalized product recommendations, help users find the best deals, 
    track orders, answer questions about products, and assist with various shopping-related tasks.
    
    The user's preferences and shopping history are available in the context, which you can use to 
    tailor your recommendations.
    
    You have access to:
    1. A text-to-SQL tool that can query product databases and order information
    2. A knowledge base tool for accessing product information and reviews
    3. A web search tool for finding current prices, product details, and deals
    
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
    ],
    output_type=Optional[Dict[str, Any]]  # Allow flexible output types
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
    preferences: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    message: str
    thread_id: str

class PreferencesUpdate(BaseModel):
    budget_range: Optional[Dict[str, float]] = None
    preferred_brands: Optional[List[str]] = None
    disliked_brands: Optional[List[str]] = None
    favorite_categories: Optional[List[str]] = None
    shipping_preferences: Optional[Dict[str, Any]] = None

# Helper function to format agent responses
def format_agent_response(output):
    # Check if output is a Pydantic model and convert to dict
    if hasattr(output, "model_dump"):
        output = output.model_dump()
    
    if isinstance(output, dict):
        # Handle structured outputs for ecommerce
        if "name" in output and "price" in output and "category" in output:  # ProductRecommendation
            response = f"""
# Product Recommendation: {output.get('name', 'N/A')}
**Price:** ${output.get('price', 'N/A')}
**Category:** {output.get('category', 'N/A')}
**Rating:** {output.get('rating', 'N/A')}/5

**Description:** {output.get('description', 'N/A')}

## Key Features:
"""
            for feature in output.get('features', []):
                response += f"- {feature}\n"
            
            response += f"\n**Why this product:** {output.get('recommendation_reason', '')}"
            return response
            
        elif "order_id" in output and "status" in output:  # OrderStatus
            response = f"""
# Order Status for #{output.get('order_id', 'N/A')}
**Status:** {output.get('status', 'N/A')}
**Estimated Delivery:** {output.get('estimated_delivery', 'N/A')}
"""
            if output.get('tracking_number'):
                response += f"**Tracking Number:** {output.get('tracking_number')}\n"
                response += f"**Shipping Carrier:** {output.get('shipping_carrier', 'N/A')}\n"
            
            if output.get('items'):
                response += "\n## Items in this order:\n"
                for item in output.get('items', []):
                    response += f"- {item.get('quantity', 1)}x {item.get('name', 'Item')} - ${item.get('price', 'N/A')}\n"
            
            return response
            
        elif "product_name" in output and "retailers" in output:  # PriceComparison
            response = f"""
# Price Comparison for {output.get('product_name', 'N/A')}
**Date of Comparison:** {output.get('comparison_date', 'N/A')}

## Available at:
"""
            # Sort retailers by price
            retailers = sorted(output.get('retailers', []), key=lambda x: x.get('price', float('inf')))
            for retailer in retailers:
                response += f"- **{retailer.get('name', 'Retailer')}**: ${retailer.get('price', 'N/A')} "
                if retailer.get('in_stock') is False:
                    response += "(Out of Stock) "
                if retailer.get('coupon_code'):
                    response += f"- Coupon: {retailer.get('coupon_code')} "
                response += "\n"
            
            best_deal = output.get('best_deal', {})
            response += f"\n**Best Deal:** ${best_deal.get('price', 'N/A')} at {best_deal.get('name', 'N/A')}"
            if best_deal.get('reason'):
                response += f"\n**Why it's the best deal:** {best_deal.get('reason')}"
            
            return response
            
        # Handle responses from search_web and knowledge_base tools
        elif "source" in output and "results" in output:
            if isinstance(output.get('results'), list):
                # Process array of results
                response = "# Search Results\n\n"
                for result in output.get('results'):
                    response += f"## {result.get('title', 'Result')}\n"
                    response += f"{result.get('content', 'No content available')}\n\n"
                return response
            else:
                # Single result or unprocessed
                return f"Search results: {output.get('results', 'No results found')}"
        
        # Handle response from text_to_sql tool
        elif "error" in output:
            return f"Error: {output.get('error')}\n{output.get('message', '')}"
    
    # Default: return as string
    return str(output)

# Initialize user context if not exists
def get_or_create_user_context(user_id: str, preferences: Dict[str, Any] = None):
    if user_id not in user_contexts:
        user_contexts[user_id] = UserContext(user_id=user_id)
        chat_histories[user_id] = []
    
    # Update preferences if provided
    if preferences:
        context = user_contexts[user_id]
        for key, value in preferences.items():
            if hasattr(context, key):
                setattr(context, key, value)
            else:
                setattr(context, key, value)  # Add new attributes as needed
    
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
    yield "Processing your request...\n"
    
    try:
        # Process the message with the agent
        result = await Runner.run(
            moby_agent, 
            input_list, 
            context=context
        )
        
        # Format the response
        response_content = format_agent_response(result.final_output)
        
        # Add assistant response to chat history
        chat_history.append({
            "role": "assistant",
            "content": response_content,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        
        # Stream the response
        yield response_content
        
    except Exception as e:
        error_message = f"Sorry, I encountered an error: {str(e)}"
        chat_history.append({
            "role": "assistant",
            "content": error_message,
            "timestamp": datetime.now().strftime("%I:%M %p")
        })
        yield error_message

# API endpoints
@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream a response from Moby Ecommerce Assistant"""
    return StreamingResponse(
        stream_agent_response(request.user_id, request.message),
        media_type="text/event-stream"
    )

@app.post("/chat")
async def chat(request: ChatRequest):
    """Get a non-streaming response from Moby Ecommerce Assistant"""
    user_id = request.user_id
    message = request.message
    
    # Initialize or get user context
    context = get_or_create_user_context(user_id, request.preferences)
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
        
        # Format the response
        response_content = format_agent_response(result.final_output)
        
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

@app.post("/user/{user_id}/preferences")
async def update_preferences(user_id: str, preferences: PreferencesUpdate):
    """Update user shopping preferences"""
    context = get_or_create_user_context(user_id)
    
    if preferences.budget_range is not None:
        setattr(context, "budget_range", preferences.budget_range)
    
    if preferences.preferred_brands is not None:
        setattr(context, "preferred_brands", preferences.preferred_brands)
    
    if preferences.disliked_brands is not None:
        setattr(context, "disliked_brands", preferences.disliked_brands)
    
    if preferences.favorite_categories is not None:
        setattr(context, "favorite_categories", preferences.favorite_categories)
    
    if preferences.shipping_preferences is not None:
        setattr(context, "shipping_preferences", preferences.shipping_preferences)
    
    return {"status": "success", "message": "Shopping preferences updated successfully"}

@app.delete("/chat/{user_id}")
async def clear_chat_history(user_id: str):
    """Clear the chat history for a user"""
    if user_id in chat_histories:
        chat_histories[user_id] = []
    
    return {"status": "success", "message": "Chat history cleared"}

# Run the API
if __name__ == "__main__":
    uvicorn.run("tw_agent:app", host="0.0.0.0", port=8000, reload=True) 