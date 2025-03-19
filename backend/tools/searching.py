"""
Searching tool for Triple Whale - provides information about the platform and e-commerce.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional, List
from .utils import log, send_tool_notification, MOBY_TLD

# Searching endpoint
SEARCHING_ENDPOINT = f"{MOBY_TLD}/api/search"

@function_tool
async def searching(
    wrapper: RunContextWrapper, 
    question: str,
    searchSource: Optional[List[str]] = None,
    links: Optional[List[str]] = None,
    shop_id: Optional[str] = None
) -> str:
    """
    Provide information about the Triple Whale platform, e-commerce, and marketing.
    
    Args:
        question: The search query about Triple Whale or e-commerce
        searchSource: Sources to search in (e.g. ['webSearch', 'documentation'])
        links: Specific URLs to search within
        shop_id: Shopify store URL (optional)
        
    Returns:
        Information and search results related to the query
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "searching")
        
        log(f"Searching tool called with question: '{question}'", "INFO")
        
        # Get the original question if available, otherwise use the provided question
        original_question = context.get('original_question', question)
        
        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = context.get('shop_id', "madisonbraids.myshopify.com")
        
        # Set default search sources if none provided
        if not searchSource:
            searchSource = ['webSearch']
        
        # Prepare headers and payload for the API call
        headers = {
            'content-type': 'application/json'
        }
        
        payload = {
            "question": question,
            "originalQuestion": original_question,
            "shopId": shop_id,
            "messageId": message_id,
            "searchSource": searchSource,
            "links": links if links else [],
            "source": "chat",
            "userId": "test-user"
        }
        
        # Make the direct API call
        response = requests.post(
            SEARCHING_ENDPOINT,
            headers=headers,
            json=payload
        )
        
        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                # Return the formatted response
                return json.dumps(data)
            except json.JSONDecodeError as json_err:
                log(f"JSON parsing error: {json_err}", "ERROR")
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            log(error_msg, "ERROR")
            return error_msg
        
        log("Searching tool completed", "DEBUG")
        
    except Exception as e:
        error_msg = f"Error in Searching: {e}"
        log(error_msg, "ERROR")
        return f"Error: Could not complete search. {str(e)}" 