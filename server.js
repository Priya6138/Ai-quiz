import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 8787)
const apiKey = process.env.GEMINI_API_KEY
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

app.use(cors())
app.use(express.json())

function createFallbackPlan(topic) {
  return [
    `7-Day Study Plan for ${topic}`,
    'Day 1: Learn core definitions, then make 10 flashcards. Quick check: explain topic in 3 lines.',
    'Day 2: Study main process/workflow. Practice 5 short questions. Quick check: teach it out loud.',
    'Day 3: Cover common mistakes and edge cases. Quick check: list top 5 pitfalls.',
    'Day 4: Solve medium-level problems for 45 minutes. Quick check: review wrong answers only.',
    'Day 5: Timed practice set. Quick check: summarize weak areas in bullet points.',
    'Day 6: Focus only on weak areas + spaced revision. Quick check: score yourself out of 10.',
    'Day 7: Final mixed revision and one mock run. Quick check: one-page cheat sheet recap.',
  ].join('\n')
}

function createFallbackQuiz(topic) {
  return [
    {
      question: `Which action best helps you retain ${topic} for longer?`,
      options: ['Passive rereading only', 'Active recall and spaced repetition', 'Skipping revision', 'Studying once before exam'],
      answerIndex: 1,
    },
    {
      question: `What should you do first when starting ${topic}?`,
      options: ['Memorize everything at once', 'Build core concept understanding', 'Jump to hardest exam paper', 'Avoid definitions'],
      answerIndex: 1,
    },
    {
      question: `Best way to use mistakes while learning ${topic}?`,
      options: ['Ignore them', 'Track and review them weekly', 'Delete wrong attempts', 'Only study solved answers'],
      answerIndex: 1,
    },
    {
      question: `For exam prep, what is most effective?`,
      options: ['Long single session', 'Short focused sessions with breaks', 'No plan', 'Only watching videos'],
      answerIndex: 1,
    },
    {
      question: `How should you end a study session for ${topic}?`,
      options: ['Stop suddenly', 'Quick self-test and summary notes', 'Start a new chapter immediately', 'Skip reflection'],
      answerIndex: 1,
    },
  ]
}

function isQuotaError(error) {
  if (!(error instanceof Error)) return false

  const statusCode = Number(error.statusCode || 0)
  const text = error.message || ''

  return (
    statusCode === 429 ||
    text.includes('Gemini error (429)') ||
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('Quota exceeded')
  )
}

async function callGemini(prompt, asJson = false) {
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in server environment')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: asJson ? 0.2 : 0.7,
          topP: 0.95,
          maxOutputTokens: 900,
          ...(asJson ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
  )

  const rawPayload = await response.text()

  if (!response.ok) {
    const detail = rawPayload || 'Unknown upstream error'
    const error = new Error(`Gemini error (${response.status}): ${detail}`)
    error.statusCode = response.status
    throw error
  }

  let payload
  try {
    payload = JSON.parse(rawPayload)
  } catch {
    throw new Error('Gemini returned malformed JSON payload')
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  return text
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/plan', async (req, res) => {
  const topic = String(req.body?.topic || '').trim()
  try {
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' })
    }

    const prompt = `You are a study coach.
Create a practical 7-day study plan for this topic: ${topic}
Rules:
- Give one day section per day (Day 1 to Day 7)
- For each day include: focus, 2 tasks, and 1 quick revision check
- Keep language simple
- Under 220 words total`

    const plan = await callGemini(prompt)
    return res.json({ plan })
  } catch (error) {
    if (isQuotaError(error)) {
      return res.json({
        plan: createFallbackPlan(topic),
        warning: 'Gemini quota exceeded. Showing fallback plan. Retry later with active quota.',
      })
    }

    return res.json({
      plan: createFallbackPlan(topic),
      warning: 'AI response format issue. Showing fallback plan.',
    })
  }
})

app.post('/api/quiz', async (req, res) => {
  const topic = String(req.body?.topic || '').trim()
  try {
    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' })
    }

    const prompt = `Generate 5 multiple choice questions for: ${topic}
Return strict JSON only in this shape:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answerIndex": 0
    }
  ]
}
Rules:
- Exactly 5 questions
- 4 options each
- answerIndex must be 0, 1, 2, or 3
- No markdown, no extra keys`

    const raw = await callGemini(prompt, true)

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return res.json({
        questions: createFallbackQuiz(topic),
        warning: 'AI returned malformed quiz JSON. Showing fallback quiz.',
      })
    }

    const questions = Array.isArray(parsed?.questions) ? parsed.questions : []
    const validQuestions = questions.filter((question) => {
      const hasText = typeof question?.question === 'string' && question.question.trim().length > 0
      const hasOptions =
        Array.isArray(question?.options) &&
        question.options.length === 4 &&
        question.options.every((option) => typeof option === 'string' && option.trim().length > 0)
      const hasValidAnswer = Number.isInteger(question?.answerIndex) && question.answerIndex >= 0 && question.answerIndex <= 3
      return hasText && hasOptions && hasValidAnswer
    })

    if (validQuestions.length === 0) {
      return res.json({
        questions: createFallbackQuiz(topic),
        warning: 'AI returned invalid quiz format. Showing fallback quiz.',
      })
    }

    return res.json({ questions: validQuestions.slice(0, 5) })
  } catch (error) {
    if (isQuotaError(error)) {
      return res.json({
        questions: createFallbackQuiz(topic),
        warning: 'Gemini quota exceeded. Showing fallback quiz. Retry later with active quota.',
      })
    }

    return res.json({
      questions: createFallbackQuiz(topic),
      warning: 'AI response format issue. Showing fallback quiz.',
    })
  }
})

app.listen(port, () => {
  console.log(`Study Sprint backend running on http://localhost:${port}`)
})
