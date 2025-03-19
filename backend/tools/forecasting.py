"""
Forecasting tool for Triple Whale - forecasts time series metrics into the future.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional
from .utils import log, send_tool_notification, MOBY_TLD

# Forecasting endpoint
FORECASTING_ENDPOINT = f"{MOBY_TLD}/api/forecasting"

@function_tool
async def forecasting(
    wrapper: RunContextWrapper, 
    question: str,
    shop_id: Optional[str] = None
) -> str:
    """
    Forecast time series metrics into the future based on historical data.
    
    Args:
        question: A natural language query about future trends or forecasts
        shop_id: Shopify store URL (optional)
        
    Returns:
        Time series forecasts and predictive analytics
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "forecasting")
        
        log(f"Forecasting tool called with question: '{question}'", "INFO")
        
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
            "userOriginalQuestion": original_question,
            "shopId": shop_id,
            "messageId": message_id,
            "source": "chat",
            "dialect": "clickhouse",
            "userId": "test-user"
        }
        
        # Make the direct API call
        response = requests.post(
            FORECASTING_ENDPOINT,
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
        
        log("Forecasting tool completed", "DEBUG")
        
    except Exception as e:
        error_msg = f"Error in Forecasting: {e}"
        log(error_msg, "ERROR")
        return f"Error: Could not generate forecast. {str(e)}" 