# Chat Application

This project provides a chat interface to interact with an AI assistant that can help with travel planning, restaurant recommendations, local events, and transportation options.

## Project Structure

- **Backend**: FastAPI-based streaming API endpoint for the AI assistant
- **Frontend**: React-based chat interface

## Setup and Installation

### Prerequisites

- Python 3.8+ for the backend
- Node.js and npm for the frontend

### Backend Setup

1. Install the Python dependencies:

```bash
pip install -r requirements.txt
```

2. Set up your environment variables (optional):

```bash
# Create a .env file based on .env.example
cp .env.example .env
# Edit the .env file with your preferred settings
```

3. Run the FastAPI server:

```bash
python tw_agent_endpoint.py
```

The backend server will run at http://localhost:8000 by default.

### Frontend Setup

1. Navigate to the frontend directory:

```bash
cd frontend
```

2. Install the npm dependencies:

```bash
npm install
```

3. Start the React development server:

```bash
npm start
```

The frontend will run at http://localhost:3000 by default and will proxy API requests to the backend at http://localhost:8000.

## API Endpoints

- **POST /chat/stream**: Stream a response from the AI assistant
- **POST /chat**: Get a non-streaming response from the AI assistant
- **GET /chat/{user_id}/history**: Get the chat history for a user
- **POST /user/{user_id}/preferences**: Update user preferences
- **DELETE /chat/{user_id}**: Clear the chat history for a user

## Features

- Real-time streaming responses from the AI agent
- Personalized travel recommendations based on user preferences
- Support for flight and hotel recommendations
- Restaurant and local event search capabilities
- Transportation options
- Comprehensive travel planning

## Technologies Used

- **Backend**: FastAPI, OpenAI Agents SDK, Pydantic
- **Frontend**: React, Tailwind CSS, axios, react-markdown

## Development

The application uses FastAPI for the backend and React for the frontend. The backend provides a streaming API endpoint that the frontend connects to for real-time chat responses.

### Backend Structure

- **tw_agent_endpoint.py**: Main FastAPI application with API endpoints
- **tw_tools.py**: Custom tools for the AI assistant
- **v5_guardrails_and_context.py**: Context and guardrails for the AI assistant

### Frontend Structure

- **src/App.js**: Main React component
- **src/components/**: React components
  - **ChatMessage.js**: Component for rendering chat messages
  - **UserPreferences.js**: Component for managing user preferences 