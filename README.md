# Study Sprint Coach

React app where user enters one topic and uses AI to:

1. Generate a study plan
2. Generate and play a quiz

Gemini API is called directly from frontend using build-time environment variable.

## Stack

- React + TypeScript + Vite
- Google Gemini model: `gemini-2.5-flash`

## Run locally

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

Then set `VITE_GEMINI_API_KEY` in `.env`.

3. Start frontend

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Vercel Deployment (Single App)

1. Import this repo in Vercel.
2. Add environment variable in Vercel project settings:
`VITE_GEMINI_API_KEY=your_key`
3. Redeploy.

Users will only enter topic. No API key field is shown in UI.
