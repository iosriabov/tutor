// API Configuration
const API_CONFIG = {
    baseURL: 'https://engly-0a42e6fd3cf7.herokuapp.com/api/',
    assistantId: 'asst_fW7IZC0o6LRM57Nxq9cELLr7',
    uhk: '3f5d8a9c7e6b4f2a1d0e6735c89bfa34'
};

// State
let threadId = null;
let isWaitingForResponse = false;

// DOM Elements
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeChat();
    setupEventListeners();
    setupViewportHandling();
});

// Setup Viewport Handling for mobile keyboards
function setupViewportHandling() {
    // Fix viewport height on iOS devices
    const setViewportHeight = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    // Set initial viewport height
    setViewportHeight();

    // Update on resize (including keyboard show/hide)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            setViewportHeight();
            // Ensure messages stay scrolled to bottom when keyboard appears
            if (document.activeElement === messageInput) {
                scrollToBottom();
            }
        }, 100);
    });

    // Handle focus events to ensure proper scrolling
    messageInput.addEventListener('focus', () => {
        setTimeout(() => {
            scrollToBottom();
        }, 300); // Delay to allow keyboard animation
    });

    // Prevent bounce scrolling on iOS
    document.body.addEventListener('touchmove', (e) => {
        if (!e.target.closest('.messages-container')) {
            e.preventDefault();
        }
    }, { passive: false });
}

// Setup Event Listeners
function setupEventListeners() {
    // Send button click
    sendButton.addEventListener('click', handleSendMessage);

    // Enter key to send (Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Enable/disable send button based on input
    messageInput.addEventListener('input', () => {
        const hasText = messageInput.value.trim().length > 0;
        sendButton.disabled = !hasText || isWaitingForResponse;
        autoResizeTextarea();
    });
}

// Auto-resize textarea
function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
}

// Initialize Chat - Create Thread
async function initializeChat() {
    try {
        showLoading(true);
        console.log('Creating thread...');

        const response = await fetch(`${API_CONFIG.baseURL}chat/create-thread`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                uhk: API_CONFIG.uhk
            })
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', errorText);
            throw new Error(`Failed to create thread: ${response.status}`);
        }

        const data = await response.json();
        threadId = data.id;
        console.log('Thread created successfully:', threadId);

    } catch (error) {
        console.error('Error initializing chat:', error);
        addSystemMessage(`Ошибка подключения к серверу: ${error.message}. Проверьте консоль браузера (F12).`);
    } finally {
        showLoading(false);
    }
}

// Handle Send Message
async function handleSendMessage() {
    const text = messageInput.value.trim();

    if (!text || !threadId || isWaitingForResponse) {
        return;
    }

    // Add user message to UI
    addMessage(text, 'user');

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;

    // Send message to API
    await sendMessageToAPI(text);
}

// Send Message to API with SSE
async function sendMessageToAPI(text) {
    isWaitingForResponse = true;
    showLoading(true);

    try {
        console.log('Sending message:', text);
        console.log('Thread ID:', threadId);

        const response = await fetch(`${API_CONFIG.baseURL}chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                threadId: threadId,
                assistantId: API_CONFIG.assistantId,
                uhk: API_CONFIG.uhk
            })
        });

        console.log('Stream response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', errorText);
            throw new Error(`Failed to send message: ${response.status}`);
        }

        // Create assistant message bubble
        const messageElement = addMessage('', 'assistant');
        const messageBubble = messageElement.querySelector('.message-bubble');

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedText = '';

        console.log('Reading SSE stream...');

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                console.log('Stream finished. Total text received:', receivedText.length, 'chars');
                break;
            }

            // Decode chunk
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Log raw chunk
            console.log('Raw chunk:', chunk);

            // Process complete SSE events
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // Keep incomplete event in buffer

            for (const line of lines) {
                if (!line.trim()) continue;

                console.log('Processing line:', line);

                // Parse SSE event
                const dataMatch = line.match(/^data: (.+)$/m);
                if (dataMatch) {
                    // НЕ используем trim() - чтобы сохранить пробелы!
                    const data = dataMatch[1];

                    console.log('Extracted data:', data);

                    // Skip [DONE] marker
                    if (data.trim() === '[DONE]') {
                        console.log('Received [DONE] marker');
                        continue;
                    }

                    // Append text to message (БЕЗ trim!)
                    messageBubble.textContent += data;
                    receivedText += data;
                    scrollToBottom();
                } else {
                    console.log('No data match for line:', line);
                }
            }
        }

        showLoading(false);

        // If no text was received, show error
        if (!receivedText) {
            messageBubble.textContent = 'Не удалось получить ответ от сервера.';
            messageBubble.style.color = '#FF3B30';
        }

    } catch (error) {
        console.error('Error sending message:', error);
        addSystemMessage(`Ошибка: ${error.message}. Проверьте консоль (F12).`);
        showLoading(false);
    } finally {
        isWaitingForResponse = false;
        sendButton.disabled = messageInput.value.trim().length === 0;
    }
}

// Add Message to UI
function addMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = text;

    messageDiv.appendChild(bubbleDiv);
    messagesContainer.appendChild(messageDiv);

    scrollToBottom();

    return messageDiv;
}

// Add System Message
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'intro-message';

    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.style.color = '#FF3B30';

    messageDiv.appendChild(paragraph);
    messagesContainer.appendChild(messageDiv);

    scrollToBottom();
}

// Show/Hide Loading Indicator
function showLoading(show) {
    loadingIndicator.style.display = show ? 'flex' : 'none';
}

// Scroll to Bottom
function scrollToBottom() {
    // Use requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}
