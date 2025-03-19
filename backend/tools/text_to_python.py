"""
TextToPython tool for Triple Whale - converts natural language to executable Python code.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional
from .utils import log, send_tool_notification, send_tool_completion_notification, MOBY_TLD

# TextToPython endpoint
TEXT_TO_PYTHON_ENDPOINT = f"{MOBY_TLD}/api/code-interpreter"

@function_tool
async def text_to_python(
    wrapper: RunContextWrapper, 
    question: str,
    shop_id: Optional[str] = None
) -> str:
    """
    Convert natural language to Python code and run it to get results.
    
    Args:
        question: The natural language description of the code to generate and run
        shop_id: Shopify store URL (optional)
        
    Returns:
        Python code execution results and output
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4())
        
        # Send tool notification for start
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "text_to_python", "starting")
        
        log(f"TextToPython tool called with question: '{question}'", "INFO")
        
        # Get the original question if available, otherwise use the provided question
        original_question = context.get('original_question', question)
        
        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = context.get('shop_id', "madisonbraids.myshopify.com")
        
        # Check if we're retrying or have pre-generated code
        current_run_index = 0
        if hasattr(wrapper, 'run_count') and wrapper.run_count.get('text_to_python'):
            current_run_index = wrapper.run_count.get('text_to_python')
        
        # Prepare headers and payload for the API call
        headers = {
            'content-type': 'application/json'
        }
        
        payload = {
            "question": question,
            "originalQuestion": original_question,
            "shopId": shop_id,
            "messageId": message_id,
            "errorMessages": [],
            "retries": current_run_index if current_run_index > 0 else 0,
            "source": "chat",
            "dialect": "clickhouse",
            "userId": "test-user"
        }
        
        # Make the direct API call
        response = requests.post(
            TEXT_TO_PYTHON_ENDPOINT,
            headers=headers,
            json=payload
        )

        log("TextToPython tool completed", "DEBUG")
        
        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                # Send tool notification for completion
                await send_tool_completion_notification(wrapper, "text_to_python")
                # Return the formatted response
                return json.dumps(data)
            except json.JSONDecodeError as json_err:
                log(f"JSON parsing error: {json_err}", "ERROR")
                # Send tool notification for completion (with error)
                await send_tool_completion_notification(wrapper, "text_to_python")
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            log(error_msg, "ERROR")
            # Send tool notification for completion (with error)
            await send_tool_completion_notification(wrapper, "text_to_python")
            return error_msg
        
    except Exception as e:
        error_msg = f"Error in TextToPython: {e}"
        log(error_msg, "ERROR")
        # Send tool notification for completion (with error)
        try:
            await send_tool_completion_notification(wrapper, "text_to_python")
        except:
            pass
        return f"Error: Could not generate or execute Python code. {str(e)}" 