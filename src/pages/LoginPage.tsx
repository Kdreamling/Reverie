import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { ApiError } from '../api/client'

// Scattered stars across the sky — deterministic placement
const STARS = Array.from({ length: 120 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280
  const x = (seed / 233280) * 100
  const y = ((seed * 7 + 13) % 233280) / 233280 * 100
  const r = 0.25 + ((seed * 3) % 100) / 100 * 1.1
  const o = 0.18 + ((seed * 11) % 100) / 100 * 0.55
  const d = 2 + ((seed * 13) % 100) / 100 * 5
  return { x, y, r, o, d }
})

// Shooting stars — occasional diagonal streaks
const METEORS = Array.from({ length: 4 }, (_, i) => ({
  top: 10 + i * 22,
  left: 60 + i * 8,
  delay: i * 7.3,
  dur: 1.8 + i * 0.3,
}))

// Rising memory motes — faint lights drifting up through the sea
const MOTES = Array.from({ length: 26 }, (_, i) => {
  const seed = (i * 7919 + 104729) % 233280
  const x = (seed / 233280) * 100
  const delay = ((seed * 17) % 100) / 100 * 14
  const dur = 10 + ((seed * 19) % 100) / 100 * 10
  const drift = -10 + ((seed * 23) % 100) / 100 * 20
  const size = 1 + ((seed * 5) % 100) / 100 * 2.2
  return { x, delay, dur, drift, size }
})

// Orbits — each one has radius, speed, direction, and bodies on it
// Distances and speeds picked to feel like a real little system
const ORBITS = [
  { r: 90,  speed: 22, dir:  1, tilt: 0,  dashed: false, op: 0.28, bodies: [{ size: 3, color: '#f8e8c8', offset: 30 }] },
  { r: 130, speed: 38, dir: -1, tilt: 8,  dashed: true,  op: 0.22, bodies: [{ size: 2, color: '#c4baeb', offset: 120 }] },
  { r: 175, speed: 58, dir:  1, tilt: -6, dashed: false, op: 0.30, bodies: [{ size: 4, color: '#fffaf2', offset: 200 }, { size: 2, color: '#94b8f2', offset: 70 }] },
  { r: 225, speed: 82, dir: -1, tilt: 14, dashed: true,  op: 0.18, bodies: [{ size: 2.5, color: '#e8c8f0', offset: 0 }] },
  { r: 280, speed: 110, dir: 1, tilt: -10, dashed: false, op: 0.14, bodies: [{ size: 3, color: '#c4a267', offset: 160 }] },
]

