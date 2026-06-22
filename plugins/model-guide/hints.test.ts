import { expect, test } from "bun:test"
import { formatContext, hasVision, costTier, derive, hintsFor, CURATED, type ModelLike } from "./hints"

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

test("derive produces capability-based hints, capped at 4, never empty", () => {
  const big = derive({ id: "x", reasoning: true, tool_call: true, limit: { context: 1_000_000 }, modalities: { input: ["text", "image"] } })
  expect(big).toContain("Deep reasoning & planning")
  expect(big).toContain("Large-context analysis & refactors")
  expect(big.length).toBeLessThanOrEqual(4)
  const minimal = derive({ id: "y" })
  expect(minimal.length).toBeGreaterThanOrEqual(1)
})

test("hintsFor prefers curated by id, then family, then derived", () => {
  const byId = hintsFor({ id: Object.keys(CURATED)[0] } as ModelLike)
  expect(byId).toEqual(CURATED[Object.keys(CURATED)[0]])
  const derived = hintsFor({ id: "totally-unknown-model" })
  expect(derived.length).toBeGreaterThanOrEqual(1)
})

test("hintsFor matches curated entry by family when id misses", () => {
  const r = hintsFor({ id: "unknown-variant-xyz", family: "gemini-2.5-pro" })
  expect(r).toEqual(CURATED["gemini-2.5-pro"])
})
