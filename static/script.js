class SimSitApp {
    constructor() {
        this.currentSessionId = localStorage.getItem('simsit_session_id') || null;
        this.isTyping = false;
        this.speechRecognition = null;
        
        // DOM Elements
        this.messagesContainer = document.getElementById('messages-container');
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('send-btn');
        this.sessionsList = document.getElementById('sessions-list');
        this.newChatBtn = document.getElementById('new-chat-btn');
        this.currentSessionTitle = document.getElementById('current-session-title');
        this.welcomeScreen = document.getElementById('welcome-screen');
        this.clearChatBtn = document.getElementById('clear-chat-btn');
        this.voiceBtn = document.getElementById('voice-btn');
        this.sidebar = document.getElementById('sidebar');
        this.menuToggle = document.getElementById('menu-toggle');

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSessions();
        if (this.currentSessionId) {
            this.loadSession(this.currentSessionId);
        }
        this.setupMarkdown();
        this.setupVoice();
    }

    setupEventListeners() {
        // Auto-expand textarea
        this.chatInput.addEventListener('input', () => {
            this.chatInput.style.height = 'auto';
            this.chatInput.style.height = (this.chatInput.scrollHeight) + 'px';
            this.sendBtn.disabled = !this.chatInput.value.trim();
        });

        // Enter to send
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.newChatBtn.addEventListener('click', () => this.createNewSession());
        this.clearChatBtn.addEventListener('click', () => this.clearHistory());
        
        // Sidebar toggle for mobile
        this.menuToggle.addEventListener('click', () => {
            this.sidebar.classList.toggle('open');
        });
    }

    setupMarkdown() {
        marked.setOptions({
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true
        });
    }

    async loadSessions() {
        try {
            const response = await fetch('/api/sessions');
            const sessions = await response.json();
            this.renderSessionsList(sessions);
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    }

    renderSessionsList(sessions) {
        this.sessionsList.innerHTML = '';
        sessions.forEach(session => {
            const item = document.createElement('div');
            item.className = `session-item ${session.id === this.currentSessionId ? 'active' : ''}`;
            item.innerHTML = `
                <div class="session-title"><i data-lucide="message-square" style="width:14px; margin-right:8px;"></i>${session.title}</div>
                <div class="session-actions">
                    <button class="delete-session" onclick="event.stopPropagation(); app.deleteSession('${session.id}')">
                        <i data-lucide="trash-2" style="width:14px;"></i>
                    </button>
                </div>
            `;
            item.onclick = () => this.loadSession(session.id);
            this.sessionsList.appendChild(item);
        });
        lucide.createIcons();
    }

    async createNewSession() {
        try {
            const response = await fetch('/api/sessions', { method: 'POST' });
            const session = await response.json();
            this.currentSessionId = session.id;
            localStorage.setItem('simsit_session_id', session.id);
            this.messagesContainer.innerHTML = '';
            this.showWelcome(true);
            this.loadSessions();
            this.currentSessionTitle.innerText = 'New Chat';
        } catch (err) {
            console.error('Failed to create session:', err);
        }
    }

    async loadSession(sid) {
        this.currentSessionId = sid;
        localStorage.setItem('simsit_session_id', sid);
        this.showWelcome(false);
        this.messagesContainer.innerHTML = '';
        
        try {
            const response = await fetch(`/api/sessions/${sid}`);
            const data = await response.json();
            if (data.messages) {
                data.messages.forEach(msg => this.appendMessage(msg.role, msg.content));
                this.currentSessionTitle.innerText = data.title;
            }
            this.loadSessions();
        } catch (err) {
            console.error('Failed to load session:', err);
        }
    }

    async deleteSession(sid) {
        if (!confirm('Are you sure you want to delete this chat?')) return;
        try {
            await fetch(`/api/sessions/${sid}`, { method: 'DELETE' });
            if (this.currentSessionId === sid) {
                this.createNewSession();
            } else {
                this.loadSessions();
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
        }
    }

    async sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message || this.isTyping) return;

        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.sendBtn.disabled = true;
        this.showWelcome(false);

        // Add user message to UI
        this.appendMessage('user', message);
        this.scrollToBottom();

        // Create AI message placeholder
        const aiMessageDiv = this.appendMessage('ai', '');
        const aiTextContainer = aiMessageDiv.querySelector('.message-text');
        this.showTypingIndicator(aiTextContainer);

        this.isTyping = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    session_id: this.currentSessionId
                })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            aiTextContainer.innerHTML = ''; // Remove typing indicator

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') {
                            this.isTyping = false;
                            this.loadSessions(); // Update title if it changed
                            break;
                        }
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.error) {
                                aiTextContainer.innerHTML = `<span style="color: #ff4a4a;">Error: ${data.error}</span>`;
                                this.isTyping = false;
                                break;
                            }
                            if (data.content) {
                                fullContent += data.content;
                                aiTextContainer.innerHTML = DOMPurify.sanitize(marked.parse(fullContent));
                                hljs.highlightAll();
                                this.scrollToBottom();
                            }
                        } catch (e) {
                            console.error('Error parsing SSE:', e);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Chat error:', err);
            aiTextContainer.innerHTML = '<span style="color: #ff4a4a;">Error: Failed to connect to server.</span>';
        } finally {
            this.isTyping = false;
        }
    }

    appendMessage(role, content) {
        const row = document.createElement('div');
        row.className = `message-row ${role}`;
        
        const avatarColor = role === 'user' ? '#007bff' : '#10a37f';
        const avatarIcon = role === 'user' ? 'user' : 'bot';

        const htmlContent = role === 'ai' ? DOMPurify.sanitize(marked.parse(content)) : this.escapeHtml(content);

        row.innerHTML = `
            <div class="message-content">
                <div class="message-avatar" style="background: ${avatarColor}">
                    <i data-lucide="${avatarIcon}" style="width:20px; color:white;"></i>
                </div>
                <div class="message-text">
                    ${htmlContent}
                </div>
                ${role === 'ai' ? `
                <div class="message-actions">
                    <button class="action-btn copy-btn" title="Copy Text">
                        <i data-lucide="copy" style="width:14px;"></i>
                    </button>
                </div>` : ''}
            </div>
        `;
        
        this.messagesContainer.appendChild(row);

        // Add copy event
        if (role === 'ai') {
            const copyBtn = row.querySelector('.copy-btn');
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(content);
                const icon = copyBtn.querySelector('i');
                const originalIcon = icon.getAttribute('data-lucide');
                icon.setAttribute('data-lucide', 'check');
                lucide.createIcons();
                setTimeout(() => {
                    icon.setAttribute('data-lucide', originalIcon);
                    lucide.createIcons();
                }, 2000);
            });
        }

        lucide.createIcons();
        this.scrollToBottom();
        hljs.highlightAll();
        return row;
    }

    showTypingIndicator(container) {
        container.innerHTML = `
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
    }

    showWelcome(show) {
        if (show) {
            this.messagesContainer.innerHTML = '';
            this.messagesContainer.appendChild(this.welcomeScreen);
            this.welcomeScreen.style.display = 'flex';
        } else {
            this.welcomeScreen.style.display = 'none';
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTo({
            top: this.messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearHistory() {
        if (confirm('Clear current chat history?')) {
            this.messagesContainer.innerHTML = '';
            this.showWelcome(true);
            // We should also inform backend, but for simplicity we just clear UI
            // and we can restart the session.
            this.createNewSession();
        }
    }

    setupVoice() {
        if ('webkitSpeechRecognition' in window) {
            this.speechRecognition = new webkitSpeechRecognition();
            this.speechRecognition.continuous = false;
            this.speechRecognition.interimResults = false;

            this.speechRecognition.onresult = (event) => {
                const text = event.results[0][0].transcript;
                this.chatInput.value = text;
                this.chatInput.dispatchEvent(new Event('input'));
            };

            this.voiceBtn.addEventListener('click', () => {
                this.speechRecognition.start();
                this.voiceBtn.style.color = '#10a37f';
                setTimeout(() => { this.voiceBtn.style.color = ''; }, 3000);
            });
        } else {
            this.voiceBtn.style.display = 'none';
        }
    }
}

// Initialize the app
const app = new SimSitApp();
window.app = app; // For onclick handlers
