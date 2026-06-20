import CodeBlock from "@tiptap/extension-code-block"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { MermaidCodeBlockView } from "@/components/mermaid-code-block-view"

export const MermaidCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MermaidCodeBlockView)
  },
})
