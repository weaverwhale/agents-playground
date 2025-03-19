import json
import requests
import os
import sys
import uuid
from typing import Optional
from agents import function_tool, RunContextWrapper
import asyncio

# Utility function for logging with automatic stdout flushing
def log(message):
    """Print a message to stdout and flush the buffer immediately."""
    print(message)
    sys.stdout.flush()

# Endpoint configurations
MOBY_TLD = "http://willy.srv.whale3.io"
MOBY_ENDPOINT = "{MOBY_TLD}/willy/answer-nlq-question".format(MOBY_TLD=MOBY_TLD)

@function_tool
async def moby(wrapper: RunContextWrapper, question: str, shop_id: str, parent_message_id: Optional[str] = None) -> str:
    """
    Useful for getting e-commerce analytics and insights from Triple Whale's AI, Moby.
    
    Args:
        question: Question to ask Triple Whale Moby
        shop_id: Shopify store URL
        parent_message_id: Parent message ID for conversation context
        
    Returns:
        Response from Moby
    """
    try:
        # Send tool notification if socket is available
        try:
            context = getattr(wrapper, 'context', {})
            socket = context.get('socket')
            sid = context.get('sid')
            
            if socket and sid:
                await socket.emit('stream_update', {
                    "type": "tool",
                    "content": "Using tool: moby...",
                    "tool": "moby"
                }, room=sid)
        except Exception as e:
            log(f"Error sending tool notification: {str(e)}")
            
        log(f"Moby tool called with question: '{question}'")

        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = "madisonbraids.myshopify.com"
            
        headers = {
            'content-type': 'application/json'
        }
        
        # Generate a UUID for conversation if not provided
        conversation_id = parent_message_id if parent_message_id else str(uuid.uuid4())
        
        payload = {
            "stream": False,
            "shopId": shop_id,
            "conversationId": conversation_id,
            "source": "chat",
            "dialect": "clickhouse",
            "userId": "test-user",
            "additionalShopIds": [],
            "question": question,
            "query": question,
            "generateInsights": True,
            "isOutsideMainChat": True
        }

        response = requests.post(
            MOBY_ENDPOINT,
            headers=headers,
            json=payload
        )

        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                
                if data.get("messages") and len(data["messages"]) > 0:
                    last_message_text = data["messages"][-1].get("text", "") + " "
                    return last_message_text
                else:
                    return "No answer received from Moby."
            except json.JSONDecodeError as json_err:
                log(f"JSON parsing error: {json_err}")
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            log(error_msg)
            return error_msg
            
    except Exception as e:
        error_msg = f"Error querying Moby: {e}"
        log(error_msg)
        return f"Error: Could not fetch response from Triple Whale. {str(e)}"
    finally:
        log("Moby tool completed")

@function_tool
async def search_web(wrapper: RunContextWrapper, search_term: str) -> str:
    """
    Search the web for real-time information about products, prices, reviews, and more.
    
    Args:
        search_term: The search term to look up on the web
        
    Returns:
        JSON string with search results
    """
    try:
        # Send tool notification if socket is available
        try:
            context = getattr(wrapper, 'context', {})
            socket = context.get('socket')
            sid = context.get('sid')
            
            if socket and sid:
                await socket.emit('stream_update', {
                    "type": "tool",
                    "content": "Using tool: search_web...",
                    "tool": "search_web"
                }, room=sid)
        except Exception as e:
            log(f"Error sending tool notification: {str(e)}")
            
        log(f"Search web tool called with term: '{search_term}'")
        
        web_results = await wrapper.invoke_tool("web_search", {"search_term": search_term})
        
        log("Search web tool completed")
        
        return json.dumps({"source": "web_search", "results": web_results})
    except Exception as e:
        error_msg = f"Error in search_web: {e}"
        log(error_msg)
        return json.dumps({"error": str(e), "message": "Failed to search the web"})
    
# Add more tool functions below:
# Example template:
# @function_tool
# async def tool_name(parameter1: type, parameter2: type) -> str:
#     """Tool description"""
#     # Tool implementation
#     pass 