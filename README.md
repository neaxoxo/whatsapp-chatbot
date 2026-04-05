# Nea Chatbot

Nea Chatbot is an advanced, AI-powered WhatsApp assistant built using Node.js. It integrates the Baileys library for WhatsApp Web protocol connectivity and the Groq SDK to leverage high-performance Large Language Models (LLMs). The project focuses on creating a natural, human-like conversational experience with persistent memory and integrated media processing tools.

## About This Project

This project serves as a technical demonstration of modern backend development practices, specifically focusing on API integration, data persistence, and secure environment management. 

Nea is designed with a specific personality profile: a soft-spoken, confident, and emotionally intelligent assistant. Unlike traditional rule-based bots, Nea utilizes Llama 3.3 infrastructure to provide nuanced responses, making her capable of acting as a supportive companion while maintaining objective honesty.

## Core Features

- **Natural Language Processing**: Integrated with Groq Cloud (Llama 3.3 70B Versatile) for low-latency, high-intelligence dialogue.
- **Persistent Chat History**: Implements a localized JSON-based database logic to store and retrieve user contexts, ensuring the bot remembers conversations across system restarts.
- **Automated Sticker Engine**: Real-time conversion of images and videos into WhatsApp stickers using FFmpeg and WebP processing.
- **Security Hardening**: Utilizes environment variables for API key protection and comprehensive Git-ignore rules to prevent sensitive data leaks.
- **Human-like Interaction**: Features typing indicators (composing status) and automated natural introductions instead of static welcome messages.
- **Session Management**: Multi-file authentication state allows the bot to maintain a stable connection without frequent re-pairing.

## Tech Stack

- **Runtime Environment**: Node.js
- **WhatsApp Gateway**: Baileys (Socket-based)
- **AI Engine**: Groq SDK (Llama 3.3)
- **Media Processing**: Fluent-ffmpeg and FFmpeg-static
- **Data Persistence**: File System (FS) with JSON serialization
- **Environment Management**: Dotenv
- **Sticker Formatting**: wa-sticker-formatter

## Prerequisites

- Node.js v16.x or higher
- A Groq Cloud API Key
- FFmpeg installed on the host system (handled via ffmpeg-static)
- A mobile device with WhatsApp for pairing

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/neaxoxo/whatsapp-chatbot.git
   cd whatsapp-chatbot
   ```

2. Install the necessary dependencies:
   ```bash
   npm install
   ```

## Configuration

1. Create a file named `.env` in the root directory.
2. Add your Groq API Key to the file:
   ```text
   GROQ_API_KEY=your_actual_api_key_here
   ```
3. Ensure that `histories.json` and `.env` are listed in your `.gitignore` to maintain privacy and security.

## Usage

1. Launch the bot:
   ```bash
   node index.js
   ```
2. For the initial setup, enter your phone number (with country code) in the terminal when prompted.
3. Use the generated Pairing Code on your WhatsApp mobile app to link the device.

### Available Commands

| Command | Description |
| :--- | :--- |
| **.menu** | Displays the main menu and feature list. |
| **.sticker** | Converts an image or video (sent or replied to) into a sticker. |
| **.reset** | Deletes the specific chat history for the current user. |
| **Chat** | Sending any text message initiates a natural conversation with the AI. |

## Project Structure

```text
whatsapp-chatbot/
├── pairing_session/    # Authentication state files
├── index.js           # Core application logic
├── histories.json     # Persistent chat context storage
├── .env               # Private environment variables
├── .gitignore         # Version control exclusion rules
└── package.json       # Dependency and script definitions
```

## License

This project is licensed under the MIT License. You are free to use, modify, and distribute this software, provided that the original copyright notice is included.

## Disclaimer

This is an experimental AI project. The developer is not responsible for any misuse of the automated messaging features or AI-generated content. All API usage is subject to the Groq Cloud Rate Limits.
