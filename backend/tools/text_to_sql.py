"""
TextToSQL tool for Triple Whale - converts natural language to SQL queries.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional, Dict, Any
from .utils import log, send_tool_notification, send_tool_completion_notification, MOBY_TLD

# TextToSQL endpoint
TEXT_TO_SQL_ENDPOINT = f"{MOBY_TLD}/api/sql-generator"

@function_tool
async def text_to_sql(
    wrapper: RunContextWrapper, 
    question: str,
    visualizationType: Optional[str] = None,
    shop_id: Optional[str] = None
) -> str:
    """
    Get data from user's database by converting natural language to SQL.
    
    Args:
        question: The natural language question to convert to SQL
        visualizationType: The type of visualization to generate (optional)
        shop_id: Shopify store URL (optional)
        
    Returns:
        Data results and SQL query information
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "text_to_sql", "starting")
        
        log(f"TextToSQL tool called with question: '{question}'", "INFO")
        
        # Get the original question if available, otherwise use the provided question
        original_question = context.get('original_question', question)
        
        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = context.get('shop_id', "madisonbraids.myshopify.com")
        
        # Check if we should retry editing a query
        current_run_index = 0
        if hasattr(wrapper, 'run_count') and wrapper.run_count.get('text_to_sql'):
            current_run_index = wrapper.run_count.get('text_to_sql')
        
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
            "dialect": "clickhouse",
            "visualizationType": visualizationType,
            "userId": "test-user"
        }
        
        if current_run_index > 0:
            payload["tryEditQuery"] = True
        
        # Make the direct API call
        response = requests.post(
            TEXT_TO_SQL_ENDPOINT,
            headers=headers,
            json=payload
        )

        log("TextToSQL tool completed", "DEBUG")

        
        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                # Return the formatted response
                await send_tool_completion_notification(wrapper, "text_to_sql")
                return json.dumps(data)
            except json.JSONDecodeError as json_err:
                log(f"JSON parsing error: {json_err}", "ERROR")
                await send_tool_completion_notification(wrapper, "text_to_sql")
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            log(error_msg, "ERROR")
            await send_tool_completion_notification(wrapper, "text_to_sql")
            return error_msg
            
    except Exception as e:
        error_msg = f"Error in TextToSQL: {e}"
        log(error_msg, "ERROR")
        await send_tool_completion_notification(wrapper, "text_to_sql")
        return f"Error: Could not retrieve data. {str(e)}" 