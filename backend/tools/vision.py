"""
Vision tool for Triple Whale - analyzes images and videos.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional, List
from .utils import log, send_tool_notification, send_tool_completion_notification, MOBY_TLD

# Vision endpoint
VISION_ENDPOINT = f"{MOBY_TLD}/api/vision"

@function_tool
async def vision(
    wrapper: RunContextWrapper, 
    question: str,
    shop_id: Optional[str] = None
) -> str:
    """
    Analyze and describe images or videos to extract insights.
    
    Args:
        question: Question about the uploaded images or videos
        shop_id: Shopify store URL (optional)
        
    Returns:
        Analysis and description of the visual content
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "vision", "starting")
        
        log(f"Vision tool called with question: '{question}'", "INFO")
        
        # Get the original question if available, otherwise use the provided question
        original_question = context.get('original_question', question)
        
        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = context.get('shop_id', "madisonbraids.myshopify.com")
        
        # Get uploaded files from context if available
        uploaded_files = context.get('uploaded_files', [])
        
        # Prepare headers and payload for the API call
        headers = {
            'content-type': 'application/json'
        }
        
        payload = {
            "question": question,
            "originalQuestion": original_question,
            "shopId": shop_id,
            "messageId": message_id,
            "uploadedFiles": uploaded_files,
            "source": "chat",
            "userId": "test-user"
        }
        
        # Make the direct API call
        response = requests.post(
            VISION_ENDPOINT,
            headers=headers,
            json=payload
        )
        
        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                # Return the formatted response
                await send_tool_completion_notification(wrapper, "vision")
                return json.dumps(data)
            except json.JSONDecodeError as json_err:
                log(f"JSON parsing error: {json_err}", "ERROR")
                await send_tool_completion_notification(wrapper, "vision")
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            log(error_msg, "ERROR")
            await send_tool_completion_notification(wrapper, "vision")
            return error_msg
        
        log("Vision tool completed", "DEBUG")
        
    except Exception as e:
        error_msg = f"Error in Vision: {e}"
        log(error_msg, "ERROR")
        await send_tool_completion_notification(wrapper, "vision")
        return f"Error: Could not analyze visual content. {str(e)}" 