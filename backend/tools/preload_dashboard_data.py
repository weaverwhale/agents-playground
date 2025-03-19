"""
PreloadDashboardData tool for Triple Whale - retrieves and analyzes dashboard data.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional
from .utils import log, send_tool_notification, send_tool_completion_notification, MOBY_TLD

# PreloadDashboardData endpoint
DASHBOARD_ENDPOINT = f"{MOBY_TLD}/api/dashboard-data"

@function_tool
async def preload_dashboard_data(
    wrapper: RunContextWrapper, 
    question: str,
    shop_id: Optional[str] = None
) -> str:
    """
    Retrieve and analyze data from existing Triple Whale dashboards.
    
    Args:
        question: Question about dashboard data or metrics
        shop_id: Shopify store URL (optional)
        
    Returns:
        Analysis and insights from dashboard data
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "preload_dashboard_data", "starting")
        
        log(f"PreloadDashboardData tool called with question: '{question}'", "INFO")
        
        # Get the original question if available, otherwise use the provided question
        original_question = context.get('original_question', question)
        
        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = context.get('shop_id', "madisonbraids.myshopify.com")
        
        # Prepare headers and payload for the API call
        headers = {
            'content-type': 'application/json'
        }
        
        payload = {
            "question": question,
            "originalQuestion": original_question,
            "shopId": shop_id,
            "messageId": message_id,
            "source": "chat",
            "userId": "test-user"
        }
        
        # Make the direct API call
        response = requests.post(
            DASHBOARD_ENDPOINT,
            headers=headers,
            json=payload
        )
        
        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                # Return the formatted response
                await send_tool_completion_notification(wrapper, "preload_dashboard_data")
                return json.dumps(data)
            except json.JSONDecodeError as json_err:
                log(f"JSON parsing error: {json_err}", "ERROR")
                await send_tool_completion_notification(wrapper, "preload_dashboard_data")
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            log(error_msg, "ERROR")
            await send_tool_completion_notification(wrapper, "preload_dashboard_data")
            return error_msg
        
        log("PreloadDashboardData tool completed", "DEBUG")
        
    except Exception as e:
        error_msg = f"Error in PreloadDashboardData: {e}"
        log(error_msg, "ERROR")
        await send_tool_completion_notification(wrapper, "preload_dashboard_data")
        return f"Error: Could not retrieve dashboard data. {str(e)}" 