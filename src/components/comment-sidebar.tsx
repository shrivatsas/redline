import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Comment, CommentMessage } from "@/types/comment"
import { useCommentContext } from "@/contexts/comment-context"
import { resolveCommentLinkHighlightId } from "@/extensions/comment-mark"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Kbd } from "@/components/ui/kbd"
import { modDeleteChord, modEnterChord } from "@/lib/format-shortcut"
import { isModKey } from "@/lib/mod-key"
import { useCommentSidebarLayout } from "@/hooks/use-comment-sidebar-layout"
import { stickyColorClass, stickyRotationStyle } from "@/lib/sticky-style"

export function CommentSidebar({ editor }: { editor: TiptapEditor | null }) {
  const {
    comments,
    showNewComment,
    draftQuotedText,
    handleCloseNewComment,
    handleSubmitNewComment,
    activeCommentId,
    setActiveCommentId,
    addReplyToComment,
    editCommentMessage,
    deleteComment,
    deleteCommentMessage,
    hoveredCommentId,
  } = useCommentContext()

  const linkHighlightId = resolveCommentLinkHighlightId(
    activeCommentId,
    hoveredCommentId,
  )

  const ordered = useMemo(
    () => [...comments].sort((a, b) => a.anchorFrom - b.anchorFrom),
    [comments],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const draftWrapperRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const {
    positions,
    draftTop,
    containerMinHeightPx,
    measured,
    transitionsArmed,
    reduceMotion,
  } = useCommentSidebarLayout({
    editor,
    orderedComments: ordered,
    showNewComment,
    activeCommentId,
    containerRef,
    itemRefs,
    draftWrapperRef,
  })

  // When the draft appears, suppress wrapper Y transition for the first paint so
  // the wrapper snaps to the anchored position. After that, re-enable the
  // transition so subsequent layout shifts (other comments moving) animate.
  const [draftYSettled, setDraftYSettled] = useState(false)
  const [prevShowNewComment, setPrevShowNewComment] = useState(showNewComment)
  if (prevShowNewComment !== showNewComment) {
    setPrevShowNewComment(showNewComment)
    setDraftYSettled(false)
  }
  useEffect(() => {
    if (!showNewComment || draftTop === null) return
    const id = requestAnimationFrame(() => setDraftYSettled(true))
    return () => cancelAnimationFrame(id)
  }, [showNewComment, draftTop])

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 w-full pr-1"
      style={{
        ...(editor
          ? { minHeight: `${Math.max(containerMinHeightPx, 1)}px` }
          : null),
        // Keep the sidebar invisible until positions are real. `visibility` is
        // instant (no fade) so the cards never paint at y=0 before the editor
        // mounts its comment marks.
        visibility: measured ? "visible" : "hidden",
      }}
      data-redlines-sidebar=""
      aria-label="Redlines"
    >
      {ordered.map((comment) => {
        const dimForLink =
          linkHighlightId !== null && linkHighlightId !== comment.id
        const y = positions[comment.id] ?? 0
        return (
          <div
            key={comment.id}
            data-comment-thread-id={comment.id}
            ref={(el) => {
              itemRefs.current[comment.id] = el
            }}
            className={cn(
              "absolute right-0 top-0 -left-14",
              transitionsArmed &&
                !reduceMotion &&
                "transition-transform duration-100 ease-[cubic-bezier(0.23,1,0.32,1)]",
              "transition-[filter] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
              dimForLink && "brightness-[0.62]",
            )}
            style={{ transform: `translate3d(0, ${y}px, 0)` }}
          >
            <ThreadRow
              comment={comment}
              isActive={activeCommentId === comment.id}
              onSelect={() => setActiveCommentId(comment.id)}
              onReply={(body) => addReplyToComment(comment.id, body)}
              onEditMessage={(messageId, body) =>
                editCommentMessage(comment.id, messageId, body)
              }
              onDeleteMessage={(messageId) => {
                if (editor) deleteCommentMessage(editor, comment.id, messageId)
              }}
              onDelete={() => {
                if (editor) deleteComment(editor, comment.id)
              }}
            />
          </div>
        )
      })}

      {showNewComment && (
        <div
          ref={draftWrapperRef}
          data-comment-draft=""
          className={cn(
            "absolute right-0 top-0 -left-14 will-change-transform",
            transitionsArmed &&
              !reduceMotion &&
              draftYSettled &&
              "transition-transform duration-100 ease-[cubic-bezier(0.23,1,0.32,1)]",
          )}
          style={{ transform: `translate3d(0, ${draftTop ?? 0}px, 0)` }}
        >
          <NewCommentDraft
            key={draftQuotedText}
            quotedText={draftQuotedText}
            onSubmit={handleSubmitNewComment}
            onCancel={handleCloseNewComment}
          />
        </div>
      )}
    </div>
  )
}

