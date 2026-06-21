import { useEffect, useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"
import { useEditor, EditorContent } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import { Markdown } from "tiptap-markdown"
import type { Editor as TiptapEditor } from "@tiptap/core"
import { Button } from "@/components/ui/button"
import { CommentMark } from "@/extensions/comment-mark"
import { CommentShortcuts } from "@/extensions/comment-shortcuts"
import { MermaidCodeBlock } from "@/extensions/mermaid-code-block"
import { cn } from "@/lib/utils"

interface EditorProps {
  content: string
  onUpdate: (markdown: string) => void
  onEditorReady: (editor: TiptapEditor) => void
  /** Increment to replace the document from `content` (e.g. reload from disk). */
  contentReloadNonce?: number
  /** Hide the selection bubble while the comment form or another overlay is open. */
  bubbleMenuSuppressed?: boolean
  onAddComment?: () => void
}

export function Editor({
  content,
  onUpdate,
  onEditorReady,
  contentReloadNonce = 0,
  bubbleMenuSuppressed = false,
  onAddComment,
}: EditorProps) {
  const lastMarkdownRef = useRef(content)
  const lastReloadNonceRef = useRef(0)
  const [spent, setSpent] = useState(false)

  useEffect(() => {
    lastMarkdownRef.current = content
  }, [content])

  const extensions = useMemo(
    () => [
      StarterKit.configure({ codeBlock: false }),
      MermaidCodeBlock,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      CommentMark,
      CommentShortcuts,
    ],
    [],
  )

  const editor = useEditor({
    extensions,
    content,
    onUpdate: ({ editor }) => {
      const markdownStorage = (
        editor.storage as { markdown?: { getMarkdown?: () => string } }
      ).markdown
      if (typeof markdownStorage?.getMarkdown !== "function") {
        if (import.meta.env.DEV) {
          console.warn(
            "tiptap-markdown getMarkdown() not found on editor.storage.markdown",
          )
        }
        return
      }
      const md = markdownStorage.getMarkdown()
      if (md === undefined) {
        if (import.meta.env.DEV) {
          console.warn("tiptap-markdown getMarkdown() returned undefined")
        }
        return
      }
      if (md === lastMarkdownRef.current) {
        return
      }
      lastMarkdownRef.current = md
      onUpdate(md)
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[min(100vh,32rem)] outline-none focus-visible:outline-none",
        spellcheck: "false",
      },
    },
  })

  useEffect(() => {
    if (editor) onEditorReady(editor)
  }, [editor, onEditorReady])

  // Only a fresh expanded selection revives the pill. Skipping collapsed
  // selections here is what prevents the pill flashing back inside tippy's
  // fade-out when the draft closes.
  useEffect(() => {
    if (!editor) return
    const onSelection = () => {
      const { from, to } = editor.state.selection
      if (from !== to) setSpent(false)
    }
    editor.on("selectionUpdate", onSelection)
    return () => {
      editor.off("selectionUpdate", onSelection)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    if (contentReloadNonce === 0) {
      lastReloadNonceRef.current = 0
      return
    }
    if (contentReloadNonce === lastReloadNonceRef.current) return
    lastReloadNonceRef.current = contentReloadNonce
    editor.commands.setContent(content, { emitUpdate: false })
    lastMarkdownRef.current = content
  }, [contentReloadNonce, content, editor])

  return (
    <>
      <EditorContent editor={editor} />
      {editor && onAddComment ? (
        <BubbleMenu
          editor={editor}
          appendTo={() => document.body}
          shouldShow={({ state }) => {
            if (bubbleMenuSuppressed) return false
            const { from, to } = state.selection
            if (from === to) return false
            let hasCommentMark = false
            state.doc.nodesBetween(from, to, (node) => {
              if (node.marks.some((m) => m.type.name === "commentMark")) {
                hasCommentMark = true
                return false
              }
            })
            return !hasCommentMark
          }}
          options={{
            placement: "bottom",
            offset: 0,
            flip: true,
            shift: { padding: 8 },
          }}
          className="bubble-menu pointer-events-auto z-[100]"
        >
          <Button
            type="button"
            variant="secondary"
            size="xs"
            title="Add note"
            aria-label="Add note"
            className={cn(
              "sticky-skeuo-btn sticky-skeuo-btn--neutral",
              "active:!translate-y-0",
            )}
            style={{ visibility: spent ? "hidden" : undefined }}
            onMouseDown={(e) => {
              e.preventDefault()
              if (spent) return
              setSpent(true)
              onAddComment()
            }}
          >
            <Plus data-icon="inline-start" className="size-2.5" aria-hidden />
            Add note
          </Button>
        </BubbleMenu>
      ) : null}
    </>
  )
}