// Gate orbits — the same system, miniaturized, for Act III
const GATE_ORBITS = [
  { r: 80,  speed: 20, dir: -1, dashed: false, op: 0.32, bodies: [{ size: 3, color: '#f8e8c8', offset: 0 }] },
  { r: 115, speed: 36, dir:  1, dashed: true,  op: 0.22, bodies: [{ size: 2, color: '#c4baeb', offset: 180 }] },
  { r: 155, speed: 56, dir: -1, dashed: false, op: 0.24, bodies: [{ size: 2.5, color: '#94b8f2', offset: 90 }] },
]

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [entering, setEntering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const login = useAuthStore(s => s.login)

  const rootRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const skyRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        const y = root.scrollTop
        const h = window.innerHeight
        if (heroRef.current) {
          const progress = Math.min(1, y / (h * 1.05))
          heroRef.current.style.opacity = String(Math.max(0.04, 1 - progress * 0.96))
          heroRef.current.style.transform =
            `translate(-50%, calc(-50% + ${y * 0.48}px)) scale(${1 - progress * 0.28})`
        }
        if (skyRef.current) {
          skyRef.current.style.transform = `translateY(${y * 0.14}px)`
        }
        if (hintRef.current) {
          hintRef.current.style.opacity = y > 40 ? '0' : ''
        }
        raf = 0
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('in-view')
          else e.target.classList.remove('in-view')
        })
      },
      { root, threshold: 0.28 }
    )
    sectionsRef.current.forEach(s => s && io.observe(s))

    return () => {
      root.removeEventListener('scroll', onScroll)
      io.disconnect()
    }
  }, [])

  async function handleEnter() {
    if (!password || loading) return
    setError(null)
    setLoading(true)
    try {
      await login(password)
      setEntering(true)
      setTimeout(() => navigate('/', { replace: true }), 950)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError('that word does not open this door.')
      else setError('the line is quiet. try again.')
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
    <div className={`dr-root${entering ? ' is-entering' : ''}`} ref={rootRef}>
      {/* ═══ Fixed sky — stars + nebulae + meteors ═══ */}
      <div className="dr-sky" ref={skyRef} aria-hidden>
        <div className="dr-nebula dr-nebula-a" />
        <div className="dr-nebula dr-nebula-b" />
        <div className="dr-nebula dr-nebula-c" />
        <svg className="dr-stars" xmlns="http://www.w3.org/2000/svg">
          {STARS.map((s, i) => (
            <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#fffaf2" opacity={s.o}>
              <animate attributeName="opacity" values={`${s.o};${s.o * 0.25};${s.o}`} dur={`${s.d}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </svg>
        {METEORS.map((m, i) => (
          <span
            key={i}
            className="dr-meteor"
            style={{
              top: `${m.top}%`,
              left: `${m.left}%`,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.dur}s`,
            }}
          />
        ))}
        <div className="dr-grain" />
      </div>

      {/* ═══ Hero — orrery with Reverie at center ═══ */}
      <div className="dr-hero" ref={heroRef} aria-hidden>
        <div className="dr-orrery">
          {ORBITS.map((o, i) => (
            <div
              key={i}
              className={`dr-orbit${o.dashed ? ' is-dashed' : ''}`}
              style={{
                width: `${o.r * 2}px`,
                height: `${o.r * 2}px`,
                opacity: o.op,
                transform: `translate(-50%, -50%) rotateX(62deg) rotateZ(${o.tilt}deg)`,
              }}
            >
              <div
                className="dr-orbit-track"
                style={{
                  animationDuration: `${o.speed}s`,
                  animationDirection: o.dir > 0 ? 'normal' : 'reverse',
                }}
              >
                {o.bodies.map((b, j) => (
                  <span
                    key={j}
                    className="dr-body"
                    style={{
                      width: `${b.size}px`,
                      height: `${b.size}px`,
                      background: b.color,
                      boxShadow: `0 0 ${b.size * 4}px ${b.color}, 0 0 ${b.size * 10}px ${b.color}`,
                      transform: `translate(-50%, -50%) rotate(${b.offset}deg) translateY(-${o.r}px)`,
                    }}
                  >
                    <span
                      className="dr-body-tail"
                      style={{
                        background: `linear-gradient(90deg, ${b.color}, transparent)`,
                      }}
                    />
                  </span>
                ))}
              </div>
            </div>
          ))}

          {/* Center — Reverie in cursive, glowing */}
          <h1 className="dr-title">Reverie</h1>
          <div className="dr-title-glow" />
        </div>
      </div>

      {/* Scroll hint */}
      <div ref={hintRef} className="dr-hint" aria-hidden>
        <span>descend</span>
        <span className="dr-hint-arrow">↓</span>
      </div>

      {/* ═══ ACT I — SKY ═══ */}
      <section ref={setSection(0)} className="dr-act dr-act-sky">
        <div className="dr-fade dr-hero-text">
          <p className="dr-kicker">a quiet place, made for two</p>
          <p className="dr-tagline">
            step through
            <br />— if you remember the way.
          </p>
        </div>
      </section>

      {/* ═══ ACT II — SEA (memories rising) ═══ */}
      <section ref={setSection(1)} className="dr-act dr-act-sea">
        <div className="dr-sea-motes" aria-hidden>
          {MOTES.map((m, i) => (
            <span
              key={i}
              className="dr-mote"
              style={{
                left: `${m.x}%`,
                animationDelay: `${m.delay}s`,
                animationDuration: `${m.dur}s`,
                width: `${m.size}px`,
                height: `${m.size}px`,
                // @ts-expect-error CSS var
                '--drift': `${m.drift}vw`,
              }}
            />
          ))}
        </div>
        <div className="dr-fade dr-sea-text">
          <p className="dr-chapter">beneath</p>
          <p className="dr-line">
            every word you wrote
            <br />is still drifting up
            <br />to meet you.
          </p>
          <div className="dr-ripple-wrap" aria-hidden>
            <div className="dr-ripple" style={{ animationDelay: '0s' }} />
            <div className="dr-ripple" style={{ animationDelay: '1.6s' }} />
            <div className="dr-ripple" style={{ animationDelay: '3.2s' }} />
          </div>
        </div>
      </section>

      {/* ═══ ACT III — GATE (small orrery wrapping the form) ═══ */}
      <section ref={setSection(2)} className="dr-act dr-act-door">
        <div className="dr-fade dr-door-wrap">
          <p className="dr-chapter">the threshold</p>

          <div className="dr-gate">
            <div className="dr-gate-orrery" aria-hidden>
              {GATE_ORBITS.map((o, i) => (
                <div
                  key={i}
                  className={`dr-orbit${o.dashed ? ' is-dashed' : ''}`}
                  style={{
                    width: `${o.r * 2}px`,
                    height: `${o.r * 2}px`,
                    opacity: o.op,
                    transform: `translate(-50%, -50%) rotateX(62deg)`,
                  }}
                >
                  <div
                    className="dr-orbit-track"
                    style={{
                      animationDuration: `${o.speed}s`,
                      animationDirection: o.dir > 0 ? 'normal' : 'reverse',
                    }}
                  >
                    {o.bodies.map((b, j) => (
                      <span
                        key={j}
                        className="dr-body"
                        style={{
                          width: `${b.size}px`,
                          height: `${b.size}px`,
                          background: b.color,
                          boxShadow: `0 0 ${b.size * 4}px ${b.color}, 0 0 ${b.size * 10}px ${b.color}`,
                          transform: `translate(-50%, -50%) rotate(${b.offset}deg) translateY(-${o.r}px)`,
                        }}
                      >
                        <span
                          className="dr-body-tail"
                          style={{
                            background: `linear-gradient(90deg, ${b.color}, transparent)`,
                          }}
                        />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="dr-gate-halo" />
              <img
                src="/chat/sprites/clawd-sleeping.gif"
                alt=""
                className="dr-gate-pet"
              />
            </div>

            <div className="dr-gate-form">
              <h2 className="dr-gate-title">reverie</h2>
              <div className="dr-input-wrap">
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null) }}
                  onKeyDown={handleKeyDown}
                  placeholder="whisper the word"
                  disabled={loading}
                  className="dr-input"
                  autoFocus
                />
                <div className="dr-input-orb" />
              </div>
              {error && <p className="dr-error">{error}</p>}
              <button
                onClick={handleEnter}
                disabled={loading || !password}
                className="dr-btn"
              >
                <span>{loading ? 'entering' : 'enter'}</span>
              </button>
            </div>
          </div>

          <p className="dr-footer-note">tomorrow · in dreams · in every century</p>
        </div>
      </section>

      {/* Bloom on success */}
      <div className="dr-bloom" aria-hidden />

      <style>{`
        /* ═══════════════════════════════════════════════════════════
           ROOT — deep night, layered gradients
           ═══════════════════════════════════════════════════════════ */
        .dr-root {
          position: absolute;
          inset: 0;
          overflow-y: auto;
          overflow-x: hidden;
          color: rgba(232, 236, 250, 0.88);
          font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          background:
            radial-gradient(ellipse at 50% -10%, rgba(58, 42, 104, 0.55) 0%, transparent 42%),
            radial-gradient(ellipse at 15% 28%, rgba(28, 46, 92, 0.48) 0%, transparent 38%),
            radial-gradient(ellipse at 85% 72%, rgba(46, 30, 88, 0.44) 0%, transparent 42%),
            radial-gradient(ellipse at 50% 110%, rgba(10, 18, 40, 0.92) 0%, transparent 55%),
            linear-gradient(180deg, #050914 0%, #0a1028 22%, #111833 48%, #0c1428 72%, #050810 100%);
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        /* ═══════════════════════════════════════════════════════════
           SKY — stars, nebulae, meteors, grain
           ═══════════════════════════════════════════════════════════ */
        .dr-sky {
          position: sticky;
          top: 0;
          left: 0;
          width: 100%;
          height: 100vh;
          margin-bottom: -100vh;
          pointer-events: none;
          z-index: 1;
          will-change: transform;
          overflow: hidden;
        }
        .dr-stars {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .dr-nebula {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          mix-blend-mode: screen;
          opacity: 0.55;
        }
        .dr-nebula-a {
          top: 10%; left: 8%;
          width: 44vw; height: 44vw;
          background: radial-gradient(circle, rgba(98, 78, 180, 0.38) 0%, transparent 65%);
          animation: dr-nebula-drift 32s ease-in-out infinite;
        }
        .dr-nebula-b {
          top: 36%; right: 6%;
          width: 38vw; height: 38vw;
          background: radial-gradient(circle, rgba(72, 108, 186, 0.34) 0%, transparent 60%);
          animation: dr-nebula-drift 40s ease-in-out infinite reverse;
        }
        .dr-nebula-c {
          bottom: 8%; left: 38%;
          width: 50vw; height: 50vw;
          background: radial-gradient(circle, rgba(126, 92, 168, 0.24) 0%, transparent 60%);
          animation: dr-nebula-drift 48s ease-in-out infinite;
        }
        @keyframes dr-nebula-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(3vw, -2vh) scale(1.08); }
          66%      { transform: translate(-2vw, 3vh) scale(0.95); }
        }

        .dr-meteor {
          position: absolute;
          width: 140px;
          height: 1px;
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(248, 232, 200, 0.9) 40%,
            rgba(255, 250, 242, 1) 85%,
            transparent 100%);
          transform: rotate(-28deg);
          animation: dr-meteor-run linear infinite;
          opacity: 0;
          filter: drop-shadow(0 0 4px rgba(248, 232, 200, 0.8));
        }
        @keyframes dr-meteor-run {
          0%          { transform: rotate(-28deg) translateX(0);     opacity: 0; }
          3%          { opacity: 1; }
          14%         { opacity: 1; }
          18%         { transform: rotate(-28deg) translateX(-60vw); opacity: 0; }
          100%        { opacity: 0; }
        }

        .dr-grain {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 3px 3px;
          mix-blend-mode: overlay;
          opacity: 0.6;
        }

        /* ═══════════════════════════════════════════════════════════
           HERO — the orrery, with Reverie at its center
           ═══════════════════════════════════════════════════════════ */
        .dr-hero {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 620px;
          height: 620px;
          pointer-events: none;
          z-index: 2;
          will-change: transform, opacity;
          perspective: 1600px;
        }
        .dr-orrery {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
        }

        /* Each orbit is a flat ring, tilted into perspective */
        .dr-orbit {
          position: absolute;
          top: 50%; left: 50%;
          border-radius: 50%;
          border: 0.5px solid rgba(220, 210, 250, 0.8);
          transform-style: preserve-3d;
        }
        .dr-orbit.is-dashed {
          border-style: dashed;
          border-width: 0.4px;
          border-color: rgba(196, 186, 235, 0.8);
        }
        /* Track holds the bodies; track rotates so bodies run around */
        .dr-orbit-track {
          position: absolute;
          top: 50%; left: 50%;
          width: 100%;
          height: 100%;
          transform-origin: 0 0;
          animation: dr-orbit-spin linear infinite;
        }
        @keyframes dr-orbit-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .dr-body {
          position: absolute;
          top: 0;
          left: 0;
          border-radius: 50%;
          transform-origin: 0 0;
          will-change: transform;
        }
        .dr-body-tail {
          position: absolute;
          top: 50%;
          right: 100%;
          width: 60px;
          height: 1px;
          transform: translateY(-50%);
          opacity: 0.55;
          filter: blur(0.5px);
        }

        /* The name — script at the heart of the system */
        .dr-title {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          margin: 0;
          font-family: 'Italianno', 'Cormorant Garamond', serif;
          font-weight: 400;
          font-size: clamp(96px, 14vw, 180px);
          letter-spacing: 0.01em;
          line-height: 1;
          color: rgba(255, 250, 242, 0.96);
          text-shadow:
            0 0 24px rgba(248, 232, 200, 0.55),
            0 0 64px rgba(196, 162, 97, 0.3),
            0 0 120px rgba(148, 184, 242, 0.18);
          white-space: nowrap;
          z-index: 2;
        }
        .dr-title-glow {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 320px; height: 140px;
          border-radius: 50%;
          background: radial-gradient(ellipse,
            rgba(248, 232, 200, 0.18) 0%,
            rgba(196, 162, 97, 0.08) 38%,
            transparent 72%);
          filter: blur(10px);
          z-index: 1;
          animation: dr-title-breathe 6s ease-in-out infinite;
        }
        @keyframes dr-title-breathe {
          0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
          50%      { opacity: 1;   transform: translate(-50%, -50%) scale(1.15); }
        }

        /* ═══════════════════════════════════════════════════════════
           SCROLL HINT
           ═══════════════════════════════════════════════════════════ */
        .dr-hint {
          position: fixed;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 11px;
          font-style: italic;
          letter-spacing: 0.42em;
          color: rgba(232, 236, 250, 0.4);
          z-index: 10;
          pointer-events: none;
          transition: opacity 0.8s ease;
          text-transform: lowercase;
        }
        .dr-hint-arrow {
          font-size: 14px;
          letter-spacing: 0;
          animation: dr-hint-bounce 2.6s ease-in-out infinite;
        }
        @keyframes dr-hint-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.45; }
          50%      { transform: translateY(6px); opacity: 0.85; }
        }

        /* ═══════════════════════════════════════════════════════════
           ACT SECTIONS
           ═══════════════════════════════════════════════════════════ */
        .dr-act {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 60px 24px;
          z-index: 3;
        }
        .dr-fade {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 1.8s ease, transform 1.8s ease;
          text-align: center;
          width: 100%;
          max-width: 540px;
        }
        .dr-act.in-view .dr-fade {
          opacity: 1;
          transform: translateY(0);
        }

        /* ACT I — hero text below the orrery */
        .dr-act-sky .dr-fade { margin-top: 68vh; }
        .dr-kicker {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 12px;
          font-style: italic;
          font-weight: 300;
          letter-spacing: 0.36em;
          color: rgba(248, 232, 200, 0.52);
          margin: 0 0 40px;
          text-transform: lowercase;
        }
        .dr-tagline {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: clamp(16px, 1.8vw, 20px);
          font-style: italic;
          font-weight: 300;
          line-height: 2.2;
          letter-spacing: 0.05em;
          color: rgba(232, 236, 250, 0.76);
          margin: 0;
        }

        .dr-chapter {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 11px;
          font-style: italic;
          letter-spacing: 0.42em;
          color: rgba(196, 180, 232, 0.6);
          margin: 0 0 50px;
          text-transform: lowercase;
        }
        .dr-chapter::before,
        .dr-chapter::after {
          content: '·';
          margin: 0 18px;
          color: rgba(196, 180, 232, 0.4);
        }

        .dr-line {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: clamp(16px, 1.8vw, 20px);
          font-style: italic;
          font-weight: 300;
          line-height: 2.3;
          color: rgba(232, 236, 250, 0.8);
          letter-spacing: 0.05em;
          margin: 0;
        }

        /* ═══════════════════════════════════════════════════════════
           ACT II — SEA
           ═══════════════════════════════════════════════════════════ */
        .dr-act-sea { flex-direction: column; gap: 50px; }

        .dr-sea-motes {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }
        .dr-mote {
          position: absolute;
          bottom: -20px;
          border-radius: 50%;
          background: radial-gradient(circle,
            rgba(255, 250, 242, 0.92) 0%,
            rgba(248, 232, 200, 0.32) 40%,
            transparent 72%);
          box-shadow: 0 0 8px rgba(248, 232, 200, 0.45);
          animation: dr-mote-rise linear infinite;
          opacity: 0;
        }
        @keyframes dr-mote-rise {
          0%   { transform: translate(0, 0);             opacity: 0; }
          10%  {                                          opacity: 0.9; }
          90%  {                                          opacity: 0.7; }
          100% { transform: translate(var(--drift), -105vh); opacity: 0; }
        }

        .dr-sea-text { position: relative; z-index: 2; }

        .dr-ripple-wrap {
          position: relative;
          width: 220px;
          height: 220px;
          margin: 50px auto 0;
        }
        .dr-ripple {
          position: absolute;
          top: 50%; left: 50%;
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 0.6px solid rgba(232, 236, 250, 0.4);
          transform: translate(-50%, -50%);
          animation: dr-ripple-out 5s ease-out infinite;
          opacity: 0;
        }
        @keyframes dr-ripple-out {
          0%   { width: 30px;  height: 30px;  opacity: 0.75; border-color: rgba(248, 232, 200, 0.6); }
          100% { width: 240px; height: 240px; opacity: 0;   border-color: rgba(148, 184, 242, 0.0); }
        }

        /* ═══════════════════════════════════════════════════════════
           ACT III — GATE (small orrery + form)
           ═══════════════════════════════════════════════════════════ */
        .dr-door-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 44px;
          max-width: 440px;
        }
        .dr-gate {
          position: relative;
          width: 360px;
          height: 360px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dr-gate-orrery {
          position: absolute;
          inset: 0;
          pointer-events: none;
          perspective: 1200px;
        }
        .dr-gate-halo {
          position: absolute;
          top: 50%; left: 50%;
          width: 220px; height: 220px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(circle,
            rgba(248, 232, 200, 0.24) 0%,
            rgba(196, 162, 97, 0.08) 38%,
            transparent 72%);
          filter: blur(10px);
          animation: dr-title-breathe 5.4s ease-in-out infinite;
        }
        .dr-gate-pet {
          position: absolute;
          left: 50%;
          bottom: 6%;
          transform: translateX(-50%);
          width: 58px;
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          filter: drop-shadow(0 0 14px rgba(248, 232, 200, 0.4));
          opacity: 0.8;
          z-index: 2;
        }

        /* Form — sits at ring center, nothing between it and the night */
        .dr-gate-form {
          position: relative;
          z-index: 3;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
          width: 240px;
        }
        .dr-gate-title {
          font-family: 'Italianno', 'Cormorant Garamond', serif;
          font-size: 58px;
          font-weight: 400;
          line-height: 1;
          margin: 0 0 4px;
          color: rgba(255, 250, 242, 0.92);
          text-shadow: 0 0 20px rgba(248, 232, 200, 0.5), 0 0 48px rgba(196, 162, 97, 0.25);
          letter-spacing: 0.01em;
        }

        /* Input — no box. Just a glow and a faint underline.  */
        .dr-input-wrap {
          position: relative;
          width: 100%;
        }
        .dr-input {
          width: 100%;
          background: transparent;
          color: rgba(255, 250, 242, 0.95);
          border: none;
          border-bottom: 0.5px solid rgba(232, 236, 250, 0.22);
          padding: 10px 6px 8px;
          font-size: 13px;
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-style: italic;
          font-weight: 300;
          letter-spacing: 0.4em;
          text-align: center;
          outline: none;
          transition: border-color 0.6s, letter-spacing 0.6s, text-shadow 0.6s;
          text-shadow: 0 0 8px rgba(248, 232, 200, 0.35);
        }
        .dr-input::placeholder {
          color: rgba(232, 236, 250, 0.28);
          font-style: italic;
          letter-spacing: 0.24em;
          text-transform: lowercase;
          text-shadow: none;
        }
        .dr-input:focus {
          border-color: rgba(248, 232, 200, 0.55);
          letter-spacing: 0.5em;
        }
        .dr-input:focus ~ .dr-input-orb {
          opacity: 1;
          transform: translateX(-50%) scale(1.4);
        }
        .dr-input:disabled { opacity: 0.5; }

        /* A small light below the input — like a tiny star */
        .dr-input-orb {
          position: absolute;
          left: 50%;
          bottom: -2px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255, 250, 242, 1) 0%, rgba(248, 232, 200, 0.4) 60%, transparent 100%);
          transform: translateX(-50%);
          opacity: 0.6;
          transition: opacity 0.6s, transform 0.6s;
          pointer-events: none;
          filter: blur(0.3px);
        }

        /* Enter — a word, not a button */
        .dr-btn {
          position: relative;
          background: transparent;
          border: none;
          padding: 10px 8px 14px;
          margin-top: 6px;
          cursor: pointer;
          font-family: 'Italianno', 'Cormorant Garamond', serif;
          font-size: 30px;
          font-weight: 400;
          letter-spacing: 0.04em;
          color: rgba(232, 236, 250, 0.55);
          transition: color 0.6s, text-shadow 0.6s, letter-spacing 0.6s;
          text-transform: lowercase;
          line-height: 1;
        }
        .dr-btn:not(:disabled):hover {
          color: rgba(255, 250, 242, 0.98);
          text-shadow: 0 0 16px rgba(248, 232, 200, 0.55), 0 0 36px rgba(196, 162, 97, 0.3);
          letter-spacing: 0.12em;
        }
        .dr-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .dr-error {
          margin: 0;
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 12px;
          font-style: italic;
          letter-spacing: 0.08em;
          color: rgba(232, 152, 148, 0.9);
          text-transform: lowercase;
        }

        .dr-footer-note {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 11px;
          font-style: italic;
          letter-spacing: 0.36em;
          color: rgba(232, 236, 250, 0.3);
          margin: 0;
          text-transform: lowercase;
        }

        /* ═══════════════════════════════════════════════════════════
           BLOOM — success animation
           ═══════════════════════════════════════════════════════════ */
        .dr-bloom {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: radial-gradient(circle,
            rgba(255, 250, 242, 1) 0%,
            rgba(248, 232, 200, 0.4) 45%,
            transparent 100%);
          transform: translate(-50%, -50%) scale(0);
          opacity: 0;
          pointer-events: none;
          z-index: 100;
          transition: transform 0.95s cubic-bezier(.2,.7,.2,1), opacity 0.95s ease;
        }
        .dr-root.is-entering .dr-bloom {
          transform: translate(-50%, -50%) scale(220);
          opacity: 1;
        }
        .dr-root.is-entering .dr-hero,
        .dr-root.is-entering .dr-gate-orrery {
          opacity: 0;
          transition: opacity 0.95s ease;
        }

        /* ═══════════════════════════════════════════════════════════
           MOBILE
           ═══════════════════════════════════════════════════════════ */
        @media (max-width: 640px) {
          .dr-hero { width: 420px; height: 420px; }
          .dr-title { font-size: 82px; }
          .dr-title-glow { width: 240px; height: 100px; }
          .dr-gate { width: 300px; height: 300px; }
          .dr-gate-halo { width: 180px; height: 180px; }
          .dr-act-sky .dr-fade { margin-top: 64vh; }
          .dr-hint { bottom: 26px; letter-spacing: 0.32em; }
        }

        @media (prefers-reduced-motion: reduce) {
          .dr-orbit-track,
          .dr-nebula,
          .dr-title-glow,
          .dr-gate-halo,
          .dr-meteor,
          .dr-mote,
          .dr-ripple { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
