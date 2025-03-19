"""
Marketing Mix Model tool for Triple Whale - analyzes ad budget allocation and impact.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional
from .utils import log, send_tool_notification, MOBY_TLD

# Marketing Mix Model endpoint
MMM_ENDPOINT = f"{MOBY_TLD}/api/mmm"

@function_tool
async def marketing_mix_model(
    wrapper: RunContextWrapper, 
    question: str,
    shop_id: Optional[str] = None
) -> str:
    """
    Analyze ad budget allocation and predict impact on business outcomes using Marketing Mix Modeling.
    
    Args:
        question: Question about ad budget allocation, channel performance, or ROAS
        shop_id: Shopify store URL (optional)
        
    Returns:
        Marketing mix analysis and budget allocation recommendations
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "marketing_mix_model")
        
        log(f"Marketing Mix Model tool called with question: '{question}'", "INFO")
        
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
            MMM_ENDPOINT,
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
        
        log("Marketing Mix Model tool completed", "DEBUG")
        
    except Exception as e:
        error_msg = f"Error in Marketing Mix Model: {e}"
        log(error_msg, "ERROR")
        return f"Error: Could not complete marketing mix analysis. {str(e)}" 