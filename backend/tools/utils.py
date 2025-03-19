"""
Utility functions and shared constants for Triple Whale tools.
"""
import sys
import json
import uuid
import asyncio
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
        
        # Initialize data structures if they don't exist
        if 'sent_tool_notifications' not in context:
            context['sent_tool_notifications'] = {}
            
        if 'tool_call_counters' not in context:
            context['tool_call_counters'] = {}
            
        if 'active_tool_calls' not in context:
            context['active_tool_calls'] = {}
            
        # Get the user's persistent context (parent of the request context)
        # We need to store global counter in the user context to persist across messages
        user_context = context.get('user_context', context)
            
        # Initialize the global tool counter in the user context if it doesn't exist
        if 'global_tool_counter' not in user_context:
            user_context['global_tool_counter'] = 0
            
        # Tool call tracking maps
        tool_counters = context['tool_call_counters']
        active_calls = context['active_tool_calls']
        
        if status == "starting":
            # Generate a new unique ID for this specific tool call
            call_uuid = str(uuid.uuid4())
            
            # Increment the global counter for a truly new counter each time
            # Use the counter from the user context to persist across messages
            user_context['global_tool_counter'] += 1
            call_id = user_context['global_tool_counter']
            
            # Track this counter in the per-tool counter map
            if tool_name not in tool_counters:
                tool_counters[tool_name] = []
            tool_counters[tool_name].append(call_id)
            
            # Track this active call in the active calls map
            active_calls[call_uuid] = {
                'tool': tool_name,
                'call_id': call_id
            }
            
            # Store the current tool call for later completion
            context['current_tool_call_uuid'] = call_uuid
            
            log(f"Starting new tool call: {tool_name} with call_id {call_id}", "DEBUG")
        else:  
            # For "completed" notifications, find the matching call ID
            call_id = 1  # Default fallback
            call_uuid = context.get('current_tool_call_uuid')
            
            if call_uuid and call_uuid in active_calls:
                # We have a direct match from the current UUID
                call_data = active_calls[call_uuid]
                call_id = call_data['call_id']
                
                # Only remove from active calls when completed, not for other statuses
                if status == "completed":
                    del active_calls[call_uuid]
                    log(f"Completed and removed tool call: {tool_name} with call_id {call_id}", "DEBUG")
            else:
                # Fallback: try to find the latest call ID for this tool
                if tool_name in tool_counters and tool_counters[tool_name]:
                    call_id = tool_counters[tool_name][-1]
                    log(f"No UUID match, using latest call ID for {tool_name}: {call_id}", "DEBUG")
                else:
                    log(f"No call ID found for {tool_name}, using default ID 1", "DEBUG")
        
        # Create a unique key for notification tracking
        tool_call_key = f"{tool_name}_call_{call_id}"
        
        # Check for duplicate notifications
        sent_notifications = context.get('sent_tool_notifications', {})
        if status == "starting" and tool_call_key in sent_notifications and sent_notifications[tool_call_key] == "starting":
            log(f"Skipping duplicate starting notification for: {tool_call_key}", "DEBUG")
            return False
        
        # If we have a socket connection, send the notification
        if socket and sid:
            log(f"Sending tool notification for: {tool_name} (call #{call_id}, {status})", "DEBUG")
            
            # Different message content based on status
            content = f"Using tool: {tool_name}..." if status == "starting" else f"Tool {tool_name} completed"
            
            # Ensure a unique timestamp for each tool notification to prevent client deduplication
            # Add a unique call counter to each message
            unique_content = f"{content} [call_{call_id}_{uuid.uuid4().hex[:6]}]"
            
            # Send the notification
            await socket.emit('stream_update', {
                "type": "tool",
                "content": unique_content,
                "tool": tool_name,
                "status": status,
                "call_id": call_id  # Add call_id to help client track specific calls
            }, room=sid)
            
            # Track that we've sent this notification and its status
            sent_notifications[tool_call_key] = status
            
            # For "starting" notifications, yield control to the event loop to ensure the notification is processed
            if status == "starting":
                await asyncio.sleep(0.1)  # Small delay to ensure notifications are processed in order
                
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