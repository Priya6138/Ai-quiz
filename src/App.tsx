import { useMemo, useState } from 'react'

type QuizQuestion = {
  question: string
  options: string[]
  answerIndex: number
}

function fallbackPlan(topic: string) {
  return [
    `Fallback 7-Day Plan for ${topic}`,
    'Day 1: Learn core definitions and make 10 flashcards.',
    'Day 2: Practice basic questions for 30 minutes.',


    
    'Day 3: Review mistakes and summarize weak points.',
    'Day 4: Solve medium-level practice tasks.',
    'Day 5: Timed practice with self-review.',
    'Day 6: Revise weak areas using active recall.',
    'Day 7: Final quick revision and mini mock test.',
  ].join('\n')
}

function fallbackQuiz(topic: string): QuizQuestion[] {
  return [
    {
      question: `What is the best first step to study ${topic} effectively?`,
      options: ['Skip basics', 'Build core understanding', 'Only memorize answers', 'Avoid practice'],
      answerIndex: 1,
    },
    {
      question: `Which method improves long-term memory most?`,
      options: ['Passive rereading', 'Active recall', 'No revision', 'Last-minute cramming'],
      answerIndex: 1,
    },
    {
      question: `How should you use wrong answers?`,
      options: ['Ignore them', 'Track and review them', 'Delete them', 'Avoid hard questions'],
      answerIndex: 1,
    },
    {
      question: `What is ideal for exam preparation?`,
      options: ['One long session', 'Short focused sessions', 'No plan', 'Only videos'],
      answerIndex: 1,
    },
    {
      question: `How should a study session end?`,
      options: ['Immediately stop', 'Quick self-test', 'Start random topic', 'Skip recap'],
      answerIndex: 1,
    },
  ]
}

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

async function callGemini(prompt: string, apiKey: string) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        topP: 0.95,
        maxOutputTokens: 900,
      },
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}).`)
  }

  let payload: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  } | null = null

  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
    } catch {
      throw new Error('Gemini returned invalid JSON.')
    }
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) {
    throw new Error('Gemini returned an empty response.')
  }

  return text
}

function parseQuizText(raw: string): QuizQuestion[] {
  let parsed: { questions?: QuizQuestion[] } | null = null

  try {
    parsed = JSON.parse(raw) as { questions?: QuizQuestion[] }
  } catch {
    const objectLike = raw.match(/\{[\s\S]*\}/)
    if (objectLike?.[0]) {
      try {
        parsed = JSON.parse(objectLike[0]) as { questions?: QuizQuestion[] }
      } catch {
        return []
      }
    }
  }

  const questions = Array.isArray(parsed?.questions) ? parsed.questions : []
  return questions.filter((question) => {
    const hasQuestion = typeof question.question === 'string' && question.question.trim().length > 0
    const hasOptions =
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      question.options.every((option) => typeof option === 'string' && option.trim().length > 0)
    const hasAnswer = Number.isInteger(question.answerIndex) && question.answerIndex >= 0 && question.answerIndex <= 3
    return hasQuestion && hasOptions && hasAnswer
  })
}

function App() {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  const [topic, setTopic] = useState('')
  const [plan, setPlan] = useState('')
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([])
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({})
  const [isLoadingPlan, setIsLoadingPlan] = useState(false)
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [showResult, setShowResult] = useState(false)

  const canGenerate = topic.trim().length > 0

  const score = useMemo(() => {
    return quizQuestions.reduce((acc, question, index) => {
      return selectedAnswers[index] === question.answerIndex ? acc + 1 : acc
    }, 0)
  }, [quizQuestions, selectedAnswers])

  const generatePlan = async () => {
    setError('')
    setWarning('')
    if (!canGenerate) {
      setError('Please enter a topic first.')
      return
    }

    if (!apiKey) {
      setError('App is not configured. Missing VITE_GEMINI_API_KEY.')
      return
    }

    setIsLoadingPlan(true)
    try {
      const prompt = `You are a study coach.
