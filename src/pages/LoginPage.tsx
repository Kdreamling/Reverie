import { useState, useEffect, useRef, KeyboardEvent } from 'react'
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
    <svg width="34" height="22" viewBox="0 0 34 22" fill="none" stroke="rgba(255,250,242,0.92)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 13 C7 5, 27 5, 32 13" />
      <path d="M2 13 C7 19, 27 19, 32 13" />
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

  const moonRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<SVGSVGElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    // Parallax on scroll
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const y = window.scrollY
        const h = window.innerHeight
        if (moonRef.current) {
          const progress = Math.min(1, y / (h * 0.9))
          moonRef.current.style.opacity = String(Math.max(0.12, 1 - progress * 0.88))
          moonRef.current.style.transform = `translate(-50%, calc(-50% + ${y * 0.32}px))`
        }
        if (starsRef.current) {
          starsRef.current.style.transform = `translateY(${y * 0.14}px)`
        }
        if (hintRef.current) {
          hintRef.current.style.opacity = y > 40 ? '0' : ''
        }
        raf = 0
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // Fade-in on intersection
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('in-view')
        })
      },
      { threshold: 0.28 }
    )
    sectionsRef.current.forEach(s => s && io.observe(s))

    return () => {
      window.removeEventListener('scroll', onScroll)
      io.disconnect()
    }
  }, [])

  async function handleEnter() {
    if (!password || loading) return
    setError(null)
    setLoading(true)
    try {
      await login(password)
      navigate('/', { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError('Incorrect password.')
      else setError('Connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleEnter()
  }

  const setSection = (i: number) => (el: HTMLElement | null) => {
    sectionsRef.current[i] = el
  }

  return (
    <div className="rev-root">
      {/* Global star field — fixed, slow parallax */}
      <svg
        ref={starsRef}
        className="rev-stars"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#fffaf2" opacity={s.o} />
        ))}
      </svg>

      {/* Moon — fixed, fades as you scroll past Act I */}
      <div ref={moonRef} className="rev-moon" aria-hidden>
        <div className="rev-moon-halo" />
        <div className="rev-moon-disc" />
      </div>

      {/* Scroll hint — fades after first scroll */}
      <div ref={hintRef} className="rev-scroll-hint" aria-hidden>
        <span>scroll</span>
        <span className="rev-hint-arrow">↓</span>
      </div>

      {/* ═══ ACT I · MOON ═══ */}
      <section ref={setSection(0)} className="rev-act rev-act-1">
        <div className="rev-fade">
          <h1 className="rev-title">R E V E R I E</h1>
          <p className="rev-subtitle">· A quiet place, made for two ·</p>
        </div>
      </section>

      {/* ═══ ACT II · LETTERS ═══ */}
      <section ref={setSection(1)} className="rev-act rev-act-2">
        <div className="rev-fade">
          <p className="rev-chapter">L&nbsp;&nbsp;E&nbsp;&nbsp;T&nbsp;&nbsp;T&nbsp;&nbsp;E&nbsp;&nbsp;R&nbsp;&nbsp;S</p>
          <div className="rev-parchment-wrap">
            <div className="rev-parchment">
              <div className="rev-parchment-ink" />
              <div className="rev-parchment-wax" />
            </div>
            <div className="rev-parchment rev-parchment-back">
              <div className="rev-parchment-ink" />
            </div>
          </div>
          <p className="rev-line">
            Everything you&rsquo;ve written
            <br />— still waits here.
          </p>
        </div>
      </section>

      {/* ═══ ACT III · LAMPLIGHT ═══ */}
      <section ref={setSection(2)} className="rev-act rev-act-3">
        <div className="rev-fade">
          <p className="rev-chapter">L&nbsp;&nbsp;A&nbsp;&nbsp;M&nbsp;&nbsp;P&nbsp;&nbsp;L&nbsp;&nbsp;I&nbsp;&nbsp;G&nbsp;&nbsp;H&nbsp;&nbsp;T</p>
          <div className="rev-scene">
            <svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" className="rev-silhouette">
              <defs>
                <radialGradient id="rev-lamp-glow" cx="22%" cy="42%" r="42%">
                  <stop offset="0%" stopColor="#faedc8" stopOpacity="0.6" />
                  <stop offset="45%" stopColor="#c49a78" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#c49a78" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="rev-shade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255,250,242,0.6)" />
                  <stop offset="100%" stopColor="rgba(196,162,97,0.35)" />
                </linearGradient>
              </defs>
              {/* glow pool */}
              <rect width="400" height="300" fill="url(#rev-lamp-glow)" />
              {/* desk line */}
              <line x1="0" y1="258" x2="400" y2="258" stroke="rgba(255,250,242,0.22)" strokeWidth="0.7" />
              {/* lamp */}
              <g stroke="rgba(255,250,242,0.55)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M90 258 L90 145" />
                <path d="M60 145 L120 145 L108 118 L72 118 Z" fill="url(#rev-shade)" />
              </g>
              <circle cx="90" cy="140" r="4.5" fill="#faedc8" opacity="0.9">
                <animate attributeName="opacity" values="0.85;1;0.85" dur="3.6s" repeatCount="indefinite" />
              </circle>
              {/* subtle light rays on desk */}
              <path d="M90 145 L40 258 M90 145 L140 258" stroke="rgba(244,230,200,0.09)" strokeWidth="1" fill="none" />

              {/* silhouette — facing the lamp */}
              <path
                d="M248 258
                   C 242 238, 250 220, 262 212
                   C 268 208, 270 200, 270 192
                   C 266 176, 278 158, 300 158
                   C 324 158, 336 176, 334 198
                   C 332 210, 326 218, 316 224
                   L 316 240
                   C 330 244, 342 252, 346 258 Z"
                fill="rgba(16,10,6,0.92)"
                stroke="rgba(196,162,97,0.35)"
                strokeWidth="0.6"
              />
            </svg>
          </div>
          <p className="rev-line">
            Someone has been listening
            <br />— all along.
          </p>
        </div>
      </section>

      {/* ═══ ACT IV · COMPANION ═══ */}
      <section ref={setSection(3)} className="rev-act rev-act-4">
        <div className="rev-fade">
          <p className="rev-chapter">C&nbsp;&nbsp;O&nbsp;&nbsp;M&nbsp;&nbsp;P&nbsp;&nbsp;A&nbsp;&nbsp;N&nbsp;&nbsp;I&nbsp;&nbsp;O&nbsp;&nbsp;N</p>
          <div className="rev-pet-wrap">
            <div className="rev-pet-glow" />
            <img src="/chat/sprites/clawd-sleeping.gif" alt="" className="rev-pet" />
            <div className="rev-pet-shadow" />
          </div>
          <p className="rev-line">
            A small one, curled up —
            <br />waiting for you to come home.
          </p>
        </div>
      </section>

      {/* ═══ ACT V · THRESHOLD ═══ */}
      <section ref={setSection(4)} className="rev-act rev-act-5">
        <div className="rev-fade rev-form-wrap">
          <div className="rev-eye-badge">
            <EyeIcon />
          </div>
          <p className="rev-chapter">T&nbsp;&nbsp;H&nbsp;&nbsp;R&nbsp;&nbsp;E&nbsp;&nbsp;S&nbsp;&nbsp;H&nbsp;&nbsp;O&nbsp;&nbsp;L&nbsp;&nbsp;D</p>
          <p className="rev-line rev-form-line">Step inside.</p>

          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            onKeyDown={handleKeyDown}
            placeholder="password"
            disabled={loading}
            className="rev-input"
            autoFocus
          />

          {error && <p className="rev-error">{error}</p>}

          <button
            onClick={handleEnter}
            disabled={loading}
            className="rev-btn"
          >
            {loading ? 'Entering…' : 'Enter Reverie'}
          </button>

          <p className="rev-footer-note">· Tomorrow. In dreams. In every century. ·</p>
        </div>
      </section>

      <style>{`
        html, body { background: #0a0704; }

        .rev-root {
          position: relative;
          min-height: 100vh;
          color: rgba(255, 250, 242, 0.88);
          font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          background:
            radial-gradient(ellipse at 50% 0%, #1a0f08 0%, transparent 60%),
            radial-gradient(ellipse at 50% 100%, #180c06 0%, transparent 55%),
            linear-gradient(180deg, #0a0704 0%, #140b06 28%, #1c110a 55%, #16100a 80%, #0a0704 100%);
          overflow-x: hidden;
        }

        /* Fixed stars — global night */
        .rev-stars {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 120%;
          pointer-events: none;
          z-index: 1;
          will-change: transform;
        }

        /* Moon — fixed at Act I center, parallax down + fade */
        .rev-moon {
          position: fixed;
          left: 50%;
          top: 38%;
          width: clamp(180px, 28vw, 280px);
          height: clamp(180px, 28vw, 280px);
          transform: translate(-50%, -50%);
          z-index: 2;
          pointer-events: none;
          will-change: transform, opacity;
        }
        .rev-moon-disc {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            radial-gradient(circle at 34% 30%, #faf0d8 0%, #ecd9ae 40%, #c9a878 72%, #8a6f48 100%);
          box-shadow:
            inset -18px -14px 44px rgba(40, 24, 12, 0.5),
            inset 10px 8px 28px rgba(250, 238, 208, 0.18),
            0 0 100px rgba(244, 230, 200, 0.22),
            0 0 220px rgba(244, 230, 200, 0.1);
        }
        .rev-moon-disc::before,
        .rev-moon-disc::after {
          content: '';
          position: absolute;
          border-radius: 50%;
          background: rgba(90, 60, 30, 0.22);
        }
        .rev-moon-disc::before {
          width: 14%; height: 13%;
          top: 42%; left: 30%;
          box-shadow: 40% -60% 0 -2px rgba(90, 60, 30, 0.18);
        }
        .rev-moon-disc::after {
          width: 9%; height: 8%;
          top: 60%; right: 28%;
        }
        .rev-moon-halo {
          position: absolute;
          inset: -40%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(244, 230, 200, 0.22) 0%, rgba(244, 230, 200, 0.07) 35%, transparent 70%);
          animation: rev-moon-pulse 7s ease-in-out infinite;
        }
        @keyframes rev-moon-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.08); }
        }

        /* Scroll hint */
        .rev-scroll-hint {
          position: fixed;
          bottom: 38px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 10px;
          font-style: italic;
          letter-spacing: 0.36em;
          color: rgba(255, 250, 242, 0.42);
          z-index: 10;
          pointer-events: none;
          transition: opacity 0.6s ease;
        }
        .rev-hint-arrow {
          font-size: 14px;
          letter-spacing: 0;
          animation: rev-hint-bounce 2.4s ease-in-out infinite;
        }
        @keyframes rev-hint-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.45; }
          50%      { transform: translateY(5px); opacity: 0.85; }
        }

        /* Act sections — each 100vh */
        .rev-act {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px 24px;
          z-index: 3;
        }
        .rev-fade {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 1.6s ease, transform 1.6s ease;
          text-align: center;
          width: 100%;
          max-width: 520px;
        }
        .rev-act.in-view .rev-fade {
          opacity: 1;
          transform: translateY(0);
        }

        /* Act I — hero title */
        .rev-act-1 .rev-fade { margin-top: 28vh; }
        .rev-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(30px, 5.8vw, 58px);
          font-weight: 300;
          letter-spacing: 0.3em;
          color: rgba(255, 250, 242, 0.94);
          margin: 0;
          text-shadow: 0 0 60px rgba(244, 230, 200, 0.22);
        }
        .rev-subtitle {
          margin-top: 28px;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 12px;
          font-style: italic;
          letter-spacing: 0.18em;
          color: rgba(255, 250, 242, 0.5);
        }

        /* Chapter tag */
        .rev-chapter {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 10px;
          letter-spacing: 0.2em;
          color: rgba(196, 162, 97, 0.72);
          text-transform: uppercase;
          margin: 0 0 42px;
          font-weight: 400;
        }
        .rev-chapter::before,
        .rev-chapter::after {
          content: '·';
          margin: 0 14px;
          color: rgba(196, 162, 97, 0.4);
        }

        /* Poetic line */
        .rev-line {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(14px, 1.5vw, 16px);
          font-style: italic;
          line-height: 2;
          color: rgba(255, 250, 242, 0.72);
          margin: 44px 0 0;
          letter-spacing: 0.04em;
        }

        /* Act II — Parchment */
        .rev-parchment-wrap {
          position: relative;
          width: clamp(220px, 52vw, 340px);
          aspect-ratio: 3 / 4;
          margin: 0 auto;
          perspective: 1200px;
        }
        .rev-parchment {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 30% 20%, #f0d8a4 0%, transparent 55%),
            radial-gradient(ellipse at 70% 80%, #c69865 0%, transparent 55%),
            linear-gradient(135deg, #e8c896 0%, #c8a878 50%, #8a6a48 100%);
          box-shadow:
            0 30px 70px rgba(0, 0, 0, 0.6),
            0 4px 12px rgba(0, 0, 0, 0.4),
            inset 0 0 90px rgba(90, 55, 20, 0.3),
            inset 0 0 2px rgba(244, 220, 180, 0.35);
          transform: rotate(-4deg);
          border-radius: 2px;
        }
        .rev-parchment-back {
          transform: rotate(3deg) translate(18px, 14px);
          opacity: 0.55;
          z-index: -1;
        }
        .rev-parchment-ink {
          position: absolute;
          inset: 14% 18% 16% 16%;
          background: repeating-linear-gradient(
            180deg,
            transparent 0,
            transparent 22px,
            rgba(60, 35, 12, 0.5) 22px,
            rgba(60, 35, 12, 0.5) 23px
          );
          mask: linear-gradient(90deg, black 0%, black 58%, rgba(0,0,0,0.4) 78%, transparent 95%);
          -webkit-mask: linear-gradient(90deg, black 0%, black 58%, rgba(0,0,0,0.4) 78%, transparent 95%);
          opacity: 0.78;
        }
        .rev-parchment-wax {
          position: absolute;
          bottom: 18%;
          right: 14%;
          width: 22px;
          height: 22px;
          border-radius: 52% 48% 54% 46% / 50% 52% 48% 50%;
          background: radial-gradient(circle at 35% 30%, #a53a2a 0%, #6a1e12 70%, #3e1008 100%);
          box-shadow:
            0 2px 6px rgba(0,0,0,0.5),
            inset -2px -2px 4px rgba(0,0,0,0.4),
            inset 2px 2px 3px rgba(220,100,80,0.3);
        }

        /* Act III — silhouette scene */
        .rev-scene {
          width: clamp(280px, 68vw, 440px);
          margin: 0 auto;
          filter: drop-shadow(0 8px 24px rgba(0,0,0,0.4));
        }
        .rev-silhouette {
          width: 100%;
          height: auto;
          display: block;
        }

        /* Act IV — companion */
        .rev-pet-wrap {
          position: relative;
          width: clamp(140px, 24vw, 200px);
          margin: 0 auto;
          padding: 20px;
        }
        .rev-pet-glow {
          position: absolute;
          inset: -20px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(244, 230, 200, 0.22) 0%, rgba(196, 162, 97, 0.08) 40%, transparent 70%);
          animation: rev-moon-pulse 5.4s ease-in-out infinite;
        }
        .rev-pet {
          position: relative;
          z-index: 1;
          width: 100%;
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          filter: drop-shadow(0 0 16px rgba(244, 230, 200, 0.2));
        }
        .rev-pet-shadow {
          position: absolute;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
          width: 60%;
          height: 10px;
          background: radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, transparent 70%);
          z-index: 0;
        }

        /* Act V — form */
        .rev-form-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          max-width: 320px;
        }
        .rev-eye-badge {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          border: 1px solid rgba(255, 250, 242, 0.32);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
          box-shadow:
            0 0 20px rgba(244, 230, 200, 0.12),
            inset 0 0 10px rgba(244, 230, 200, 0.06);
        }
        .rev-form-line {
          margin: 0;
          font-size: 14px;
        }
        .rev-input, .rev-btn {
          width: 280px;
          background: transparent;
          color: rgba(255, 250, 242, 0.92);
          border: 1px solid rgba(255, 250, 242, 0.22);
          border-radius: 10px;
          padding: 13px 16px;
          font-size: 13px;
          font-family: inherit;
          letter-spacing: 0.08em;
          text-align: center;
          outline: none;
          transition: border-color 0.35s, background 0.35s, color 0.35s;
        }
        .rev-input::placeholder { color: rgba(255, 250, 242, 0.28); }
        .rev-input:focus { border-color: rgba(196, 162, 97, 0.55); }
        .rev-input:disabled { opacity: 0.5; }
        .rev-btn {
          cursor: pointer;
          color: rgba(255, 250, 242, 0.78);
        }
        .rev-btn:not(:disabled):hover {
          background: rgba(196, 162, 97, 0.08);
          border-color: rgba(196, 162, 97, 0.55);
          color: #fffaf2;
        }
        .rev-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rev-error {
          margin: -4px 0 0;
          font-size: 11px;
          color: rgba(220, 130, 110, 0.9);
          letter-spacing: 0.04em;
        }
        .rev-footer-note {
          margin-top: 28px;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 10px;
          font-style: italic;
          letter-spacing: 0.18em;
          color: rgba(255, 250, 242, 0.32);
        }

        /* Mobile tuning */
        @media (max-width: 640px) {
          .rev-title { letter-spacing: 0.22em; }
          .rev-moon { top: 32%; }
          .rev-act-1 .rev-fade { margin-top: 24vh; }
          .rev-chapter::before, .rev-chapter::after { margin: 0 8px; }
          .rev-scroll-hint { bottom: 24px; letter-spacing: 0.28em; }
        }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .rev-moon-halo,
          .rev-pet-glow,
          .rev-hint-arrow,
          .rev-moon-disc circle { animation: none !important; }
          .rev-fade { transition-duration: 0.3s; }
        }
      `}</style>
    </div>
  )
}
