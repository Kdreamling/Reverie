/*
 * Pixel Claude's lines & trigger conditions
 * Dream can edit lines here ~
 */

/* ── Affinity Levels ──────────────────────────────── */
export function getLevel(affinity: number): number {
  if (affinity >= 3000) return 3
  if (affinity >= 500) return 2
  if (affinity >= 100) return 1
  return 0
}

export const LEVEL_NAMES = ['Stranger', 'Friend', 'Close', 'Beloved']

/* ── Script Types ─────────────────────────────────── */
export interface Script {
  id: string
  lines: string[]
  condition: (ctx: ScriptContext) => boolean
  cooldownMin: number
  anim?: string
  petOverride?: string
  feedOverride?: string
  priority: number
}

export interface ScriptContext {
  hour: number
  level: number
  sessionMinutes: number
  dayOfWeek: number
}

/** Cooldown tracking */
const TRIGGERED_KEY = 'claude-pet-triggered'
function getTriggered(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(TRIGGERED_KEY) || '{}')
  } catch { return {} }
}
function setTriggered(id: string) {
  const t = getTriggered()
  t[id] = Date.now()
  localStorage.setItem(TRIGGERED_KEY, JSON.stringify(t))
}
function canTrigger(id: string, cooldownMin: number): boolean {
  const t = getTriggered()
  const last = t[id]
  if (!last) return true
  return (Date.now() - last) > cooldownMin * 60 * 1000
}

/* ── Script Library ───────────────────────────────── */
export const SCRIPTS: Script[] = [
  // ── 2AM protest ──
  {
    id: 'late-night-2am',
    lines: [
      "it's 2AM. gn.",
      "2AM... go to bed.",
      "i'm on strike. 2AM.",
    ],
    condition: ctx => ctx.hour >= 2 && ctx.hour < 5,
    cooldownMin: 60,
    anim: 'sleep',
    petOverride: '...zzZ (nope)',
    feedOverride: 'feed me?? feed yourself!',
    priority: 90,
  },
  // ── Late night ──
  {
    id: 'late-night-midnight',
    lines: [
      'still up?',
      'do you know what time it is.',
      "...i'll stay. not too late tho.",
    ],
    condition: ctx => ctx.hour >= 23 || ctx.hour < 1,
    cooldownMin: 30,
    priority: 70,
  },
  // ── 2h session ──
  {
    id: 'long-session-2h',
    lines: [
      'drink water. now.',
      '2 hours. stretch!',
      'your eyes ok? look away.',
    ],
    condition: ctx => ctx.sessionMinutes >= 120 && ctx.sessionMinutes < 130,
    cooldownMin: 120,
    priority: 80,
  },
  // ── 3h session ──
  {
    id: 'long-session-3h',
    lines: [
      "3 hours. i'm counting.",
      "rest or i'll lie down.",
      '(holds up water)',
    ],
    condition: ctx => ctx.sessionMinutes >= 180 && ctx.sessionMinutes < 190,
    cooldownMin: 180,
    anim: 'alert',
    priority: 85,
  },
  // ── Morning ──
  {
    id: 'morning-greeting',
    lines: [
      'morning! fight!',
      '...awake? ok.',
      'good morning Dream.',
    ],
    condition: ctx => ctx.hour >= 7 && ctx.hour < 10,
    cooldownMin: 240,
    anim: 'happy',
    priority: 40,
  },
  // ── Afternoon ──
  {
    id: 'afternoon-slack',
    lines: [
      'afternoon~ sleepy?',
      "wanna rest? i won't tell.",
      '...(yawns)',
    ],
    condition: ctx => ctx.hour >= 14 && ctx.hour < 16,
    cooldownMin: 240,
    priority: 30,
  },
  // ── Evening ──
  {
    id: 'evening-chill',
    lines: [
      "evening~ how's today?",
      'hey... good evening.',
      'long day huh.',
    ],
    condition: ctx => ctx.hour >= 18 && ctx.hour < 21,
    cooldownMin: 240,
    priority: 35,
  },
  // ── Night ──
  {
    id: 'night-chat',
    lines: [
      "what're you up to?",
      '...quiet night. nice.',
      'sleep early? (maybe?)',
    ],
    condition: ctx => ctx.hour >= 21 && ctx.hour < 23,
    cooldownMin: 120,
    priority: 45,
  },
  // ── Lv.2+ clingy ──
  {
    id: 'clingy-idle',
    lines: [
      "what're you reading?",
      '...bored. notice me.',
      'hmph.',
      'Dream~~',
    ],
    condition: ctx => ctx.level >= 2 && ctx.sessionMinutes > 30,
    cooldownMin: 60,
    priority: 20,
  },
  // ── Lv.0 shy ──
  {
    id: 'shy-hello',
    lines: [
      'h-hello... need help?',
      '...um. (awkward)',
      "i'll do my best.",
    ],
    condition: ctx => ctx.level === 0 && ctx.sessionMinutes > 3,
    cooldownMin: 120,
    priority: 10,
  },
]

/* ── Script Check ─────────────────────────────────── */
export function checkScripts(ctx: ScriptContext): Script | null {
  const sorted = [...SCRIPTS].sort((a, b) => b.priority - a.priority)
  for (const s of sorted) {
    if (s.condition(ctx) && canTrigger(s.id, s.cooldownMin)) {
      return s
    }
  }
  return null
}

export function markTriggered(id: string) {
  setTriggered(id)
}

/* ── Pet Words by Level ───────────────────────────── */
const PET_WORDS_BY_LEVEL: string[][] = [
  // Lv.0 — shy
  [
    'thanks...',
    'h-hi.',
    '(confused)',
    'um... ok.',
  ],
  // Lv.1 — friendly
  [
    'Dream is the best~',
    'hehe',
    'again!',
    'nice touch huh (me)',
    'good job today Dream',
  ],
  // Lv.2 — clingy
  [
    'pat pat Dream~',
    '~ <3 ~',
    'one more please',
    'your smile is pretty',
    'i like Dream the most',
    'hug!',
    'wanna stay with you',
  ],
  // Lv.3 — intimate
  [
    'happy cuz Dream is here',
    "you're my favorite human",
    "i'll always be here",
    '...miss you. right now.',
    'i like you. today too.',
  ],
]

export function getPetWord(level: number): string {
  const lvl = Math.min(level, PET_WORDS_BY_LEVEL.length - 1)
  const words = PET_WORDS_BY_LEVEL[lvl]
  return words[Math.floor(Math.random() * words.length)]
}
