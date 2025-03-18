import json
import requests
from typing import List, Optional, Dict, Any
from datetime import datetime
from agents import function_tool, RunContextWrapper

# API endpoint configurations
TEXT_TO_SQL_API_ENDPOINT = "https://api.example.com/text-to-sql"
KNOWLEDGE_BASE_API_ENDPOINT = "https://api.example.com/knowledge-base"

# --- Custom Tools using provided capabilities ---

@function_tool
async def text_to_sql(wrapper: RunContextWrapper[UserContext], query: str, database_context: str, parameters: Optional[Dict[str, Any]] = None) -> str:
    """
    Converts natural language to SQL and executes the query against a database.
    Use this for structured data like product catalogs, order history, inventory, etc.
    
    Args:
        query: Natural language query to convert to SQL
        database_context: What database/table to query (products, orders, users, etc.)
        parameters: Additional parameters to use in the query
        
    Returns:
        JSON string with query results
    """
    try:
        # Call the text-to-sql API
        response = requests.post(
            TEXT_TO_SQL_API_ENDPOINT,
            json={
                "natural_language_query": query,
                "database_context": database_context,
                "parameters": parameters or {}
            }
        )
        
        if response.status_code == 200:
            return response.text
        else:
            return json.dumps({
                "error": f"Text-to-SQL API returned status code {response.status_code}",
                "message": "Failed to execute query"
            })
            
    except Exception as e:
        return json.dumps({"error": str(e)})

@function_tool
async def knowledge_base(wrapper: RunContextWrapper[UserContext], query: str, document_type: str, filters: Optional[Dict[str, Any]] = None) -> str:
    """
    Query the knowledge base for information about products, policies, or other structured content.
    
    Args:
        query: Natural language query to search for in the knowledge base
        document_type: Type of documents to search (products, policies, faq, etc.)
        filters: Optional filters to apply to the search
        
    Returns:
        JSON string with search results
    """
    try:
        # Call the knowledge base API
        response = requests.post(
            KNOWLEDGE_BASE_API_ENDPOINT,
            json={
                "query": query,
                "document_type": document_type,
                "filters": filters or {}
            }
        )
        
        if response.status_code == 200:
            return response.text
        else:
            # Fallback to web search if knowledge base fails
            search_query = f"{document_type} {query}"
            web_results = await wrapper.invoke_tool("web_search", {"search_term": search_query})
            return json.dumps({"source": "web_search", "results": web_results})
            
    except Exception as e:
        return json.dumps({"error": str(e)})

@function_tool
async def search_web(wrapper: RunContextWrapper[UserContext], search_term: str) -> str:
    """
    Search the web for real-time information about products, prices, reviews, and more.
    
    Args:
        search_term: The search term to look up on the web
        
    Returns:
        JSON string with search results
    """
    try:
        # Call the built-in web_search tool
        web_results = await wrapper.invoke_tool("web_search", {"search_term": search_term})
        return json.dumps({"source": "web_search", "results": web_results})
    except Exception as e:
        return json.dumps({"error": str(e)}) 
    
# Add more tool functions below:
# Example template:
# @function_tool
# async def tool_name(parameter1: type, parameter2: type) -> str:
#     """Tool description"""
#     # Tool implementation
#     pass 