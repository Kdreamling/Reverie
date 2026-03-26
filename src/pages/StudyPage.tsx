import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUp, BookOpen, ChevronLeft, ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import { generateQuestions, explainChat, saveErrorsBatch, type Question, type ChatMessage as StudyChatMessage } from '../api/study'
import ReactMarkdown from 'react-markdown'

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  { key: 'choice', label: '选择题', icon: '🔤' },
  { key: 'fill', label: '填空题', icon: '✏️' },
  { key: 'reading', label: '阅读理解', icon: '📖' },
  { key: 'translation', label: '翻译题', icon: '🔄' },
]

const COUNT_OPTIONS = [5, 10, 15, 20]

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onStart }: { onStart: (questions: Question[]) => void }) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['choice'])
  const [count, setCount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleType = (key: string) => {
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
    )
  }

  const handleStart = async () => {
    if (selectedTypes.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const result = await generateQuestions({
        question_types: selectedTypes,
        count,
        include_errors: true,
      })
      if (result.questions.length === 0) {
        setError('AI 没有返回题目，请重试')
        return
      }
      onStart(result.questions)
    } catch (e) {
      setError('出题失败，请重试')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span style={{ fontSize: 48 }}>📝</span>
          <h2 className="text-xl font-semibold mt-4" style={{ color: '#1a1f2e' }}>英语练习</h2>
          <p className="text-sm mt-2" style={{ color: '#9aa3b8' }}>选择题型，AI 为你出题</p>
        </div>

        <p className="text-xs font-medium mb-2.5" style={{ color: '#5a6a8a' }}>题型</p>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {QUESTION_TYPES.map(qt => {
            const selected = selectedTypes.includes(qt.key)
            return (
              <button
                key={qt.key}
                onClick={() => toggleType(qt.key)}
                className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-sm transition-all cursor-pointer"
                style={{
                  background: selected ? 'rgba(0,47,167,0.08)' : '#fff',
                  border: selected ? '1.5px solid rgba(0,47,167,0.3)' : '1px solid #e8ecf5',
                  color: selected ? '#002FA7' : '#7a8399',
                }}
              >
                <span style={{ fontSize: 20 }}>{qt.icon}</span>
                <span className="font-medium">{qt.label}</span>
              </button>
            )
          })}
        </div>

        <p className="text-xs font-medium mb-2.5" style={{ color: '#5a6a8a' }}>数量</p>
        <div className="flex gap-2 mb-8">
          {COUNT_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer"
              style={{
                background: count === n ? '#002FA7' : '#fff',
                color: count === n ? '#fff' : '#7a8399',
                border: count === n ? '1px solid #002FA7' : '1px solid #e8ecf5',
              }}
            >
              {n}题
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-center mb-4" style={{ color: '#ef4444' }}>{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={selectedTypes.length === 0 || loading}
          className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-50"
          style={{ background: '#002FA7', color: '#fff' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> 出题中...
            </span>
          ) : '开始答题'}
        </button>
      </div>
    </div>
  )
}

// ─── Quiz Screen ──────────────────────────────────────────────────────────────

function QuizScreen({ questions, onSubmit }: {
  questions: Question[]
  onSubmit: (answers: Map<number, string>) => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<number, string>>(new Map())

  const q = questions[currentIndex]
  const total = questions.length
  const answered = answers.size

  const setAnswer = (value: string) => {
    setAnswers(prev => new Map(prev).set(q.id, value))
  }

  const goNext = () => {
    if (currentIndex < total - 1) setCurrentIndex(i => i + 1)
  }
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1)
  }

  const handleSubmit = () => {
    onSubmit(answers)
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Progress */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: '#5a6a8a' }}>
            第 {currentIndex + 1} / {total} 题
          </span>
          <span className="text-xs" style={{ color: '#9aa3b8' }}>
            已答 {answered}/{total}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#e8ecf5' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / total) * 100}%`, background: '#002FA7' }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="max-w-lg mx-auto">
          {/* Reading passage */}
          {q.passage && (
            <div
              className="rounded-xl p-4 mb-4 text-sm leading-relaxed"
              style={{ background: '#f8f9fc', border: '1px solid #e8ecf5', color: '#3a4255' }}
            >
              {q.passage}
            </div>
          )}

          {/* Question text */}
          <h3 className="text-base font-medium mb-6 leading-relaxed" style={{ color: '#1a1f2e' }}>
            {q.question}
          </h3>

          {/* Choice options */}
          {q.type === 'choice' && q.options && (
            <div className="space-y-3">
              {q.options.map((opt, i) => {
                const letter = opt.charAt(0)
                const isSelected = answers.get(q.id) === letter
                return (
                  <button
                    key={i}
                    onClick={() => setAnswer(letter)}
                    className="w-full text-left px-4 py-3.5 rounded-xl text-sm transition-all cursor-pointer"
                    style={{
                      background: isSelected ? 'rgba(0,47,167,0.08)' : '#fff',
                      border: isSelected ? '1.5px solid #002FA7' : '1px solid #e8ecf5',
                      color: isSelected ? '#002FA7' : '#3a4255',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}

          {/* Fill / Translation input */}
          {(q.type === 'fill' || q.type === 'translation') && (
            <textarea
              value={answers.get(q.id) || ''}
              onChange={e => setAnswer(e.target.value)}
              placeholder={q.type === 'fill' ? '填写答案...' : '输入翻译...'}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
              style={{
                border: '1px solid #e8ecf5',
                minHeight: q.type === 'translation' ? 100 : 50,
                color: '#1a1f2e',
              }}
            />
          )}

          {/* Reading choice (same as choice) */}
          {q.type === 'reading' && q.options && (
            <div className="space-y-3">
              {q.options.map((opt, i) => {
                const letter = opt.charAt(0)
                const isSelected = answers.get(q.id) === letter
                return (
                  <button
                    key={i}
                    onClick={() => setAnswer(letter)}
                    className="w-full text-left px-4 py-3.5 rounded-xl text-sm transition-all cursor-pointer"
                    style={{
                      background: isSelected ? 'rgba(0,47,167,0.08)' : '#fff',
                      border: isSelected ? '1.5px solid #002FA7' : '1px solid #e8ecf5',
                      color: isSelected ? '#002FA7' : '#3a4255',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="px-6 pb-4 pt-2" style={{ paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 16px))' }}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center justify-center rounded-xl p-3 transition-colors cursor-pointer disabled:opacity-30"
            style={{ border: '1px solid #e8ecf5', color: '#5a6a8a' }}
          >
            <ChevronLeft size={18} />
          </button>

          {currentIndex < total - 1 ? (
            <button
              onClick={goNext}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer"
              style={{
                background: answers.has(q.id) ? '#002FA7' : '#e8ecf5',
                color: answers.has(q.id) ? '#fff' : '#9aa3b8',
              }}
            >
              下一题
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer"
              style={{ background: '#002FA7', color: '#fff' }}
            >
              提交答卷 ({answered}/{total})
            </button>
          )}

          <button
            onClick={goNext}
            disabled={currentIndex === total - 1}
            className="flex items-center justify-center rounded-xl p-3 transition-colors cursor-pointer disabled:opacity-30"
            style={{ border: '1px solid #e8ecf5', color: '#5a6a8a' }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Dot navigation */}
        <div className="flex justify-center gap-1.5 mt-3">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className="rounded-full transition-all cursor-pointer"
              style={{
                width: i === currentIndex ? 20 : 8,
                height: 8,
                background: answers.has(questions[i].id)
                  ? '#002FA7'
                  : i === currentIndex
                    ? 'rgba(0,47,167,0.3)'
                    : '#e8ecf5',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Result Screen ────────────────────────────────────────────────────────────

function ResultScreen({ questions, answers, onExplain, onRestart }: {
  questions: Question[]
  answers: Map<number, string>
  onExplain: () => void
  onRestart: () => void
}) {
  const results = questions.map(q => {
    const userAnswer = answers.get(q.id) || ''
    const isChoice = q.type === 'choice' || q.type === 'reading'
    const isCorrect = isChoice
      ? userAnswer.toUpperCase() === q.answer.toUpperCase().charAt(0)
      : userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase()
    return { ...q, userAnswer, isCorrect }
  })

  const correct = results.filter(r => r.isCorrect).length
  const total = questions.length
  const score = Math.round((correct / total) * 100)

  return (
    <div className="flex-1 overflow-auto px-6 py-8">
      <div className="max-w-sm mx-auto text-center">
        {/* Score circle */}
        <div
          className="inline-flex items-center justify-center rounded-full mb-4"
          style={{
            width: 120, height: 120,
            background: score >= 80 ? 'rgba(34,197,94,0.1)' : score >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
            border: `3px solid ${score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'}`,
          }}
        >
          <div>
            <div className="text-3xl font-bold" style={{ color: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444' }}>
              {score}
            </div>
            <div className="text-xs" style={{ color: '#9aa3b8' }}>{correct}/{total}</div>
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-1" style={{ color: '#1a1f2e' }}>
          {score >= 80 ? '太棒了！' : score >= 60 ? '还不错！' : '继续加油！'}
        </h2>
        <p className="text-sm mb-6" style={{ color: '#9aa3b8' }}>
          {score >= 80 ? '你做得很好，保持下去！' : score >= 60 ? '还有进步空间，加油哦～' : '不要灰心，学习是一步步来的～'}
        </p>

        {/* Question results */}
        <div className="text-left space-y-2 mb-8">
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: r.isCorrect ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${r.isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}
            >
              <span style={{ color: r.isCorrect ? '#22c55e' : '#ef4444' }}>
                {r.isCorrect ? '✅' : '❌'}
              </span>
              <span className="text-sm flex-1 truncate" style={{ color: '#3a4255' }}>
                {r.question.slice(0, 40)}...
              </span>
              <span className="text-xs" style={{ color: '#9aa3b8' }}>
                {r.userAnswer || '未答'} {!r.isCorrect && `→ ${r.answer}`}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {results.some(r => !r.isCorrect) && (
            <button
              onClick={onExplain}
              className="w-full py-3 rounded-xl text-sm font-medium cursor-pointer"
              style={{ background: '#002FA7', color: '#fff' }}
            >
              AI 讲解错题
            </button>
          )}
          <button
            onClick={onRestart}
            className="w-full py-3 rounded-xl text-sm font-medium cursor-pointer flex items-center justify-center gap-2"
            style={{ border: '1px solid #e8ecf5', color: '#5a6a8a' }}
          >
            <RotateCcw size={14} /> 再练一组
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Explanation Chat Screen ──────────────────────────────────────────────────

function ExplanationScreen({ wrongQuestions, onBack }: {
  wrongQuestions: Array<Question & { userAnswer: string }>
  onBack: () => void
}) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [chatHistory, setChatHistory] = useState<StudyChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const q = wrongQuestions[currentIdx]
  const total = wrongQuestions.length

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatHistory, loading])

  // Load explanation for current question
  useEffect(() => {
    setChatHistory([])
    setLoading(true)
    explainChat({
      question: q.passage ? `[文章] ${q.passage.slice(0, 200)}...\n[题目] ${q.question}` : q.question,
      user_answer: q.userAnswer || '未作答',
      correct_answer: q.answer,
      knowledge: q.knowledge || '',
    }).then(res => {
      setChatHistory(res.messages)
    }).catch(() => {
      setChatHistory([{ role: 'assistant', content: '讲解加载失败，请重试' }])
    }).finally(() => setLoading(false))
  }, [currentIdx])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const msg = input.trim()
    setInput('')
    const newHistory = [...chatHistory, { role: 'user' as const, content: msg }]
    setChatHistory(newHistory)
    setLoading(true)

    try {
      const res = await explainChat(
        { question: q.question, user_answer: q.userAnswer, correct_answer: q.answer, knowledge: q.knowledge || '' },
        newHistory,
        msg,
      )
      setChatHistory(res.messages)
    } catch {
      setChatHistory([...newHistory, { role: 'assistant', content: '回复失败，请重试' }])
    } finally {
      setLoading(false)
    }
  }

  const goNext = () => {
    if (currentIdx < total - 1) setCurrentIdx(i => i + 1)
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Question header */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #e8ecf5', background: 'rgba(239,68,68,0.03)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium" style={{ color: '#ef4444' }}>❌ 错题 {currentIdx + 1}/{total}</span>
          {currentIdx < total - 1 && (
            <button onClick={goNext} className="text-xs font-medium cursor-pointer" style={{ color: '#002FA7' }}>
              下一题 →
            </button>
          )}
          {currentIdx === total - 1 && (
            <button onClick={onBack} className="text-xs font-medium cursor-pointer" style={{ color: '#5a6a8a' }}>
              返回成绩
            </button>
          )}
        </div>
        <p className="text-sm" style={{ color: '#3a4255' }}>{q.question}</p>
        <p className="text-xs mt-1" style={{ color: '#9aa3b8' }}>
          你的答案：{q.userAnswer || '未答'} → 正确：{q.answer}
        </p>
      </div>

      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4">
        <div className="max-w-lg mx-auto space-y-4">
          {chatHistory.filter(m => m.role !== 'user' || chatHistory.indexOf(m) > 0).map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
              <div
                className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                style={{
                  maxWidth: '85%',
                  background: msg.role === 'user' ? '#002FA7' : '#f4f5f9',
                  color: msg.role === 'user' ? '#fff' : '#3a4255',
                }}
              >
                {msg.role === 'assistant' ? (
                  <div className="md-content">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3" style={{ color: '#9aa3b8' }}>
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs">思考中...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 pt-2" style={{ paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 16px))' }}>
        <div className="max-w-lg mx-auto flex gap-3 items-end">
          <div className="flex-1 flex items-end rounded-2xl px-4 py-2.5" style={{ background: '#fff', border: '1px solid #e8ecf5' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
              disabled={loading}
              placeholder="追问..."
              className="flex-1 text-sm outline-none bg-transparent disabled:opacity-40"
              style={{ color: '#1a1f2e' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 flex items-center justify-center rounded-full cursor-pointer disabled:opacity-30"
            style={{ width: 36, height: 36, background: '#002FA7', color: '#fff' }}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main StudyPage ───────────────────────────────────────────────────────────

export default function StudyPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'setup' | 'quiz' | 'result' | 'explain'>('setup')
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Map<number, string>>(new Map())
  const [wrongQuestions, setWrongQuestions] = useState<Array<Question & { userAnswer: string }>>([])

  const handleStart = useCallback((qs: Question[]) => {
    setQuestions(qs)
    setAnswers(new Map())
    setStep('quiz')
  }, [])

  const handleSubmit = useCallback(async (ans: Map<number, string>) => {
    setAnswers(ans)
    setStep('result')

    // Compute wrong questions
    const wrongs = questions.filter(q => {
      const userAns = ans.get(q.id) || ''
      const isChoice = q.type === 'choice' || q.type === 'reading'
      return isChoice
        ? userAns.toUpperCase() !== q.answer.toUpperCase().charAt(0)
        : userAns.trim().toLowerCase() !== q.answer.trim().toLowerCase()
    }).map(q => ({ ...q, userAnswer: ans.get(q.id) || '' }))

    setWrongQuestions(wrongs)

    // Save wrong answers to error book
    if (wrongs.length > 0) {
      try {
        await saveErrorsBatch(wrongs.map(q => ({
          question_type: q.type,
          question: q.passage ? `[阅读] ${q.question}` : q.question,
          correct_answer: q.answer,
          user_answer: q.userAnswer,
          tags: q.knowledge ? [q.knowledge] : [],
        })))
      } catch (e) {
        console.error('Failed to save errors:', e)
      }
    }
  }, [questions])

  const handleExplain = useCallback(() => {
    setStep('explain')
  }, [])

  const handleRestart = useCallback(() => {
    setStep('setup')
    setQuestions([])
    setAnswers(new Map())
    setWrongQuestions([])
  }, [])

  return (
    <div className="flex flex-col h-screen" style={{ background: '#fafbfd' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #e8ecf5', background: 'rgba(250,251,253,0.95)', backdropFilter: 'blur(10px)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="p-1.5 rounded-lg transition-colors cursor-pointer"
          style={{ color: '#8a95aa' }}
        >
          <ArrowLeft size={18} />
        </button>
        <BookOpen size={18} style={{ color: '#002FA7' }} />
        <span className="text-sm font-medium" style={{ color: '#1a1f2e' }}>英语练习</span>
        {step === 'quiz' && (
          <span className="ml-auto text-xs" style={{ color: '#9aa3b8' }}>{questions.length} 题</span>
        )}
      </div>

      {step === 'setup' && <SetupScreen onStart={handleStart} />}
      {step === 'quiz' && <QuizScreen questions={questions} onSubmit={handleSubmit} />}
      {step === 'result' && (
        <ResultScreen
          questions={questions}
          answers={answers}
          onExplain={handleExplain}
          onRestart={handleRestart}
        />
      )}
      {step === 'explain' && wrongQuestions.length > 0 && (
        <ExplanationScreen
          wrongQuestions={wrongQuestions}
          onBack={() => setStep('result')}
        />
      )}
    </div>
  )
}
