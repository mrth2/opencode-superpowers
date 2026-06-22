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
  expect(opt.footer).toBe("$$")
  expect(typeof opt.description).toBe("string")
  expect(opt.description!.length).toBeGreaterThan(0)
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
