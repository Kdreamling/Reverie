import { useState } from 'react'
import { BookOpen, CheckCircle, X } from 'lucide-react'
import { generateTestPrompt } from '../api/study'

const QUESTION_TYPES = [
  { key: 'choice', label: '选择题', icon: '🔤' },
  { key: 'fill', label: '填空题', icon: '✏️' },
  { key: 'reading', label: '阅读理解', icon: '📖' },
  { key: 'translation', label: '翻译题', icon: '🔄' },
]

const COUNT_OPTIONS = [5, 10, 15, 20]

interface StudyPanelProps {
  onGenerate: (prompt: string) => void
  onClose: () => void
}

export default function StudyPanel({ onGenerate, onClose }: StudyPanelProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['choice'])
  const [count, setCount] = useState(10)
  const [includeErrors, setIncludeErrors] = useState(true)
  const [loading, setLoading] = useState(false)

  const toggleType = (key: string) => {
    setSelectedTypes(prev =>
      prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
    )
  }

  const handleGenerate = async () => {
    if (selectedTypes.length === 0) return
    setLoading(true)
    try {
      const result = await generateTestPrompt({
        question_types: selectedTypes,
        count,
        include_errors: includeErrors,
      })
      onGenerate(result.prompt)
    } catch (e) {
      console.error('Failed to generate prompt:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-5 mb-4"
      style={{
        background: '#fff',
        border: '1px solid #e8ecf5',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen size={18} style={{ color: '#002FA7' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#1a1f2e' }}>英语练习</h3>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-lg p-1 cursor-pointer"
          style={{ color: '#9aa3b8' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* 题型选择 */}
      <p className="text-xs font-medium mb-2" style={{ color: '#5a6a8a' }}>选择题型</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {QUESTION_TYPES.map(qt => {
          const selected = selectedTypes.includes(qt.key)
          return (
            <button
              key={qt.key}
              onClick={() => toggleType(qt.key)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer"
              style={{
                background: selected ? 'rgba(0,47,167,0.08)' : 'rgba(0,0,0,0.02)',
                border: selected ? '1px solid rgba(0,47,167,0.25)' : '1px solid #e8ecf5',
                color: selected ? '#002FA7' : '#7a8399',
              }}
            >
              <span>{qt.icon}</span>
              <span className="font-medium">{qt.label}</span>
              {selected && <CheckCircle size={14} className="ml-auto" />}
            </button>
          )
        })}
      </div>

      {/* 题目数量 */}
      <p className="text-xs font-medium mb-2" style={{ color: '#5a6a8a' }}>题目数量</p>
      <div className="flex gap-2 mb-4">
        {COUNT_OPTIONS.map(n => (
          <button
            key={n}
            onClick={() => setCount(n)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            style={{
              background: count === n ? '#002FA7' : 'rgba(0,0,0,0.02)',
              color: count === n ? '#fff' : '#7a8399',
              border: count === n ? '1px solid #002FA7' : '1px solid #e8ecf5',
            }}
          >
            {n} 题
          </button>
        ))}
      </div>

      {/* 错题融入 */}
      <label className="flex items-center gap-2 mb-5 cursor-pointer">
        <input
          type="checkbox"
          checked={includeErrors}
          onChange={e => setIncludeErrors(e.target.checked)}
          className="rounded"
          style={{ accentColor: '#002FA7' }}
        />
        <span className="text-xs" style={{ color: '#5a6a8a' }}>融入错题本知识点</span>
      </label>

      {/* 开始按钮 */}
      <button
        onClick={handleGenerate}
        disabled={selectedTypes.length === 0 || loading}
        className="w-full py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#002FA7', color: '#fff' }}
      >
        {loading ? '生成中...' : '开始出题'}
      </button>
    </div>
  )
}
