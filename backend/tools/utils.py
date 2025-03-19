"""
Utility functions and shared constants for Triple Whale tools.
"""
import sys
import json
import uuid
import requests
from typing import Dict, Any, Optional

# Endpoint configurations
MOBY_TLD = "http://willy.srv.whale3.io"

# Common utility function for logging with automatic stdout flushing
def log(message: str, level: str = "INFO"):
    """Print a message to stdout with a log level and flush the buffer immediately."""
    print(f"[{level}] {message}")
    sys.stdout.flush()

# Common function to send tool notifications
async def send_tool_notification(context: Dict[str, Any], tool_name: str, status: str = "starting"):
    """
    Send a notification about tool usage through the socket if available.
    
    Args:
        context: The context object containing socket and session information
        tool_name: The name of the tool being used
        status: The status of the tool ("starting" or "completed")
    """
    try:
        socket = context.get('socket')
        sid = context.get('sid')
        
        # For starting notifications, check if notification for this tool has already been sent
        notification_key = f"{tool_name}_{status}"
        sent_notifications = context.get('sent_tool_notifications', set())
        if notification_key in sent_notifications:
            # Notification already sent for this tool invocation
            return False
        
        if socket and sid:
            log(f"Sending tool notification for: {tool_name} ({status})", "DEBUG")
            
            # Different message content based on status
            content = f"Using tool: {tool_name}..." if status == "starting" else f"Tool {tool_name} completed"
            
            await socket.emit('stream_update', {
                "type": "tool",
                "content": content,
                "tool": tool_name,
                "status": status
            }, room=sid)
            
            # Track that we've sent this notification
            sent_notifications.add(notification_key)
            context['sent_tool_notifications'] = sent_notifications
            return True
    except Exception as e:
        log(f"Error sending tool notification: {str(e)}", "ERROR")
        return False
    
    return False

# Common function to make requests to Moby endpoints
async def call_moby_endpoint(endpoint: str, question: str, shop_id: str, 
                         conversation_id: Optional[str] = None,
                         additional_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Makes a request to a Moby endpoint with proper parameters.
    
    Args:
        endpoint: The specific endpoint to call
        question: The question or query for Moby
        shop_id: The Shopify shop ID
        conversation_id: Optional conversation ID for context
        additional_params: Additional parameters to add to the payload
        
    Returns:
        Response data from the API call
    """
    # Set default shop_id if none is provided
    if not shop_id:
        shop_id = "madisonbraids.myshopify.com"
        
    headers = {
        'content-type': 'application/json'
    }
    
    # Generate a UUID for conversation if not provided
    conv_id = conversation_id if conversation_id else str(uuid.uuid4())
    
    # Base payload for all Moby calls
    payload = {
        "stream": False,
        "shopId": shop_id,
        "conversationId": conv_id,
        "source": "chat",
        "dialect": "clickhouse",
        "userId": "test-user",
        "additionalShopIds": [],
        "question": question,
        "query": question,
        "generateInsights": True,
        "isOutsideMainChat": True
    }
    
    # Add any additional parameters
    if additional_params:
        payload.update(additional_params)

    full_endpoint = f"{MOBY_TLD}{endpoint}"
    response = requests.post(
        full_endpoint,
        headers=headers,
        json=payload
    )

    if response.status_code == 200 and response.text.strip():
        try:
            return response.json()
        except json.JSONDecodeError as json_err:
            log(f"JSON parsing error: {json_err}", "ERROR")
            raise Exception(f"Could not parse API response: {str(json_err)}")
    else:
        error_msg = f"API request failed with status {response.status_code}"
        log(error_msg, "ERROR")
        raise Exception(error_msg)

# Helper function to add tool completion notifications to all tools
async def send_tool_completion_notification(wrapper, tool_name):
    """
    Helper function to send a completion notification for a tool.
    Makes it easier to ensure notifications are sent even in exception handlers.
    
    Args:
        wrapper: The RunContextWrapper instance
        tool_name: The name of the tool that completed
    """
    try:
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, tool_name, "completed")
    except Exception as e:
        log(f"Error sending completion notification for {tool_name}: {str(e)}", "ERROR")
        pass  # Don't throw errors from notification functions 