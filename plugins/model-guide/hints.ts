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

export function derive(model: ModelLike): string[] {
  const out: string[] = []
  if ((model.limit?.context ?? 0) >= 400_000) out.push("Large-context analysis & refactors")
  if (model.reasoning) out.push("Deep reasoning & planning")
  if (model.tool_call) out.push("Agentic / tool use")
  if (hasVision(model)) out.push("Screenshots & images")
  if (!model.reasoning && (model.cost?.input ?? Infinity) <= 1) out.push("Quick edits & simple Q&A")
  if (out.length === 0) out.push("General-purpose coding & chat")
  return out.slice(0, 4)
}

// Curated hints keyed by model id and/or family. Seeded further in Task 4.
export const CURATED: Record<string, string[]> = {
  "gemini-2.5-pro": ["Deep reasoning & planning", "Large refactors", "Architecture decisions"],
}

export function hintsFor(model: ModelLike): string[] {
  return CURATED[model.id] ?? (model.family ? CURATED[model.family] : undefined) ?? derive(model)
}
