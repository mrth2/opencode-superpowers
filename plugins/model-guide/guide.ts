import { hintsFor, formatContext, hasVision, costTier, type ModelLike } from "./hints"

export type ModelValue = { providerID: string; modelID: string }

// The title + description share one clipping line, while the footer is pinned
// right and never truncated. So the specs (context, vision, cost) live in the
// footer where they stay fully visible, and the description carries only the
// short, distinctive role hint. Any extra curated hints drop to their own lines.
export function footerFor(model: ModelLike): string {
  const ctx = formatContext(model.limit?.context)
  const cost = costTier(model)
  return [ctx === "?" ? null : ctx, hasVision(model) ? "vision" : null, cost === "?" ? null : cost]
    .filter(Boolean)
    .join(" · ")
}

export function buildOptions(api: any): any[] {
  const out: any[] = []
  const providers = [...(api.state?.provider ?? [])].sort((a: any, b: any) =>
    (a?.name ?? a?.id ?? "").localeCompare(b?.name ?? b?.id ?? ""),
  )
  for (const provider of providers) {
    const models = (Object.values(provider?.models ?? {}) as ModelLike[])
      .filter((m) => m.status !== "deprecated")
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
    for (const model of models) {
      const hints = hintsFor(model)
      out.push({
        title: model.name ?? model.id,
        value: { providerID: provider.id, modelID: model.id },
        category: provider.name,
        description: hints[0],
        details: hints.slice(1),
        footer: footerFor(model),
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
