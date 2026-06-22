import { hintsFor, formatContext, hasVision, costTier, type ModelLike } from "./hints"

export type ModelValue = { providerID: string; modelID: string }

// One inline line: "best-for hints - ctx 1M . vision". No em dashes.
function describe(model: ModelLike): string {
  const best = hintsFor(model).join(", ")
  const specs = [`ctx ${formatContext(model.limit?.context)}`, hasVision(model) ? "vision" : null]
    .filter(Boolean)
    .join(" · ")
  return specs ? `${best} - ${specs}` : best
}

export function buildOptions(api: any): any[] {
  const out: any[] = []
  const providers = [...api.state.provider].sort((a: any, b: any) => a.name.localeCompare(b.name))
  for (const provider of providers) {
    const models = (Object.values(provider.models) as ModelLike[])
      .filter((m) => m.status !== "deprecated")
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
    for (const model of models) {
      out.push({
        title: model.name ?? model.id,
        value: { providerID: provider.id, modelID: model.id },
        category: provider.name,
        description: describe(model),
        footer: costTier(model),
      })
    }
  }
  return out
}

export function openGuide(api: any) {
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect({
      title: "Model guide",
      placeholder: "Search models",
      options: buildOptions(api),
      onSelect: () => api.ui.dialog.clear(),
    }),
  )
}
