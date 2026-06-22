import { openGuide } from "./model-guide/guide"

const tui: any = async (api: any) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "superpowers.model_guide",
        title: "Model guide",
        slashName: "models-guide",
        category: "Model",
        namespace: "palette",
        run() {
          openGuide(api)
        },
      },
    ],
    bindings: [{ key: "<leader>g", cmd: "superpowers.model_guide", desc: "Open model guide" }],
  })
}

export default { id: "superpowers-model-guide", tui }
