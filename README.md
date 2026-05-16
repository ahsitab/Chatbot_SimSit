# SimSit AI

A premium, modern AI chatbot application built with Flask, OpenAI, and a sleek glassmorphism frontend.

## Features

- **Modern UI**: ChatGPT-style dark mode with premium aesthetics.
- **Streaming Responses**: Real-time message streaming from OpenAI.
- **Multiple Sessions**: Create, switch, and delete chat sessions.
- **Rich Content**: Full Markdown and syntax-highlighted code block support.
- **Voice Input**: Integrated Web Speech API for voice-to-text.
- **Responsive**: Fully optimized for mobile and desktop.
- **Security**: Environment variable management and rate limiting.

## Setup Instructions

### 1. Prerequisites
- Python 3.8+
- An OpenAI API Key

### 2. Installation
Open your terminal in the project directory and run:

```powershell
# Create a virtual environment (optional but recommended)
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configuration
Open the `.env` file and replace `your_openai_api_key_here` with your actual OpenAI API key.

```env
OPENAI_API_KEY=sk-...
FLASK_SECRET_KEY=any-random-string
```

### 4. Run Locally
```powershell
python app.py
```
The application will be available at `http://127.0.0.1:5000`.

## Project Structure
- `app.py`: Flask backend with streaming logic.
- `static/`: Frontend assets (CSS, JS).
- `templates/`: HTML templates.
- `.env`: API keys and secrets.
- `requirements.txt`: Python dependencies.

## Troubleshooting
- **API Key Error**: Ensure your API key is correct and has active credits.
- **CORS Errors**: The backend includes CORS support, but ensure you are accessing via the correct localhost URL.
- **Streaming Issues**: If streaming fails, check your network connection or API limits.
