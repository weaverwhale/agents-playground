import json
import requests
import os
import uuid
from typing import Optional
from agents import function_tool, RunContextWrapper

# Environment configuration
TW_TOKEN = os.getenv("TW_TOKEN")
TW_BEARER_TOKEN = os.getenv("TW_BEARER_TOKEN")
IS_ON_VPN = os.getenv("IS_ON_VPN") == 'true'
IS_LOCAL = os.getenv("IS_LOCAL") == 'true'
IS_ORCABASE = os.getenv("IS_ORCABASE") == 'true'

# Endpoint configurations
MOBY_TLD = "https://app.triplewhale.com/api/v2"
MOBY_ENDPOINT = "{MOBY_TLD}/willy/answer-nlq-question"

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
        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = "madisonbraids.myshopify.com"
            
        print(f"Asking Moby: {question}, {shop_id}")
        
        if not TW_BEARER_TOKEN and not TW_TOKEN and not IS_ON_VPN:
            return "Error: Triple Whale token or VPN not configured."
        
        headers = {
            'content-type': 'application/json'
        }
        
        # Configure headers based on environment
        if TW_BEARER_TOKEN or IS_LOCAL:
            headers["Authorization"] = f"Bearer {TW_BEARER_TOKEN}"
        elif not IS_ON_VPN and TW_TOKEN:
            headers["x-api-key"] = TW_TOKEN
        
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
        
        response = requests.post(
            MOBY_ENDPOINT,
            headers=headers,
            json=payload
        )
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get("messages") and len(data["messages"]) > 0:
                last_message_text = data["messages"][-1].get("text", "") + " "
                return last_message_text
            else:
                return "No answer received from Moby."
        else:
            return f"Error: API request failed with status {response.status_code}"
            
    except Exception as e:
        print(f"Error querying Moby: {e}")
        return f"Error: Could not fetch response from Triple Whale. {str(e)}"

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
        # Call the built-in web_search tool
        web_results = await wrapper.invoke_tool("web_search", {"search_term": search_term})
        return json.dumps({"source": "web_search", "results": web_results})
    except Exception as e:
        return json.dumps({"error": str(e), "message": "Failed to search the web"})
    
# Add more tool functions below:
# Example template:
# @function_tool
# async def tool_name(parameter1: type, parameter2: type) -> str:
#     """Tool description"""
#     # Tool implementation
#     pass 