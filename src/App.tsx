import { useMemo, useState } from 'react'

type QuizQuestion = {
  question: string
  options: string[]
  answerIndex: number
}

async function postJson<T>(url: string, body: object) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const raw = await response.text()
  let data: (T & { error?: string }) | null = null

  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as T & { error?: string }
    } catch {
      throw new Error('Server returned invalid JSON. Please try again.')
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || 'Request failed')
  }

  if (!data) {
    throw new Error('Server returned an empty response. Please try again.')
  }

  return data
}

function App() {
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

    setIsLoadingPlan(true)
    try {
      const data = await postJson<{ plan: string; warning?: string }>('/api/plan', { topic: topic.trim() })
      setPlan(data.plan)
      setWarning(data.warning || '')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to generate plan.')
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

    setIsLoadingQuiz(true)
    setShowResult(false)
    try {
      const data = await postJson<{ questions: QuizQuestion[]; warning?: string }>('/api/quiz', { topic: topic.trim() })
      setQuizQuestions(data.questions)
      setSelectedAnswers({})
      setWarning(data.warning || '')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to generate quiz.')
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
