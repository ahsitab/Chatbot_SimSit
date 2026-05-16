import os
import json
import uuid
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env file
load_dotenv(override=True)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")
CORS(app)

# Initialize OpenAI Client (using Groq as the provider)
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(
    api_key=api_key,
    base_url="https://api.groq.com/openai/v1" # Point to Groq instead of OpenAI
)

# Initialize Rate Limiter: Prevent abuse by limiting requests per IP
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)

# In-memory session storage
# In a production environment, this should be replaced with a database like Redis or PostgreSQL
sessions = {}

@app.route('/')
def index():
    """Serve the main application page."""
    return render_template('index.html')

@app.route('/api/sessions', methods=['GET'])
def get_sessions():
    """Retrieve all active chat sessions."""
    return jsonify([{"id": sid, "title": s["title"]} for sid, s in sessions.items()])

@app.route('/api/sessions', methods=['POST'])
def create_session():
    """Create a new empty chat session."""
    sid = str(uuid.uuid4())
    sessions[sid] = {"messages": [], "title": "New Chat"}
    return jsonify({"id": sid, "title": "New Chat"})

@app.route('/api/sessions/<sid>', methods=['GET'])
def get_session_messages(sid):
    """Retrieve message history for a specific session."""
    if sid in sessions:
        return jsonify(sessions[sid])
    return jsonify({"error": "Session not found"}), 404

@app.route('/api/sessions/<sid>', methods=['DELETE'])
def delete_session(sid):
    """Delete a specific chat session."""
    if sid in sessions:
        del sessions[sid]
        return jsonify({"status": "success", "message": "Session deleted"})
    return jsonify({"error": "Session not found"}), 404

@app.route('/api/chat', methods=['POST'])
@limiter.limit("10 per minute")  # Basic rate limiting for chat endpoint
def chat():
    """Handle chat messages with streaming response."""
    data = request.json
    user_message = data.get('message')
    sid = data.get('session_id')

    if not user_message:
        return jsonify({"error": "No message provided"}), 400
    
    # If no session ID provided or session doesn't exist, create a new one
    if not sid or sid not in sessions:
        sid = str(uuid.uuid4())
        sessions[sid] = {"messages": [], "title": user_message[:30] + "..."}

    # Add user message to history
    sessions[sid]["messages"].append({"role": "user", "content": user_message})

    # Update title if it's still the default "New Chat"
    if sessions[sid]["title"] == "New Chat":
        sessions[sid]["title"] = user_message[:30] + ("..." if len(user_message) > 30 else "")

    def generate():
        try:
            # Prepare messages for OpenAI (include history for context/memory)
            # We limit history to last 10 messages to save tokens (simplified chat memory)
            history = sessions[sid]["messages"][-11:] 
            
            stream = client.chat.completions.create(
                model="llama-3.1-8b-instant", # The current high-speed workhorse model
                messages=history,
                stream=True,
            )
            
            full_assistant_response = ""
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    full_assistant_response += content
                    # Format as Server-Sent Event (SSE)
                    yield f"data: {json.dumps({'content': content})}\n\n"
            
            # Save assistant response to session history
            sessions[sid]["messages"].append({"role": "assistant", "content": full_assistant_response})
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            error_msg = str(e)
            print(f"!!! Error in streaming: {error_msg}")
            # If the error is related to model access, let's be specific
            if "model" in error_msg.lower():
                error_msg = f"Model Access Error: {error_msg}. Try using a different model."
            yield f"data: {json.dumps({'error': error_msg})}\n\n"

    # Return the generator as a streaming response
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Placeholder for file upload support (PDF/Images)."""
    # In a full implementation, you'd save the file and process it
    # For now, we return a mock success
    return jsonify({"status": "success", "message": "File uploaded (Demo Mode)"})

if __name__ == '__main__':
    # Ensure static and templates folders exist (handled by write_to_file usually)
    app.run(debug=True, port=5000)
