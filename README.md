# AI-Powered-Creators-analytics-platform
AI-Powered Creator Analytics Platform

This project is a RAG-based chatbot that helps content creators compare the performance of two social media videos. The application takes a YouTube video and an Instagram Reel as input, extracts their metadata and transcripts, stores transcript embeddings in a vector database, and allows users to ask questions about performance differences, engagement, hooks, creator information, and content strategy.

The goal was to build a system that goes beyond displaying analytics by providing contextual explanations using retrieval-augmented generation. Instead of relying only on video metrics, the chatbot can reference transcript content and video metadata to explain why one video may have performed better than another.

Main features

* Compare a YouTube video and an Instagram Reel
* Extract video metadata such as views, likes, comments, creator information, and duration
* Generate and store transcript embeddings
* Retrieve relevant transcript chunks using vector search
* Conversational chat interface with memory
* Source citations for generated responses
* Streaming AI responses
* Engagement rate calculation and comparison

Tech stack

Frontend

* React
* TypeScript
* Vite
* Tailwind CSS

Backend

* Node.js
* Express
* TypeScript

AI and RAG

* LangGraph
* Gemini
* OpenAI Embeddings
* Qdrant

Database

* PostgreSQL

Other tools

* yt-dlp
* FFmpeg
* Docker

How it works

1. The user provides a YouTube URL and an Instagram Reel URL.
2. Metadata and transcripts are extracted for both videos.
3. Transcripts are split into chunks and converted into embeddings.
4. Embeddings are stored in Qdrant along with video-specific metadata.
5. User questions are processed through a LangGraph workflow.
6. Relevant transcript chunks are retrieved and provided to Gemini as context.
7. Responses are streamed back to the chat interface along with source references.

Running locally

Clone the repository and install dependencies.

```bash
git clone <repository-url>
cd AI-Powered-Creators-analytics-platform
```

Create a .env file using the provided .env.example template and add the required API keys.

Start supporting services:

```bash
docker compose up -d
```

Start the backend:

```bash
cd server
npm install
npm run dev
```

Start the frontend in a separate terminal:

```bash
cd client
npm install
npm run dev
```

The frontend will be available on the Vite development server and the backend will run on port 3001 by default.

Environment variables

The following values are required:

```env
OPENAI_API_KEY=
GEMINI_API_KEY=
DATABASE_URL=
QDRANT_URL=
```

A complete example is available in .env.example.
