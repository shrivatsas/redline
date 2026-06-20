import { useCallback, useState } from "react"
import type { Editor as TiptapEditor } from "@tiptap/core"
import { removeCommentMarkFromEditor } from "@/lib/editor-utils"

interface UseDraftCommentOptions {
  editor: TiptapEditor | null
  addComment: (
    editor: TiptapEditor,
    body: string,
    existingCommentId?: string,
  ) => unknown
  setActiveCommentId: (id: string | null) => void
}

export function useDraftComment({
  editor,
  addComment,
  setActiveCommentId,
}: UseDraftCommentOptions) {
  const [showNewComment, setShowNewComment] = useState(false)
  const [draftQuotedText, setDraftQuotedText] = useState("")
  const [pendingDraftCommentId, setPendingDraftCommentId] = useState<string | null>(
    null,
  )

  const handleAddCommentClick = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const draftId = `draft-${crypto.randomUUID()}`
    // The bubble menu prevents its mousedown from stealing the editor
    // selection, so refocusing here is unnecessary. Tiptap's focus command
    // schedules a scrollIntoView that can race with the draft textarea focus
    // and jump long documents back to the editor's top in some browsers.
    editor.chain().setCommentMark(draftId).run()
    setPendingDraftCommentId(draftId)
    setDraftQuotedText(editor.state.doc.textBetween(from, to, " "))
    setShowNewComment(true)
    setActiveCommentId(null)
  }, [editor, setActiveCommentId])

  const handleCloseNewComment = useCallback(() => {
    if (pendingDraftCommentId && editor) {
      removeCommentMarkFromEditor(editor, pendingDraftCommentId)
      setPendingDraftCommentId(null)
    }
    if (editor) {
      const { to } = editor.state.selection
      editor.commands.setTextSelection(to)
    }
    setShowNewComment(false)
  }, [editor, pendingDraftCommentId])

  const handleSubmitNewComment = useCallback(
    (body: string) => {
      if (!editor) return
      addComment(editor, body, pendingDraftCommentId ?? undefined)
      setPendingDraftCommentId(null)
      setShowNewComment(false)
    },
    [editor, addComment, pendingDraftCommentId],
  )

  return {
    showNewComment,
    setShowNewComment,
    draftQuotedText,
    pendingDraftCommentId,
    handleAddCommentClick,
    handleCloseNewComment,
    handleSubmitNewComment,
  }
}