Create a practical 7-day study plan for this topic: ${topic.trim()}
Rules:
- Give one section per day (Day 1 to Day 7)
- For each day include focus, 2 tasks, and one quick revision check
- Keep language simple
- Under 220 words total`

      const text = await callGemini(prompt, apiKey)
      setPlan(text)
      setWarning('')
    } catch (caught) {
      setPlan(fallbackPlan(topic.trim()))
      setWarning(caught instanceof Error ? `${caught.message} Using fallback plan.` : 'Using fallback plan due to API issue.')
      setError('')
    } finally {
      setIsLoadingPlan(false)
    }
  }

  const generateQuiz = async () => {
    setError('')
    setWarning('')
    if (!canGenerate) {
      setError('Please enter a topic first.')
      return
    }

    if (!apiKey) {
      setError('App is not configured. Missing VITE_GEMINI_API_KEY.')
      return
    }

    setIsLoadingQuiz(true)
    setShowResult(false)
    try {
      const prompt = `Generate 5 multiple choice questions for topic: ${topic.trim()}
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
- Exactly 4 options each
- answerIndex must be 0,1,2,3
- No markdown`

      const text = await callGemini(prompt, apiKey)
      const questions = parseQuizText(text)

      if (questions.length === 0) {
        setQuizQuestions(fallbackQuiz(topic.trim()))
        setWarning('Gemini quiz format was invalid. Using fallback quiz.')
      } else {
        setQuizQuestions(questions.slice(0, 5))
        setWarning('')
      }
      setSelectedAnswers({})
    } catch (caught) {
      setQuizQuestions(fallbackQuiz(topic.trim()))
      setSelectedAnswers({})
      setWarning(caught instanceof Error ? `${caught.message} Using fallback quiz.` : 'Using fallback quiz due to API issue.')
      setError('')
    } finally {
      setIsLoadingQuiz(false)
    }
  }

  const chooseAnswer = (questionIndex: number, optionIndex: number) => {
    setSelectedAnswers((previous) => ({ ...previous, [questionIndex]: optionIndex }))
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">AI Study Assistant</p>
        <h1>Topic to Plan + Quiz</h1>
        <p className="hero-copy">Enter one topic, generate your study plan, and play a quiz instantly.</p>
      </section>

      <section className="tool-grid">
        <article className="input-card">
          <h2>Student Input</h2>
          <label>
            Topic
            <input
              type="text"
              placeholder="Photosynthesis"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>

          <div className="button-row">
            <button type="button" disabled={isLoadingPlan || isLoadingQuiz} onClick={generatePlan}>
              {isLoadingPlan ? 'Generating Plan...' : 'Generate Plan'}
            </button>
            <button type="button" disabled={isLoadingPlan || isLoadingQuiz} onClick={generateQuiz}>
              {isLoadingQuiz ? 'Generating Quiz...' : 'Generate Quiz'}
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}
          {warning && <p className="status-text">{warning}</p>}

          <h2>Study Plan</h2>
          {plan ? <pre>{plan}</pre> : <p className="status-text">Your generated plan appears here.</p>}
        </article>

        <article className="output-card">
          <h2>Quiz</h2>
          {quizQuestions.length === 0 ? (
            <p className="status-text">Generate a quiz to start playing.</p>
          ) : (
            <div className="quiz-list">
              {quizQuestions.map((question, questionIndex) => (
                <div className="quiz-card" key={`${question.question}-${questionIndex}`}>
                  <p className="quiz-question">
                    {questionIndex + 1}. {question.question}
                  </p>
                  <div className="quiz-options">
                    {question.options.map((option, optionIndex) => {
                      const selected = selectedAnswers[questionIndex] === optionIndex
                      const shouldMarkRight =
                        showResult && optionIndex === question.answerIndex && selectedAnswers[questionIndex] !== undefined
                      const shouldMarkWrong =
                        showResult && selected && optionIndex !== question.answerIndex

                      return (
                        <button
                          className={`option-btn ${selected ? 'selected' : ''} ${shouldMarkRight ? 'right' : ''} ${shouldMarkWrong ? 'wrong' : ''}`}
                          type="button"
                          key={`${option}-${optionIndex}`}
                          onClick={() => chooseAnswer(questionIndex, optionIndex)}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <button type="button" onClick={() => setShowResult(true)}>
                Submit Quiz
              </button>

              {showResult && (
                <p className="score-text">
                  Score: {score} / {quizQuestions.length}
                </p>
              )}
            </div>
          )}
        </article>
      </section>
    </main>
  )
}

export default App