function NewCommentDraft({
  quotedText,
  onSubmit,
  onCancel,
}: {
  quotedText: string
  onSubmit: (body: string) => void
  onCancel: () => void
}) {
  const [body, setBody] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Same reason as ThreadRow's reply focus: autoFocus runs during commit
  // before the sidebar layout effect positions the draft wrapper, so the
  // wrapper sits at y=0 and the browser scrolls the page to reach it.
  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  const handleSubmit = () => {
    const trimmed = body.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setBody("")
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && isModKey(e)) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") onCancel()
  }

  const pinChord = modEnterChord()

  return (
    <div
      className="sticky-with-actions sticky-with-actions--expanded"
      style={{ ["--sticky-rotate" as string]: "-1.2deg" }}
    >
      <div className="sticky-note comment-draft-enter">
        {quotedText ? (
          <>
            <blockquote className="text-caption leading-snug text-[color:var(--sticky-foreground)]/70 not-italic line-clamp-2">
              {"\u201C"}
              {quotedText}
              {"\u201D"}
            </blockquote>
            <hr className="sticky-dashed" aria-hidden />
          </>
        ) : null}
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Jot something…"
          aria-label="New comment"
          rows={3}
          className="sticky-handwritten resize-none border-0 bg-transparent text-[color:var(--sticky-foreground)] placeholder:text-[color:var(--sticky-foreground)]/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none p-0"
        />
      </div>
      <div className="sticky-action-bar" role="toolbar" aria-label="New comment actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            "sticky-skeuo-btn sticky-skeuo-btn--neutral",
            "gap-2 px-2.5 text-xs active:!translate-y-0",
          )}
          aria-keyshortcuts="Escape"
          onClick={onCancel}
        >
          <span className="inline-flex items-center gap-2">
            Cancel
            <Kbd
              className="sticky-skeuo-shortcut sticky-skeuo-shortcut--neutral sticky-skeuo-shortcut--chord"
              aria-hidden
            >
              Esc
            </Kbd>
          </span>
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          className={cn(
            "sticky-skeuo-btn sticky-skeuo-btn--primary",
            "gap-2 px-2.5 text-xs active:!translate-y-0",
          )}
          onClick={handleSubmit}
        >
          <span className="inline-flex items-center gap-2">
            Pin it
            <Kbd
              className="sticky-skeuo-shortcut sticky-skeuo-shortcut--primary sticky-skeuo-shortcut--chord"
              aria-hidden
            >
              <span className="sticky-skeuo-shortcut-mod">{pinChord.mod}</span>
              {pinChord.joiner != null ? (
                <span className="sticky-skeuo-shortcut-joiner">{pinChord.joiner}</span>
              ) : null}
              <span className="sticky-skeuo-shortcut-key">{pinChord.key}</span>
            </Kbd>
          </span>
        </Button>
      </div>
    </div>
  )
}

