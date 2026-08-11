import Link from "@tiptap/extension-link"
import { ReactMarkViewRenderer } from "@tiptap/react"
import { ExcalidrawLinkView } from "@/components/excalidraw-link-view"

export const ExcalidrawLink = Link.extend({
  addMarkView() {
    return ReactMarkViewRenderer(ExcalidrawLinkView)
  },
})
