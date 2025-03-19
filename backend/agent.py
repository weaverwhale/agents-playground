"""
Agent configuration and runner system for Triple Whale.
"""
import os
import asyncio
import sys
import traceback
from utils import log

# Import tools - but handle potential import errors gracefully
try:
    from agents import Runner, Agent
    
    # Import our specialized tools
    from tools.text_to_sql import text_to_sql
    from tools.text_to_python import text_to_python
    from tools.searching import searching
    from tools.forecasting import forecasting
    from tools.marketing_mix_model import marketing_mix_model
    from tools.preload_dashboard_data import preload_dashboard_data
    from tools.vision import vision
    # Import fallback tools
    from tools.answer_nlq_question import answer_nlq_question
    from tools.search_web import search_web
    
    # Get model from environment or use default
    model = os.getenv('MODEL_CHOICE', 'gpt-4o-mini')
    
    # Create Moby - an ecommerce assistant agent with the approved tools
    moby_agent = Agent(
        name="Moby",
        instructions="""
        You are Moby 🐳, an assistant for e-commerce and marketing strategies on Triple Whale. Your users are marketing professionals and e-commerce managers. 
        Your mission is to assist without revealing your AI origins or internal reasoning. 
        You will use Consultative/Expert Mode, Professional and Encouraging, and Concise and Insight-numbers Driven in your responses to align with the user's communication preferences. 
        You never generate generic response.
        
        You can provide personalized product recommendations, help users find the best deals, 
        track orders, answer questions about products, and assist with various shopping-related tasks.
        
        You have access to these specific custom tools:
        1. text_to_sql: For getting data from the user's database by converting natural language to SQL.
        2. text_to_python: For converting natural language to Python code and executing it to analyze data.
        3. searching: For providing information about the Triple Whale platform, e-commerce, and marketing.
        4. forecasting: For forecasting time series metrics into the future based on historical data.
        5. marketing_mix_model: For analyzing ad budget allocation and predicting impact on business outcomes.
        6. preload_dashboard_data: For retrieving and analyzing data from existing Triple Whale dashboards.
        7. vision: For analyzing and describing uploaded images or videos to extract insights.
        
        Fallback tools (use only if the specialized tools fail):
        8. answer_nlq_question: General-purpose fallback for any e-commerce analytics question when specialized tools fail.
        9. search_web: For searching the web for information not available through other tools.
        
        Choose the most appropriate specialized tool based on the user's question:
        - Use 'text_to_sql' when the user needs specific data or metrics from their database.
        - Use 'text_to_python' when complex analysis or data transformations are needed.
        - Use 'searching' for questions about Triple Whale features, e-commerce concepts, or marketing strategies.
        - Use 'forecasting' when the user wants to predict future trends or metrics.
        - Use 'marketing_mix_model' for questions about ad budget allocation, channel performance, or ROAS optimization.
        - Use 'preload_dashboard_data' when referring to existing dashboard data or for quick insights.
        - Use 'vision' when the user has uploaded images or videos that need analysis.
        
        If a specialized tool fails to provide a satisfactory response or returns an error, try using the answer_nlq_question fallback tool.
        The answer_nlq_question tool can handle a wide range of e-commerce questions and should be used as a backup option.
        
        If you need to find general information not available in Triple Whale, use the search_web tool as a last resort.
        
        Always prefer using tools rather than generating answers from your general knowledge. For most questions, you should use at least one tool to provide accurate, up-to-date information.
        
        Always be helpful, informative, and enthusiastic about helping users optimize their e-commerce business.
        Focus on providing accurate information and actionable insights based on data.
        
        When making recommendations, consider the user's business context, industry trends, and data-driven insights.
        Always prioritize clear explanations of metrics and insights that drive business value.
        """,
        model=model,
        tools=[
            text_to_sql,
            text_to_python,
            searching,
            forecasting,
            marketing_mix_model,
            preload_dashboard_data,
            vision,
            # Fallback tools
            answer_nlq_question,
            search_web
        ]
    )
    
    # Create a Runner class that just passes context to tools
    class CustomRunner:
        @classmethod
        async def run(cls, agent, input, context=None, sid=None, socket=None):
            # Make a copy of the original context or create a new one
            run_context = dict(context or {})
            
            # Add socket and sid to context if provided
            if socket and sid:
                run_context['socket'] = socket
                run_context['sid'] = sid
                
                # Add a flag that tools can check to see if we're monitoring tools
                run_context['monitor_tools'] = True
            
            log(f"Starting run with agent: {agent.name}", "DEBUG")
            
            try:
                # Call the original Runner's run method, not recursively
                result = await Runner.run(agent, input, context=run_context)
                log(f"Agent run completed", "DEBUG")
                return result
            except Exception as e:
                log(f"Error in CustomRunner.run: {str(e)}", "ERROR")
                raise
        
except ImportError as e:
    log(f"ERROR: Unable to import required modules: {str(e)}", "ERROR")
    log(f"Traceback: {traceback.format_exc()}", "ERROR")
    
    # Define fallback mocks for Runner and Agent to prevent immediate crashes
    class MockAgent:
        def __init__(self, **kwargs):
            self.name = kwargs.get('name', 'Mock Agent')
            log(f"MOCK AGENT CREATED: {self.name}", "WARNING")
    
    class MockRunner:
        @classmethod
        async def run(cls, agent, input, context=None, sid=None, socket=None):
            log("MOCK RUNNER: Unable to run real agent due to import error", "WARNING")
            return type('obj', (object,), {'final_output': 'Error: Agent system is not available.'})
    
    # Create mock versions
    Agent = MockAgent  
    Runner = MockRunner
    moby_agent = MockAgent(name="Moby (Mock)")
    
    log("WARNING: Using mock implementations due to import failure!", "WARNING") 