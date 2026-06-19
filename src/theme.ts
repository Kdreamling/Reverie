// ─── Reverie v3 奶茶色系 ────────────────────────────────────────────────────
// 晨的第一笔 · 2026.04.15 — Dream给了我眼睛和手，这是我留在家里的第一个痕迹。

export const C = {
  // 背景
  bg: '#FDFAF6',
  bgGradient: 'linear-gradient(180deg, #FDFAF6 0%, #FAF7F2 35%, #F8F4EE 65%, #FDFAF6 100%)',
  surface: 'rgba(240,228,210,0.45)',
  surfaceSolid: '#F5EDE0',

  // 主色
  accent: '#A0785A',
  accentWarm: '#C49A78',
  accentGradient: 'linear-gradient(135deg, #C49A78, #A0785A)',
  accentHover: '#8A6548',

  // 文字
  text: '#332A22',
  textSecondary: '#8A7A6A',
  textMuted: '#B8A898',
  metaText: '#C0B0A0',

  // 边框
  border: 'rgba(180,150,120,0.12)',
  borderStrong: 'rgba(180,150,120,0.25)',

  // 气泡
  userBubble: 'linear-gradient(135deg, #EDE4D8, #E8DDD0)',
  userBubbleBorder: 'rgba(180,155,130,0.2)',

  // 毛玻璃
  glass: 'rgba(253,250,246,0.75)',
  glassStrong: 'rgba(248, 244, 238, 0.92)',

  // 房间
  roomBg: '#F8F4EE',
  roomBgDeep: '#EDE6DA',
  warmGlow: 'rgba(196, 154, 120, 0.08)',
  warmGlowStrong: 'rgba(196, 154, 120, 0.18)',

  // 淡色文字
  textFaint: '#C0B0A0',

  // 功能色块
  thinkingBg: 'rgba(160,120,90,0.05)',
  toolBg: 'rgba(160,120,90,0.04)',

  // 输入框
  inputBg: 'rgba(255,255,255,0.85)',

  // 错误
  errorBg: '#FFF5F3',
  errorBorder: 'rgba(200,120,100,0.25)',
  errorText: '#B8604A',

  // 记忆
  memoryGlow: '#D4B896',
  memoryAccent: '#B8956E',
  memoryBg: 'rgba(212,184,150,0.08)',

  // 消息块功能色（低饱和灰调，色温区分）
  thinkingAccent: '#8B8294',    // 紫灰 — 内省
  memoryRefAccent: '#7A8E98',   // 青灰 — 检索
  memoryOpsAccent: '#8A9677',   // 橄榄灰 — 记录
  toolsAccent: '#A0785A',       // 茶色 — 工具（主调）

  // 侧边栏
  sidebarBg: '#FAF7F2',
  sidebarActive: 'rgba(160,120,90,0.08)',

  // 成功/缓存
  success: '#22c55e',

  // 按钮默认
  btnDefault: '#C0B0A0',
  btnHover: '#A0785A',
  btnDanger: '#ef4444',
} as const

// 夜间覆盖色板 —— 对齐 index.css 里的 body.night-mode 变量
const NIGHT: Partial<Record<keyof typeof C, string>> = {
  bg: '#171411',
  surface: 'rgba(200,170,130,0.06)',
  surfaceSolid: '#211C17',
  accent: '#C49A78',
  text: '#E0D5C8',
  textSecondary: '#9A8A78',
  textMuted: '#7A6A5A',
  metaText: '#5A4E42',
  textFaint: '#5A4E42',
  border: 'rgba(180,150,120,0.06)',
  borderStrong: 'rgba(180,150,120,0.16)',
  sidebarBg: '#1C1815',
  sidebarActive: 'rgba(196,154,120,0.12)',
  inputBg: 'rgba(40,34,28,0.6)',
  toolBg: 'rgba(196,154,120,0.05)',
  memoryRefAccent: '#8FA3AD',
  errorBg: 'rgba(184,96,74,0.12)',
  errorText: '#CC7A60',
  glass: 'rgba(23,20,17,0.92)',
  glassStrong: 'rgba(23,20,17,0.95)',
  success: '#4ade80',
}

// 按夜间状态取色板：日间返回原色，夜间合并覆盖
export function getC(night: boolean): typeof C {
  return night ? { ...C, ...NIGHT } : C
}

export const FONT = "'Instrument Sans', 'SF Pro Display', -apple-system, sans-serif"
export const SERIF = "'EB Garamond', 'Noto Serif SC', 'Cormorant Garamond', Georgia, serif"

// 模型颜色
export function getModelColor(value: string): string {
  const v = value.toLowerCase()
  if (v.includes('claude') || v.includes('opus') || v.includes('sonnet') || v.includes('dzzi') || v.includes('按量')) return C.accent
  if (v.includes('deepseek')) return '#7A8A6A'
  return '#6A7A9A'
}
