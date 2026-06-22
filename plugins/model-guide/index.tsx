/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui"

function HelloDialog(props: { api: Parameters<TuiPlugin>[0] }) {
  const theme = () => props.api.theme.current
  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().text}>Model guide</text>
        <text fg={theme().textMuted} onMouseUp={() => props.api.ui.dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme().textMuted}>model guide plugin loaded</text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "superpowers.model_guide",
        title: "Model guide",
        slashName: "models-guide",
        category: "Model",
        namespace: "palette",
        run() {
          api.ui.dialog.setSize("xlarge")
          api.ui.dialog.replace(() => <HelloDialog api={api} />)
        },
      },
    ],
    bindings: [{ key: "<leader>g", cmd: "superpowers.model_guide", desc: "Open model guide" }],
  })
}

export default { id: "superpowers-model-guide", tui }
