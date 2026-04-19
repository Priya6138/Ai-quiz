# Study Sprint Coach

React app where user enters one topic and uses AI to:

1. Generate a study plan
2. Generate and play a quiz

Gemini API is called from backend (Express), not from frontend input.

## Stack

- React + TypeScript + Vite (frontend)
- Node + Express (backend)
- Google Gemini free model: `gemini-2.0-flash`

## Run locally

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

Then set `GEMINI_API_KEY` in `.env`.

3. Start frontend + backend

```bash
npm run dev
```

Frontend runs on Vite, backend runs on `http://localhost:8787`.

## Build

```bash
npm run build
```
