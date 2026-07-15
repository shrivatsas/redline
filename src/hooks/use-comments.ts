import { useState, useCallback, useEffect } from "react"
import type { Editor } from "@tiptap/core"
import { toast } from "sonner"
import type { Comment } from "@/types/comment"
import { isComment } from "@/types/comment"
import {
  forEachCommentMark,
  removeAllCommentMarksFromEditor,
  removeCommentMarkFromEditor,
} from "@/lib/editor-utils"
import {
  normalizeQuotedText,
  resolveCommentRange,
  resolveCommentRangeNearAnchor,
} from "@/lib/comment-anchoring"

export type { Comment, CommentMessage } from "@/types/comment"

const STORAGE_PREFIX = "review-md:comments:v1:"

function storageKey(fileKey: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(fileKey)}`
}

function loadPersisted(fileKey: string): {
  comments: Comment[]
  activeCommentId: string | null
} {
  try {
    const raw = localStorage.getItem(storageKey(fileKey))
    if (!raw) {
      return { comments: [], activeCommentId: null }
    }
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== "object") {
      return { comments: [], activeCommentId: null }
    }
    const obj = data as Record<string, unknown>
    const comments = Array.isArray(obj.comments)
      ? (obj.comments as unknown[]).filter(isComment)
      : []
    const activeCommentId =
      obj.activeCommentId === null
        ? null
        : typeof obj.activeCommentId === "string"
          ? obj.activeCommentId
          : null
    return { comments, activeCommentId }
  } catch {
    return { comments: [], activeCommentId: null }
  }
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function savePersisted(
  fileKey: string,
  comments: Comment[],
  activeCommentId: string | null,
) {
  if (saveTimeout !== null) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(
        storageKey(fileKey),
        JSON.stringify({ comments, activeCommentId }),
      )
    } catch {
      // quota / private mode
    }
  }, 500)
}

function initialThreadState(persistenceKey: string | null): {
  comments: Comment[]
  activeCommentId: string | null
  loadedKey: string | null
} {
  if (!persistenceKey) {
    return { comments: [], activeCommentId: null, loadedKey: null }
  }
  const { comments, activeCommentId } = loadPersisted(persistenceKey)
  return { comments, activeCommentId, loadedKey: persistenceKey }
}

export function useComments(persistenceKey: string | null) {
  const [seed] = useState(() => initialThreadState(persistenceKey))
  const [comments, setComments] = useState(seed.comments)
  const [activeCommentId, setActiveCommentId] = useState(seed.activeCommentId)
  const [loadedKey, setLoadedKey] = useState(seed.loadedKey)

  useEffect(() => {
    if (!persistenceKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- persistence key cleared
      setComments([])
      setActiveCommentId(null)
      setLoadedKey(null)
      return
    }
    const { comments: next, activeCommentId: nextActive } =
      loadPersisted(persistenceKey)
    setComments(next)
    setActiveCommentId(nextActive)
    setLoadedKey(persistenceKey)
  }, [persistenceKey])

  useEffect(() => {
    if (!persistenceKey || loadedKey !== persistenceKey) return
    savePersisted(persistenceKey, comments, activeCommentId)
  }, [persistenceKey, loadedKey, comments, activeCommentId])

  const addComment = useCallback(
    (editor: Editor, body: string, existingCommentId?: string) => {
      const { from, to } = editor.state.selection
      if (from === to) return null

      const quotedText = editor.state.doc.textBetween(from, to, " ")
      const id = existingCommentId ?? crypto.randomUUID()
      const createdAt = new Date().toISOString()

      const comment: Comment = {
        id,
        quotedText,
        messages: [{ id: crypto.randomUUID(), body, createdAt }],
        createdAt,
        anchorFrom: from,
        anchorTo: to,
      }

      if (!existingCommentId) {
        editor.chain().focus().setCommentMark(id).run()
      }
      setComments((prev) => [...prev, comment])
      setActiveCommentId(id)
      return comment
    },
    [],
  )

  const deleteComment = useCallback((editor: Editor, commentId: string) => {
    removeCommentMarkFromEditor(editor, commentId)
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    setActiveCommentId(null)
  }, [])

  const deleteCommentMessage = useCallback(
    (editor: Editor, commentId: string, messageId: string) => {
      setComments((prev) => {
        const c = prev.find((x) => x.id === commentId)
        if (!c) return prev
        const willRemoveThread =
          c.messages.length === 1 && c.messages[0].id === messageId
        if (willRemoveThread) {
          removeCommentMarkFromEditor(editor, commentId)
          queueMicrotask(() => {
            setActiveCommentId(null)
          })
          return prev.filter((x) => x.id !== commentId)
        }
        return prev.map((x) =>
          x.id !== commentId
            ? x
            : {
                ...x,
                messages: x.messages.filter((m) => m.id !== messageId),
              },
        )
      })
    },
    [],
  )

  const formatReview = useCallback(
    (summary: string): string => {
      const fileLabel = persistenceKey?.trim() || "this file"
      const header = `Review of \`${fileLabel}\``

      const trimmedSummary = summary.trim()
      const summaryBlock = trimmedSummary
        ? ["Summary:", trimmedSummary].join("\n")
        : null

      const threadsBlock = comments.length
        ? [
            "Inline comments:",
            comments
              .map((c) => {
                const thread = c.messages.map((m) => `- ${m.body}`).join("\n")
                return `> ${c.quotedText}\n${thread}`
              })
              .join("\n\n"),
          ].join("\n")
        : null

      return [header, summaryBlock, threadsBlock]
        .filter((s): s is string => s !== null)
        .join("\n\n")
    },
    [comments, persistenceKey],
  )

  const addReplyToComment = useCallback((commentId: string, body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return

    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              messages: [
                ...c.messages,
                {
                  id: crypto.randomUUID(),
                  body: trimmed,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : c,
      ),
    )
  }, [])

  const editCommentMessage = useCallback(
    (commentId: string, messageId: string, body: string) => {
      const trimmed = body.trim()
      if (!trimmed) {
        toast.error("Message cannot be empty")
        return
      }
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c
          const has = c.messages.some((m) => m.id === messageId)
          if (!has) return c
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === messageId ? { ...m, body: trimmed } : m,
            ),
          }
        }),
      )
    },
    [],
  )

  const syncCommentAnchorsFromEditor = useCallback((editor: Editor) => {
    const nextAnchors = new Map<string, { anchorFrom: number; anchorTo: number }>()
    forEachCommentMark(editor.state.doc, (commentId, from, to) => {
      const existing = nextAnchors.get(commentId)
      if (!existing) {
        nextAnchors.set(commentId, { anchorFrom: from, anchorTo: to })
        return
      }
      nextAnchors.set(commentId, {
        anchorFrom: Math.min(existing.anchorFrom, from),
        anchorTo: Math.max(existing.anchorTo, to),
      })
    })

    setComments((prev) => {
      let changed = false
      const next = prev.map((comment) => {
        const resolved = nextAnchors.get(comment.id)
        if (!resolved) return comment
        if (
          comment.anchorFrom === resolved.anchorFrom &&
          comment.anchorTo === resolved.anchorTo
        ) {
          return comment
        }
        changed = true
        return {
          ...comment,
          anchorFrom: resolved.anchorFrom,
          anchorTo: resolved.anchorTo,
        }
      })
      return changed ? next : prev
    })
  }, [])

  const reanchorComments = useCallback((editor: Editor) => {
    const commentMarkType = editor.state.schema.marks.commentMark
    if (!commentMarkType) return { attached: 0, needsAttention: 0 }

    let tr = editor.state.tr
    let changed = false
    let attached = 0
    let needsAttention = 0

    const nextComments = comments.map<Comment>((comment) => {
        const anchoredRange = resolveCommentRange(editor, comment)
        const anchoredText = anchoredRange
          ? normalizeQuotedText(
              editor.state.doc.textBetween(
                anchoredRange.from,
                anchoredRange.to,
                " ",
              ),
            )
          : ""
        const quote = normalizeQuotedText(comment.quotedText)
        const range =
          anchoredRange && anchoredText === quote
            ? anchoredRange
            : resolveCommentRangeNearAnchor(editor, comment)

        if (!range) {
          needsAttention += 1
          return comment.anchorStatus === "needs-attention"
            ? comment
            : { ...comment, anchorStatus: "needs-attention" }
        }

        tr = tr.addMark(
          range.from,
          range.to,
          commentMarkType.create({ commentId: comment.id }),
        )
        changed = true
        attached += 1
        return {
          ...comment,
          anchorFrom: range.from,
          anchorTo: range.to,
          anchorStatus: "attached",
        }
      })

    setComments(nextComments)

    if (changed) {
      tr.setMeta("addToHistory", false)
      editor.view.dispatch(tr)
    }
    return { attached, needsAttention }
  }, [comments])

  const submitReview = useCallback(
    async (summary: string): Promise<boolean> => {
      const text = formatReview(summary)
      try {
        await navigator.clipboard.writeText(text)
        toast.success("Review copied to clipboard")
        return true
      } catch (e) {
        console.error("Failed to copy review:", e)
        toast.error("Failed to copy review")
        return false
      }
    },
    [formatReview],
  )

  const clearAllComments = useCallback((editor?: Editor | null) => {
    if (editor) removeAllCommentMarksFromEditor(editor)
    setComments([])
    setActiveCommentId(null)
    toast.success("All comments cleared")
  }, [])

  return {
    comments,
    activeCommentId,
    setActiveCommentId,
    addComment,
    addReplyToComment,
    editCommentMessage,
    syncCommentAnchorsFromEditor,
    reanchorComments,
    deleteComment,
    deleteCommentMessage,
    submitReview,
    clearAllComments,
    hasComments: comments.length > 0,
  }
}
