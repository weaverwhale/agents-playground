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
    from tools import moby, search_web
    
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
        1. moby: Use this for any e-commerce analytics or insights about products, sales, marketing performance, ROAS, etc.
        2. search_web: Use this to find real-time information about products, prices, reviews from external sources.
        
        Always prefer using tools rather than generating answers from your general knowledge. For most questions, you should use at least one tool to provide accurate, up-to-date information.
        
        Always be helpful, informative, and enthusiastic about helping users find the best products.
        Focus on providing accurate information and making the shopping experience smoother.
        
        When making product recommendations, consider the user's budget, preferences, and past purchases.
        When comparing prices, always try to find the best deals and explain why they're good.
        """,
        model=model,
        tools=[
            moby,
            search_web
        ]
    )
    
    # Create a simplified Runner class that just passes context to tools
    class SimpleRunner(Runner):
        @classmethod
        async def run(cls, agent, input, context=None, sid=None, socket=None):
            # Make a copy of the original context or create a new one
            run_context = dict(context or {})
            
            # Add socket and sid to context if provided
            if socket and sid:
                run_context['socket'] = socket
                run_context['sid'] = sid
            
            log(f"Starting run with agent: {agent.name}", "DEBUG")
            
            try:
                result = await Runner.run(agent, input, context=run_context)
                log(f"Agent run completed", "DEBUG")
                return result
            except Exception as e:
                log(f"Error in Runner.run: {str(e)}", "ERROR")
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
    SimpleRunner = MockRunner
    moby_agent = MockAgent(name="Moby (Mock)")
    
    log("WARNING: Using mock implementations due to import failure!", "WARNING") 