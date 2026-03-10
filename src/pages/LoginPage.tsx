import { useState, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { ApiError } from '../api/client'

// Fixed star field — positions in vw/vh percentages
const STARS = [
  { x:  4.2, y:  7.1, r: 0.8, o: 0.35 }, { x: 11.5, y:  2.8, r: 1.2, o: 0.50 },
  { x: 18.7, y: 14.3, r: 0.6, o: 0.30 }, { x: 25.1, y:  6.0, r: 1.0, o: 0.45 },
  { x: 31.4, y: 11.7, r: 1.5, o: 0.40 }, { x: 38.9, y:  3.5, r: 0.7, o: 0.55 },
  { x: 45.2, y:  9.2, r: 1.1, o: 0.35 }, { x: 52.8, y:  5.4, r: 0.9, o: 0.48 },
  { x: 60.3, y: 13.1, r: 1.3, o: 0.38 }, { x: 67.6, y:  2.1, r: 0.8, o: 0.52 },
  { x: 74.1, y:  8.7, r: 1.0, o: 0.42 }, { x: 81.5, y:  4.9, r: 1.4, o: 0.33 },
  { x: 88.3, y: 11.4, r: 0.7, o: 0.47 }, { x: 93.7, y:  6.8, r: 1.2, o: 0.40 },
  { x:  7.8, y: 22.5, r: 1.0, o: 0.38 }, { x: 14.2, y: 28.3, r: 0.6, o: 0.32 },
  { x: 22.6, y: 19.7, r: 1.3, o: 0.44 }, { x: 29.9, y: 25.1, r: 0.8, o: 0.50 },
  { x: 36.4, y: 31.8, r: 1.1, o: 0.36 }, { x: 43.7, y: 20.4, r: 0.7, o: 0.42 },
  { x: 57.2, y: 27.6, r: 1.4, o: 0.30 }, { x: 64.8, y: 18.9, r: 0.9, o: 0.55 },
  { x: 72.3, y: 24.2, r: 0.6, o: 0.38 }, { x: 79.6, y: 33.5, r: 1.2, o: 0.45 },
  { x: 86.1, y: 21.8, r: 1.0, o: 0.40 }, { x: 91.4, y: 29.0, r: 0.8, o: 0.35 },
  { x:  3.5, y: 42.0, r: 0.7, o: 0.30 }, { x: 96.2, y: 38.7, r: 1.1, o: 0.42 },
  { x:  9.1, y: 55.3, r: 0.9, o: 0.33 }, { x: 90.5, y: 51.6, r: 0.6, o: 0.38 },
  { x:  5.7, y: 68.4, r: 1.2, o: 0.45 }, { x: 94.8, y: 64.1, r: 0.8, o: 0.30 },
  { x: 12.4, y: 74.9, r: 1.0, o: 0.40 }, { x: 87.3, y: 77.2, r: 1.3, o: 0.35 },
  { x: 19.8, y: 83.6, r: 0.7, o: 0.50 }, { x: 80.6, y: 86.3, r: 1.1, o: 0.38 },
  { x: 27.3, y: 90.1, r: 0.9, o: 0.42 }, { x: 73.4, y: 92.7, r: 0.6, o: 0.33 },
  { x: 34.6, y: 95.8, r: 1.4, o: 0.30 }, { x: 65.9, y: 88.5, r: 0.8, o: 0.47 },
  { x: 42.1, y: 78.2, r: 0.7, o: 0.36 }, { x: 58.7, y: 80.9, r: 1.0, o: 0.40 },
  { x: 50.3, y: 92.4, r: 1.2, o: 0.35 }, { x: 48.9, y: 18.6, r: 0.6, o: 0.28 },
  { x:  2.1, y: 85.0, r: 1.5, o: 0.32 }, { x: 97.4, y: 15.3, r: 0.9, o: 0.44 },
  { x: 16.0, y: 38.0, r: 0.5, o: 0.28 }, { x: 84.0, y: 44.5, r: 0.5, o: 0.30 },
  { x: 55.5, y: 42.0, r: 0.5, o: 0.25 }, { x: 44.0, y: 58.0, r: 0.5, o: 0.27 },
]

function EyeIcon() {
  return (
    <svg
      width="34"
      height="22"
      viewBox="0 0 34 22"
      fill="none"
      stroke="white"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Upper eyelid — gently drooping, half-closed */}
      <path d="M2 13 C7 5, 27 5, 32 13" />
      {/* Lower eyelid — soft arc */}
      <path d="M2 13 C7 19, 27 19, 32 13" />
      {/* Pupil */}
      <circle cx="17" cy="14" r="3" />
    </svg>
  )
}

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)

  async function handleEnter() {
    if (!password || loading) return
    setError(null)
    setLoading(true)
    try {
      await login(password)
      navigate('/')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Incorrect password.')
      } else {
        setError('Connection failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleEnter()
  }

  return (
    <div
      className="relative flex items-center justify-center min-h-screen overflow-hidden"
      style={{
        background: 'linear-gradient(to bottom, #001245 0%, #002FA7 45%, #001650 100%)',
      }}
    >
      {/* Star field */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="white"
            opacity={s.o}
          />
        ))}
      </svg>

      {/* Content */}
      <div className="relative flex flex-col items-center" style={{ gap: '36px' }}>

        {/* Badge */}
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 64,
            height: 64,
            border: '1px solid rgba(255,255,255,0.35)',
          }}
        >
          <EyeIcon />
        </div>

        {/* Title */}
        <h1
          className="text-white text-5xl font-normal"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            letterSpacing: '0.3em',
            animation: 'fadeIn 1.8s ease both',
          }}
        >
          R E V E R I E
        </h1>

        {/* Subtitle */}
        <p
          className="text-white text-xs tracking-widest"
          style={{
            opacity: 0.5,
            letterSpacing: '0.12em',
            animation: 'fadeIn 1.8s ease 0.4s both',
          }}
        >
          · Tomorrow. In dreams. In every century. ·
        </p>

        {/* Spacer */}
        <div style={{ height: 8 }} />

        {/* Password input */}
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(null) }}
          onKeyDown={handleKeyDown}
          placeholder="Password"
          disabled={loading}
          className="
            bg-transparent text-white text-sm text-center
            placeholder-white/25 outline-none rounded-lg px-4 py-3
            border border-white/20
            focus:border-white/45
            transition-colors duration-300
            disabled:opacity-50
          "
          style={{ width: 280 }}
        />

        {/* Error message */}
        {error && (
          <p
            className="text-xs text-center"
            style={{ color: 'rgba(255,120,120,0.9)', marginTop: -20, width: 280 }}
          >
            {error}
          </p>
        )}

        {/* Submit button */}
        <button
          onClick={handleEnter}
          disabled={loading}
          className="
            text-white/80 text-sm rounded-lg py-3
            bg-transparent border border-white/20
            hover:bg-white/8 hover:text-white hover:border-white/35
            transition-colors duration-300 cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          style={{ width: 280, letterSpacing: '0.06em' }}
        >
          {loading ? 'Entering…' : 'Enter Reverie'}
        </button>

      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
