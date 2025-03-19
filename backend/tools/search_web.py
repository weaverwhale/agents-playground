"""
Web Search tool for Triple Whale - finds information on the web as a fallback option.
"""
import uuid
import json
from agents import function_tool, RunContextWrapper
from typing import Optional
from .utils import log, send_tool_notification

@function_tool
async def search_web(
    wrapper: RunContextWrapper, 
    search_term: str
) -> str:
    """
    Fallback tool to search the web for real-time information about products, prices, reviews, and more.
    
    Args:
        search_term: The search term to look up on the web
        
    Returns:
        JSON string with search results
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "search_web")
        
        log(f"Search web (fallback) tool called with term: '{search_term}'", "INFO")
        
        # Use the web_search tool from the wrapper
        result = await wrapper.invoke_tool("web_search", {"search_term": search_term})
        
        # Return as JSON
        response = json.dumps({"source": "web_search", "results": result})
        
        log("Search web tool completed", "DEBUG")
        return response
            
    except Exception as e:
        error_msg = f"Error in search_web: {e}"
        log(error_msg, "ERROR")
        return json.dumps({"error": str(e), "message": "Failed to search the web"}) 