import { expect, test } from "bun:test"
import { buildOptions } from "./guide"

function stubApi(providers: any[]) {
  return { state: { provider: providers }, ui: { dialog: { clear() {} } } } as any
}

test("buildOptions makes one option per non-deprecated model, grouped by provider", () => {
  const api = stubApi([
    {
      id: "google",
      name: "Google",
      models: {
        "gemini-2.5-pro": { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", reasoning: true, limit: { context: 1_000_000 }, cost: { input: 2 } },
        "old-model": { id: "old-model", name: "Old", status: "deprecated" },
      },
    },
  ])
  const options = buildOptions(api)
  expect(options.length).toBe(1)
  const opt = options[0]
  expect(opt.title).toBe("Gemini 2.5 Pro")
  expect(opt.category).toBe("Google")
  expect(opt.value).toEqual({ providerID: "google", modelID: "gemini-2.5-pro" })
  // Specs live in the never-truncated footer: context · cost (· vision).
  expect(opt.footer).toBe("1M · $$")
  // Description is the short primary role hint; extra curated hints become details.
  expect(opt.description).toBe("Deep reasoning & planning")
  expect(opt.details).toEqual(["Large refactors", "Architecture decisions"])
})

test("footer reflects context, vision, and cost; description never carries specs", () => {
  const api = stubApi([
    {
      id: "p",
      name: "P",
      models: {
        m: { id: "m", name: "M", limit: { context: 200_000 }, cost: { input: 0 }, modalities: { input: ["text", "image"] } },
      },
    },
  ])
  const opt = buildOptions(api)[0]
  expect(opt.footer).toBe("200K · vision · Free")
  expect(opt.description).not.toContain("ctx")
  expect(opt.description).not.toContain("·")
})

test("buildOptions sorts providers then models by display name", () => {
  const api = stubApi([
    { id: "z", name: "Zeta", models: { b: { id: "b", name: "Beta" }, a: { id: "a", name: "Alpha" } } },
    { id: "a", name: "Alpha", models: { m: { id: "m", name: "Mid" } } },
  ])
  const options = buildOptions(api)
  expect(options.map((o) => o.category)).toEqual(["Alpha", "Zeta", "Zeta"])
  expect(options.slice(1).map((o) => o.title)).toEqual(["Alpha", "Beta"])
})
