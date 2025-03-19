import json
import requests
import os
import sys
import uuid
from typing import Optional
from agents import function_tool, RunContextWrapper
import asyncio

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
        # DIRECT TOOL NOTIFICATION
        # This will send a tool notification directly without depending on callback mechanisms
        try:
            # Try to access the socket from wrapper context if available
            context = getattr(wrapper, 'context', {})
            socket = context.get('socket')
            sid = context.get('sid')
            
            if socket and sid:
                print("\n" + "#" * 80)
                print("🚨 DIRECT MOBY TOOL NOTIFICATION ATTEMPT")
                print("#" * 80 + "\n")
                sys.stdout.flush()
                
                # Send tool notification directly
                await socket.emit('stream_update', {
                    "type": "tool",  # Use specific tool type
                    "content": "Using tool: moby...",
                    "tool": "moby"
                }, room=sid)
                
                print("✅ DIRECT TOOL NOTIFICATION FROM MOBY FUNCTION SENT!")
                sys.stdout.flush()
        except Exception as e:
            print(f"❌ ERROR sending direct tool notification from moby function: {str(e)}")
            sys.stdout.flush()
            
        # Enhanced debug logging with clear markers
        print("\n")
        print("%" * 60)
        print("🐳 MOBY TOOL CALLED")
        print(f"QUESTION: '{question}'")
        print(f"SHOP ID: '{shop_id}'")
        print(f"ENDPOINT: {MOBY_ENDPOINT}")
        print("%" * 60)
        print("\n")
        sys.stdout.flush()  # Force immediate print to console

        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = "madisonbraids.myshopify.com"
            
        print(f"Asking Moby: {question}, {shop_id}")
        sys.stdout.flush()  # Force immediate print to console
        
        headers = {
            'content-type': 'application/json'
        }
        
        # Generate a UUID for conversation if not provided
        conversation_id = parent_message_id if parent_message_id else str(uuid.uuid4())
        
        # Prepare request payload
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

        print("🚀 Sending request to Moby API...")
        sys.stdout.flush()  # Force immediate print to console

        # Remove await since requests.post is not an async function
        response = requests.post(
            MOBY_ENDPOINT,
            headers=headers,
            json=payload
        )

        # Print raw response before trying to parse JSON
        print(f"📥 Raw response status: {response.status_code}")
        print(f"📝 Raw response content preview: {response.text[:200]}")  # Print first 200 chars to avoid huge logs
        sys.stdout.flush()  # Force immediate print to console
        
        # Only try to parse JSON if we got a valid response
        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                print(f"✅ JSON parsed successfully")
                sys.stdout.flush()
                
                if data.get("messages") and len(data["messages"]) > 0:
                    last_message_text = data["messages"][-1].get("text", "") + " "
                    return last_message_text
                else:
                    return "No answer received from Moby."
            except json.JSONDecodeError as json_err:
                print(f"❌ JSON parsing error: {json_err}")
                sys.stdout.flush()
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            print(f"❌ {error_msg}")
            sys.stdout.flush()
            return error_msg
            
    except Exception as e:
        error_msg = f"Error querying Moby: {e}"
        print(f"❌ {error_msg}")
        sys.stdout.flush()  # Force immediate print to console
        return f"Error: Could not fetch response from Triple Whale. {str(e)}"
    finally:
        print("\n")
        print("%" * 60)
        print("🐳 MOBY TOOL COMPLETED")
        print("%" * 60)
        print("\n")
        sys.stdout.flush()  # Force immediate print to console

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
        # DIRECT TOOL NOTIFICATION
        # This will send a tool notification directly without depending on callback mechanisms
        try:
            # Try to access the socket from wrapper context if available
            context = getattr(wrapper, 'context', {})
            socket = context.get('socket')
            sid = context.get('sid')
            
            if socket and sid:
                print("\n" + "#" * 80)
                print("🚨 DIRECT SEARCH_WEB TOOL NOTIFICATION ATTEMPT")
                print("#" * 80 + "\n")
                sys.stdout.flush()
                
                # Send tool notification directly
                await socket.emit('stream_update', {
                    "type": "tool",  # Use specific tool type
                    "content": "Using tool: search_web...",
                    "tool": "search_web"
                }, room=sid)
                
                print("✅ DIRECT TOOL NOTIFICATION FROM SEARCH_WEB FUNCTION SENT!")
                sys.stdout.flush()
        except Exception as e:
            print(f"❌ ERROR sending direct tool notification from search_web function: {str(e)}")
            sys.stdout.flush()
            
        # Enhanced debug logging with clear markers
        print("\n")
        print("#" * 60)
        print("🔍 SEARCH WEB TOOL CALLED")
        print(f"SEARCH TERM: '{search_term}'")
        print("#" * 60)
        print("\n")
        sys.stdout.flush()  # Force immediate print to console
        
        print("⏳ Delegating to built-in web_search tool...")
        sys.stdout.flush()  # Force immediate print to console
        
        # Call the built-in web_search tool
        web_results = await wrapper.invoke_tool("web_search", {"search_term": search_term})
        
        # Log successful completion
        print("\n")
        print("#" * 60)
        print("✅ SEARCH WEB TOOL COMPLETED")
        print("#" * 60)
        print("\n")
        sys.stdout.flush()  # Force immediate print to console
        
        return json.dumps({"source": "web_search", "results": web_results})
    except Exception as e:
        error_msg = f"Error in search_web: {e}"
        print(f"❌ {error_msg}")
        sys.stdout.flush()  # Force immediate print to console
        return json.dumps({"error": str(e), "message": "Failed to search the web"})
    finally:
        # Ensure completion is always logged
        print("🏁 SEARCH WEB TOOL EXITING")
        sys.stdout.flush()  # Force immediate print to console
    
# Add more tool functions below:
# Example template:
# @function_tool
# async def tool_name(parameter1: type, parameter2: type) -> str:
#     """Tool description"""
#     # Tool implementation
#     pass 