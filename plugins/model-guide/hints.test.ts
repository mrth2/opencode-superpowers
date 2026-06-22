import { expect, test } from "bun:test"
import { formatContext, hasVision, costTier, derive, hintsFor, CURATED, CURATED_PATTERNS, type ModelLike } from "./hints"

test("formatContext humanizes token limits", () => {
  expect(formatContext(1_000_000)).toBe("1M")
  expect(formatContext(2_000_000)).toBe("2M")
  expect(formatContext(200_000)).toBe("200K")
  expect(formatContext(128_000)).toBe("128K")
  expect(formatContext(undefined)).toBe("?")
})

test("hasVision detects image input modality", () => {
  expect(hasVision({ id: "a", modalities: { input: ["text", "image"] } })).toBe(true)
  expect(hasVision({ id: "b", modalities: { input: ["text"] } })).toBe(false)
  expect(hasVision({ id: "c" })).toBe(false)
})

test("costTier buckets input cost", () => {
  expect(costTier({ id: "a", cost: { input: 0 } })).toBe("Free")
  expect(costTier({ id: "b", cost: { input: 0.5 } })).toBe("$")
  expect(costTier({ id: "c", cost: { input: 3 } })).toBe("$$")
  expect(costTier({ id: "d", cost: { input: 15 } })).toBe("$$$")
  expect(costTier({ id: "e" })).toBe("?")
})

test("derive distinguishes tiers within the same family", () => {
  // Same brand, different tier markers must yield different roles.
  const flash = derive({ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", cost: { input: 0.5 } })
  const pro = derive({ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", cost: { input: 3 } })
  expect(flash).not.toEqual(pro)
  expect(flash[0]).toBe("Fast edits & quick Q&A")
  expect(pro[0]).toBe("Complex multi-file refactors")
})

test("derive flags reasoning, coding, and heavy-reasoning roles distinctly", () => {
  expect(derive({ id: "kimi-k2.7-code", name: "Kimi K2.7 Code" })[0]).toBe("Code generation & completion")
  expect(derive({ id: "r1", reasoning: true, cost: { input: 0.5 } })[0]).toBe("Reasoning & step-by-step planning")
  expect(derive({ id: "qwen3.7-max", name: "Qwen3.7 Max", reasoning: true, cost: { input: 6 } })[0]).toBe("Hard bugs & architecture")
})

test("derive returns exactly one short, non-empty role phrase", () => {
  const r = derive({ id: "glm-5.2", name: "GLM-5.2" })
  expect(r.length).toBe(1)
  expect(r[0].length).toBeGreaterThan(0)
  expect(r[0].length).toBeLessThanOrEqual(34)
})

test("hintsFor prefers curated by id, then family, then patterns, then derived", () => {
  const byId = hintsFor({ id: Object.keys(CURATED)[0] } as ModelLike)
  expect(byId).toEqual(CURATED[Object.keys(CURATED)[0]])
  const derived = hintsFor({ id: "totally-unknown-model" })
  expect(derived.length).toBeGreaterThanOrEqual(1)
})

test("hintsFor matches curated entry by family when id misses", () => {
  const r = hintsFor({ id: "unknown-variant-xyz", family: "gemini-2.5-pro" })
  expect(r).toEqual(CURATED["gemini-2.5-pro"])
})

test("hintsFor matches a curated pattern (Claude family) by name", () => {
  const opus = CURATED_PATTERNS.find((p) => p.match.test("opus"))!.hints
  expect(hintsFor({ id: "claude-opus-4-8", name: "Claude Opus 4.8" })).toEqual(opus)
  // A curated pattern wins over the tier-derived fallback.
  expect(hintsFor({ id: "claude-haiku-4-5", name: "Claude Haiku 4.5" })).toEqual(["Fast, cheap, high-volume tasks"])
})
