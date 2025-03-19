"""
NLQ Question Answering tool for Triple Whale - provides general e-commerce analytics and insights as a fallback.
"""
import uuid
import json
import requests
from agents import function_tool, RunContextWrapper
from typing import Optional
from .utils import log, send_tool_notification, MOBY_TLD

# General NLQ endpoint
MOBY_ENDPOINT = f"{MOBY_TLD}/willy/answer-nlq-question"

@function_tool
async def answer_nlq_question(
    wrapper: RunContextWrapper, 
    question: str, 
    shop_id: str,
    parent_message_id: Optional[str] = None
) -> str:
    """
    Fallback tool for getting e-commerce analytics and insights from Triple Whale's AI.
    Use when specialized tools fail or for general questions.
    
    Args:
        question: Question to ask Triple Whale's NLQ system
        shop_id: Shopify store URL
        parent_message_id: Parent message ID for conversation context
        
    Returns:
        Response from the NLQ system
    """
    try:
        # Generate a unique message ID
        message_id = str(uuid.uuid4()) if not parent_message_id else parent_message_id
        
        # Send tool notification
        context = getattr(wrapper, 'context', {})
        await send_tool_notification(context, "answer_nlq_question")
        
        log(f"Answer NLQ Question (fallback) tool called with question: '{question}'", "INFO")
        
        # Set default shop_id if none is provided
        if not shop_id:
            shop_id = "madisonbraids.myshopify.com"
            
        headers = {
            'content-type': 'application/json'
        }
        
        # Generate a UUID for conversation if not provided
        conversation_id = parent_message_id if parent_message_id else str(uuid.uuid4())
        
        payload = {
            "stream": False,
            "shopId": shop_id,
            "conversationId": conversation_id,
            "source": "chat",
            "dialect": "clickhouse",
            "userId": "test-user",
            "additionalShopIds": [],
            "question": question,
            "query": question,
            "generateInsights": True,
            "isOutsideMainChat": True
        }

        response = requests.post(
            MOBY_ENDPOINT,
            headers=headers,
            json=payload
        )

        if response.status_code == 200 and response.text.strip():
            try:
                data = response.json()
                
                if data.get("messages") and len(data["messages"]) > 0:
                    last_message_text = data["messages"][-1].get("text", "") + " "
                    return last_message_text
                else:
                    return "No answer received from the NLQ system."
            except json.JSONDecodeError as json_err:
                log(f"JSON parsing error: {json_err}", "ERROR")
                return f"Error: Could not parse API response. {str(json_err)}"
        else:
            error_msg = f"Error: API request failed with status {response.status_code}"
            log(error_msg, "ERROR")
            return error_msg
            
    except Exception as e:
        error_msg = f"Error querying NLQ system: {e}"
        log(error_msg, "ERROR")
        return f"Error: Could not fetch response from Triple Whale. {str(e)}"
    finally:
        log("Answer NLQ Question tool completed", "DEBUG") 