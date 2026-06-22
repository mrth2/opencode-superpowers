export interface ModelLike {
  id: string
  name?: string
  family?: string
  reasoning?: boolean
  tool_call?: boolean
  attachment?: boolean
  modalities?: { input?: string[]; output?: string[] }
  cost?: { input?: number; output?: number }
  limit?: { context?: number; output?: number }
  status?: string
}

export function formatContext(context: number | undefined): string {
  if (context === undefined || context === null) return "?"
  if (context >= 1_000_000) {
    const m = context / 1_000_000
    return `${Number.isInteger(m) ? m : Math.round(m * 10) / 10}M`
  }
  if (context >= 1_000) return `${Math.round(context / 1_000)}K`
  return String(context)
}

export function hasVision(model: ModelLike): boolean {
  return model.modalities?.input?.includes("image") ?? false
}

export function costTier(model: ModelLike): string {
  const input = model.cost?.input
  if (input === undefined || input === null) return "?"
  if (input === 0) return "Free"
  if (input <= 1) return "$"
  if (input <= 5) return "$$"
  return "$$$"
}

// Tier markers carry the most distinctive signal: a "Flash"/"Haiku" model and
// a "Pro"/"Opus" model from the same family fill very different roles. We read
// them from the id+name rather than guessing per fictional version number.
const FAST_MARKERS = /\b(flash|mini|lite|air|haiku|nano|turbo|instant|fast|tiny|small)\b/i
const HEAVY_MARKERS = /\b(opus|max|ultra|large|pro|plus|grande|heavy)\b/i
const CODER_MARKERS = /\b(code|coder|codex)\b/i

function tokens(model: ModelLike): string {
  return `${model.id} ${model.name ?? ""}`.toLowerCase()
}

// A single short, distinctive role phrase derived from real metadata + tier
// markers. Short so it survives the narrow description column; the context and
// vision specs are shown separately, so they are deliberately not repeated here.
export function derive(model: ModelLike): string[] {
  const t = tokens(model)
  const fast = FAST_MARKERS.test(t)
  const heavy = HEAVY_MARKERS.test(t)
  const coder = CODER_MARKERS.test(t)
  const reasoning = !!model.reasoning
  const cheap = (model.cost?.input ?? Infinity) <= 1

  if (coder) return ["Code generation & completion"]
  if (reasoning && (heavy || !cheap)) return ["Hard bugs & architecture"]
  if (reasoning) return ["Reasoning & step-by-step planning"]
  if (fast && cheap) return ["Fast edits & quick Q&A"]
  if (heavy) return ["Complex multi-file refactors"]
  if (cheap) return ["Lightweight everyday tasks"]
  return ["Everyday coding & chat"]
}

// Curated overrides for families where the positioning is genuinely known and
// stable, keyed by exact id or family from models.dev.
export const CURATED: Record<string, string[]> = {
  "gemini-2.5-pro": ["Deep reasoning & planning", "Large refactors", "Architecture decisions"],
}

// Pattern overrides for well-known families whose role is stable across version
// numbers. Matched against id+name, first hit wins. More specific (tier-bearing)
// patterns come before brand-only ones.
export const CURATED_PATTERNS: { match: RegExp; hints: string[] }[] = [
  { match: /opus/i, hints: ["Hard bugs & architecture", "Deep multi-step planning"] },
  { match: /sonnet/i, hints: ["Agentic coding workhorse", "Balanced speed & quality"] },
  { match: /haiku/i, hints: ["Fast, cheap, high-volume tasks"] },
]

export function hintsFor(model: ModelLike): string[] {
  const curated = CURATED[model.id] ?? (model.family ? CURATED[model.family] : undefined)
  if (curated) return curated
  const t = tokens(model)
  for (const { match, hints } of CURATED_PATTERNS) {
    if (match.test(t)) return hints
  }
  return derive(model)
}
