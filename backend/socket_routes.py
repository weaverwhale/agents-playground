"""
Socket.IO routes for the Triple Whale agent system.
"""
import asyncio
import socketio
import uuid
import traceback

from agent import CustomRunner, moby_agent
from utils import format_agent_response, log, get_timestamp
import state

# Register Socket.IO event handlers
def register_socketio_handlers(sio: socketio.AsyncServer):
    log("Registering Socket.IO event handlers...", "INFO")
    
    @sio.event
    async def connect(sid, environ):
        log(f"Client connected: {sid}", "DEBUG")
        await sio.emit('connection_successful', {"status": "connected"}, room=sid)

    @sio.event
    async def disconnect(sid):
        log(f"Client disconnected: {sid}", "DEBUG")
        # Cancel any active tasks for this session
        state.cancel_active_tasks(sid)

    @sio.event
    async def cancel_stream(sid, data):
        """Cancel the stream for a specific user"""
        log(f"Cancelling stream for {sid}", "DEBUG")
        if state.cancel_active_tasks(sid):
            # Send cancellation confirmation
            await sio.emit('stream_cancelled', {}, room=sid)
            
            # Add cancellation message to chat history
            if 'user_id' in data:
                user_id = data['user_id']
                state.add_message_to_history(
                    user_id, 
                    "system", 
                    "[Response generation was cancelled]", 
                    get_timestamp()
                )
            
            return True
        return False

    @sio.event
    async def chat_request(sid, data):
        """Handle a chat request via Socket.IO"""
        log(f"Received chat request from {sid}: {data}", "DEBUG")
        
        if not isinstance(data, dict) or 'user_id' not in data or 'message' not in data:
            error_msg = 'Invalid request format'
            log(f"Error: {error_msg}", "ERROR")
            await sio.emit('error', {'message': error_msg}, room=sid)
            return
        
        user_id = data['user_id']
        message = data['message']
        
        log(f"Processing message from user {user_id}: {message}", "DEBUG")
        
        # Initialize or get user context
        context = state.get_or_create_user_context(user_id)
        # Add user message to chat history
        timestamp = get_timestamp()
        state.add_message_to_history(user_id, "user", message, timestamp)
        
        # Prepare input for the agent using chat history
        input_list = state.format_history_for_agent(user_id)
        if not input_list:
            input_list = message
        
        # Initial response to let the client know we're processing
        await sio.emit('stream_update', {
            "type": "loading", 
            "content": "Processing your request..."
        }, room=sid)
        
        # Create a separate task for processing the response
        async def process_agent_response():
            try:
                log(f"Creating task for user {user_id}", "DEBUG")
                
                # First, send a loading message
                await sio.emit('stream_update', {
                    "type": "loading", 
                    "content": "Generating response..."
                }, room=sid)
                
                # Reset tool notification tracking for this run - using a dictionary now instead of a set
                context['sent_tool_notifications'] = {}
                
                # Now, run the agent to get the response
                log(f"Running agent for user {user_id}", "DEBUG")
                result = await CustomRunner.run(
                    moby_agent, 
                    input_list, 
                    context=context,
                    socket=sio,
                    sid=sid
                )
                log(f"Agent run completed for user {user_id}")
                
                # Format the response safely
                try:
                    response_content = format_agent_response(result.final_output)
                except Exception as format_error:
                    # If there's an error formatting the output, return a simpler response
                    log(f"Error formatting response: {str(format_error)}")
                    if hasattr(result, 'final_output') and result.final_output is not None:
                        response_content = str(result.final_output)
                    else:
                        response_content = "I'm sorry, I wasn't able to generate a proper response."
                
                # Store the full response for chat history
                full_response = response_content
                
                # Split the response into words to simulate token-by-token generation
                words = response_content.split()
                chunks = []
                
                # Create chunks of approximately 5-10 words
                chunk_size = min(max(len(words) // 10, 5), 10)  # Between 5-10 words per chunk
                if chunk_size < 1:
                    chunk_size = 1
                    
                for i in range(0, len(words), chunk_size):
                    end = min(i + chunk_size, len(words))
                    chunk = ' '.join(words[i:end])
                    chunks.append(chunk)
                
                # Keep track of accumulated text to send progressive updates
                accumulated_text = ""
                
                log(f"Streaming response to user {user_id} in {len(chunks)} chunks")
                
                # Stream each chunk with a small delay between them
                for i, chunk in enumerate(chunks):
                    accumulated_text += chunk + " "
                    
                    # Send the accumulated text so far
                    await sio.emit('stream_update', {
                        "type": "partial", 
                        "content": accumulated_text.strip()
                    }, room=sid)
                    
                    # Add a slight delay between chunks
                    await asyncio.sleep(0.05)
                    
                    # Log progress occasionally
                    if i % 10 == 0:
                        log(f"Streamed {i}/{len(chunks)} chunks to user {user_id}")
                
                # Send the final completed message
                log(f"Sending final response to user {user_id}")
                await sio.emit('stream_update', {
                    "type": "content", 
                    "content": full_response
                }, room=sid)
                
                # Add assistant response to chat history
                state.add_message_to_history(user_id, "assistant", full_response, get_timestamp())
                
                # Remove task from active tasks
                log(f"Completing task for user {user_id}")
                state.remove_active_task(sid, asyncio.current_task())
                    
            except asyncio.CancelledError:
                log(f"Task cancelled for user {user_id}", "WARNING")
                raise
            except Exception as e:
                log(f"Error processing agent response: {str(e)}", "ERROR")
                log(f"Traceback: {traceback.format_exc()}", "ERROR")
                
                # Send error message to the client
                error_msg = f"Sorry, there was an error processing your request: {str(e)}"
                await sio.emit('stream_update', {
                    "type": "error",
                    "content": error_msg
                }, room=sid)
                
                # Add error message to chat history
                state.add_message_to_history(
                    user_id, 
                    "system", 
                    error_msg,
                    get_timestamp()
                )
                
                # Remove task from active tasks
                state.remove_active_task(sid, asyncio.current_task())
        
        # Create a task for processing the response
        task = asyncio.create_task(process_agent_response())
        
        # Store the task for potential cancellation
        state.register_active_task(sid, task)
        
        # Return immediately, as we're handling the response asynchronously
        return {"status": "processing"}

    @sio.event
    async def get_chat_history(sid, data):
        """Get chat history for a user"""
        log(f"Received get_chat_history request from {sid}: {data}", "DEBUG")
        
        if 'user_id' not in data:
            log("Error: Missing user_id in get_chat_history request", "ERROR")
            await sio.emit('error', {'message': 'Missing user_id parameter'}, room=sid)
            return
            
        user_id = data['user_id']
        history = state.get_chat_history(user_id)
        
        log(f"Sending chat history for user {user_id} ({len(history)} messages)", "DEBUG")
        await sio.emit('chat_history', {"messages": history}, room=sid)

    @sio.event
    async def clear_chat_history(sid, data):
        """Clear chat history for a user"""
        log(f"Received clear_chat_history request from {sid}: {data}", "DEBUG")
        
        if 'user_id' not in data:
            log("Error: Missing user_id in clear_chat_history request", "ERROR")
            await sio.emit('error', {'message': 'Missing user_id parameter'}, room=sid)
            return
            
        user_id = data['user_id']
        state.clear_chat_history(user_id)
        
        log(f"Cleared chat history for user {user_id}", "INFO")
        await sio.emit('chat_history_cleared', {"user_id": user_id}, room=sid)
    
    @sio.event
    async def ping(sid, data=None):
        """Ping to keep connection alive"""
        # Just respond with pong - no need to log this high-frequency event
        await sio.emit('pong', {}, room=sid)
    
    log("Socket.IO event handlers registered successfully", "INFO")
    return sio 