const ThreadRow = memo(function ThreadRow({
  comment,
  isActive,
  onSelect,
  onReply,
  onEditMessage,
  onDeleteMessage,
  onDelete,
}: {
  comment: Comment
  isActive: boolean
  onSelect: () => void
  onReply: (body: string) => void
  onEditMessage: (messageId: string, body: string) => void
  onDeleteMessage: (messageId: string) => void
  onDelete: () => void
}) {
  const [replyBody, setReplyBody] = useState("")
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [deleteThreadOpen, setDeleteThreadOpen] = useState(false)
  const [pendingReplyDeleteId, setPendingReplyDeleteId] = useState<
    string | null
  >(null)
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const latestMessage = comment.messages[comment.messages.length - 1]

  useEffect(() => {
    const shouldClear =
      !isActive ||
      (editingMessageId !== null &&
        !comment.messages.some((m) => m.id === editingMessageId))
    if (!shouldClear) return
    queueMicrotask(() => {
      setEditingMessageId(null)
      setEditDraft("")
    })
  }, [isActive, comment.messages, editingMessageId])

  // Focus the reply box when this thread becomes active. We can't use
  // `autoFocus` because it runs during commit (before the sidebar's layout
  // effect sets the sticky's transform), so the wrapper still sits at y=0
  // and the browser scrolls the page to bring the textarea into view —
  // jerking the page to the top of the editor.
  useEffect(() => {
    if (!isActive) return
    replyTextareaRef.current?.focus({ preventScroll: true })
  }, [isActive])

  useEffect(() => {
    if (editingMessageId === null) return
    editTextareaRef.current?.focus({ preventScroll: true })
  }, [editingMessageId])

  const handleReply = () => {
    const trimmed = replyBody.trim()
    if (!trimmed) return
    onReply(trimmed)
    setReplyBody("")
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && isModKey(e)) {
      e.preventDefault()
      handleReply()
      return
    }
    if ((e.key === "Delete" || e.key === "Backspace") && isModKey(e)) {
      e.preventDefault()
      if (comment.messages.length <= 1) {
        setDeleteThreadOpen(true)
      } else {
        const last = comment.messages[comment.messages.length - 1]
        setPendingReplyDeleteId(last.id)
      }
    }
  }

  const startEditing = (message: CommentMessage) => {
    setEditingMessageId(message.id)
    setEditDraft(message.body)
  }

  const cancelEditing = () => {
    setEditingMessageId(null)
    setEditDraft("")
  }

  const saveEditing = () => {
    if (!editingMessageId) return
    const trimmed = editDraft.trim()
    if (!trimmed) {
      toast.error("Message cannot be empty")
      return
    }
    onEditMessage(editingMessageId, trimmed)
    cancelEditing()
  }

  const handleEditKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && isModKey(e)) {
      e.preventDefault()
      saveEditing()
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      cancelEditing()
      return
    }
    if ((e.key === "Delete" || e.key === "Backspace") && isModKey(e)) {
      e.preventDefault()
      if (!editingMessageId) return
      const idx = comment.messages.findIndex((m) => m.id === editingMessageId)
      if (idx <= 0) {
        setDeleteThreadOpen(true)
      } else {
        setPendingReplyDeleteId(editingMessageId)
      }
    }
  }

  const rotateStyle = stickyRotationStyle(comment.id)
  const colorClass = stickyColorClass(comment.id)
  const replyChord = modEnterChord()
  const deleteChord = modDeleteChord()

  const handleCollapsedArticleKeyDown = (
    e: ReactKeyboardEvent<HTMLElement>,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <>
      <div
        className={cn(
          "sticky-with-actions",
          colorClass,
          isActive && "sticky-with-actions--expanded",
        )}
        style={rotateStyle}
      >
        <article
          role={isActive ? undefined : "button"}
          tabIndex={isActive ? undefined : 0}
          aria-labelledby={
            isActive ? `comment-${comment.id}-quote` : undefined
          }
          className={cn(
            "sticky-note",
            isActive ? "sticky-note--active" : "sticky-note--pressable",
            colorClass,
          )}
          onClick={
            isActive
              ? undefined
              : (e) => {
                  e.stopPropagation()
                  onSelect()
                }
          }
          onKeyDown={isActive ? undefined : handleCollapsedArticleKeyDown}
        >
          {isActive ? (
            <>
              <blockquote
                id={`comment-${comment.id}-quote`}
                className="text-caption leading-snug text-[color:var(--sticky-foreground)]/70 not-italic line-clamp-2"
              >
                {"\u201C"}
                {comment.quotedText}
                {"\u201D"}
              </blockquote>
              <hr className="sticky-dashed" aria-hidden />

              <div className="space-y-2">
                {comment.messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-1.5",
                      index === 0 ? "" : "items-start",
                    )}
                  >
                    {index > 0 ? (
                      <span
                        className="mt-0.5 shrink-0 font-mono text-[10px] leading-none text-[color:var(--sticky-foreground)]/45 select-none"
                        aria-hidden
                      >
                        +
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {editingMessageId === message.id ? (
                        <div className="space-y-1.5">
                          <Textarea
                            ref={editTextareaRef}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            aria-label={
                              index === 0
                                ? "Edit original note"
                                : "Edit reply"
                            }
                            rows={3}
                            className="sticky-handwritten min-h-[3.25rem] w-full resize-y border-0 bg-transparent p-0 text-[color:var(--sticky-foreground)] placeholder:text-[color:var(--sticky-foreground)]/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] text-[color:var(--sticky-foreground)]/80 hover:bg-black/10"
                              onClick={saveEditing}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] text-[color:var(--sticky-foreground)]/60 hover:bg-black/10"
                              onClick={cancelEditing}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="sticky-handwritten min-w-0 flex-1 whitespace-pre-wrap text-[color:var(--sticky-foreground)]">
                            {message.body}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="h-6 w-6 shrink-0 p-0 text-[color:var(--sticky-foreground)]/50 hover:bg-black/10 hover:text-[color:var(--sticky-foreground)]"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEditing(message)
                            }}
                            aria-label={
                              index === 0
                                ? "Edit original note"
                                : "Edit reply"
                            }
                          >
                            <Pencil className="size-3" strokeWidth={2} />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2.5">
                <Textarea
                  ref={replyTextareaRef}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Reply to comment thread"
                  rows={2}
                  placeholder="Reply…"
                  className="sticky-handwritten resize-none border-0 bg-transparent p-0 text-[color:var(--sticky-foreground)] placeholder:text-[color:var(--sticky-foreground)]/50 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                />
              </div>
            </>
          ) : (
            <>
              <blockquote className="text-caption leading-snug text-[color:var(--sticky-foreground)]/70 not-italic line-clamp-2">
                {"\u201C"}
                {comment.quotedText}
                {"\u201D"}
              </blockquote>
              <hr className="sticky-dashed" aria-hidden />
              <p className="sticky-handwritten whitespace-pre-wrap line-clamp-3 text-[color:var(--sticky-foreground)]">
                {latestMessage?.body}
              </p>
              {comment.messages.length > 1 && (
                <div
                  className="mt-1.5 font-mono text-[10px] leading-none text-[color:var(--sticky-foreground)]/50"
                  aria-label={`${comment.messages.length - 1} more in thread`}
                >
                  <span aria-hidden>
                    + {comment.messages.length - 1}
                  </span>
                </div>
              )}
            </>
          )}
        </article>
        <div
          className="sticky-action-bar sticky-action-bar--thread"
          role="toolbar"
          aria-label="Thread actions"
          aria-hidden={!isActive}
          inert={!isActive}
        >
          <div className="sticky-action-bar__grow">
            <div className="sticky-action-bar__motion">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(
                  "sticky-skeuo-btn sticky-skeuo-btn--neutral",
                  "gap-2 px-2.5 text-xs active:!translate-y-0",
                )}
                onClick={() => setDeleteThreadOpen(true)}
                aria-label="Delete thread"
              >
                <span className="inline-flex items-center gap-2">
                  Delete
                  <Kbd
                    className="sticky-skeuo-shortcut sticky-skeuo-shortcut--neutral sticky-skeuo-shortcut--chord"
                    aria-hidden
                  >
                    <span className="sticky-skeuo-shortcut-mod">{deleteChord.mod}</span>
                    {deleteChord.joiner != null ? (
                      <span className="sticky-skeuo-shortcut-joiner">{deleteChord.joiner}</span>
                    ) : null}
                    <span className="sticky-skeuo-shortcut-key">{deleteChord.key}</span>
                  </Kbd>
                </span>
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className={cn(
                  "sticky-skeuo-btn sticky-skeuo-btn--primary",
                  "gap-2 px-2.5 text-xs active:!translate-y-0",
                )}
                onClick={handleReply}
              >
                <span className="inline-flex items-center gap-2">
                  Reply
                  <Kbd
                    className="sticky-skeuo-shortcut sticky-skeuo-shortcut--primary sticky-skeuo-shortcut--chord"
                    aria-hidden
                  >
                    <span className="sticky-skeuo-shortcut-mod">{replyChord.mod}</span>
                    {replyChord.joiner != null ? (
                      <span className="sticky-skeuo-shortcut-joiner">{replyChord.joiner}</span>
                    ) : null}
                    <span className="sticky-skeuo-shortcut-key">{replyChord.key}</span>
                  </Kbd>
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
      <AlertDialog open={deleteThreadOpen} onOpenChange={setDeleteThreadOpen}>
        <AlertDialogContent>
          <AlertDialogHeader className="gap-2 sm:place-items-start sm:text-left">
            <AlertDialogTitle>Delete this thread?</AlertDialogTitle>
            <AlertDialogDescription className="text-balance text-left">
              This removes the comment from the document and deletes all notes in
              the thread. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <StickyPreview
            quotedText={comment.quotedText}
            entries={comment.messages.map((m, i) => ({
              message: m,
              isReply: i > 0,
            }))}
            colorClass={colorClass}
            rotateStyle={rotateStyle}
            ariaLabel="Thread to be deleted"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              data-alert-dialog-primary=""
              onClick={() => {
                onDelete()
                setDeleteThreadOpen(false)
              }}
            >
              Delete thread
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={pendingReplyDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReplyDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="gap-2 sm:place-items-start sm:text-left">
            <AlertDialogTitle>Delete this reply?</AlertDialogTitle>
            <AlertDialogDescription className="text-balance text-left">
              This reply will be removed from the thread. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(() => {
            const pendingMessage = pendingReplyDeleteId
              ? comment.messages.find((m) => m.id === pendingReplyDeleteId)
              : null
            if (!pendingMessage) return null
            return (
              <StickyPreview
                quotedText={comment.quotedText}
                entries={[{ message: pendingMessage, isReply: true }]}
                colorClass={colorClass}
                rotateStyle={rotateStyle}
                ariaLabel="Reply to be deleted"
              />
            )
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              data-alert-dialog-primary=""
              onClick={() => {
                if (pendingReplyDeleteId) {
                  onDeleteMessage(pendingReplyDeleteId)
                  if (editingMessageId === pendingReplyDeleteId) {
                    cancelEditing()
                  }
                }
                setPendingReplyDeleteId(null)
              }}
            >
              Delete reply
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

function StickyPreview({
  quotedText,
  entries,
  colorClass,
  rotateStyle,
  ariaLabel,
}: {
  quotedText: string
  entries: Array<{ message: CommentMessage; isReply: boolean }>
  colorClass: string
  rotateStyle: CSSProperties
  ariaLabel: string
}) {
  return (
    <div className="px-2 py-1">
      <article
        className={cn("sticky-note", colorClass)}
        style={rotateStyle}
        aria-label={ariaLabel}
      >
        <blockquote className="text-caption leading-snug text-[color:var(--sticky-foreground)]/70 not-italic line-clamp-2">
          {"\u201C"}
          {quotedText}
          {"\u201D"}
        </blockquote>
        <hr className="sticky-dashed" aria-hidden />
        <div className="max-h-44 space-y-1.5 overflow-y-auto">
          {entries.map(({ message, isReply }) => (
            <div
              key={message.id}
              className={cn("flex gap-1.5", isReply && "items-start")}
            >
              {isReply ? (
                <span
                  className="mt-0.5 shrink-0 font-mono text-[10px] leading-none text-[color:var(--sticky-foreground)]/45 select-none"
                  aria-hidden
                >
                  +
                </span>
              ) : null}
              <p className="sticky-handwritten min-w-0 flex-1 whitespace-pre-wrap text-[color:var(--sticky-foreground)] line-clamp-4">
                {message.body}
              </p>
            </div>
          ))}
        </div>
      </article>
    </div>
  )
}
