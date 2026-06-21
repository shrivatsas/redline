import { useState, useCallback, useEffect, useRef } from "react"
import type { Editor as TiptapEditor } from "@tiptap/core"
import { useFile, type FileData } from "@/hooks/use-file"
import { useEditorCommentSync } from "@/hooks/use-editor-comment-sync"
import { CommentProvider, useCommentContext } from "@/contexts/comment-context"
import { ShortcutSchemeProvider } from "@/contexts/shortcut-scheme-context"
import { Editor } from "@/components/editor"
import { CommentSidebar } from "@/components/comment-sidebar"
import { BottomToolbar } from "@/components/bottom-toolbar"
import { ReviewTray } from "@/components/review-tray"
import { ClearCommentsDialog } from "@/components/clear-comments-dialog"
import { OutdatedReloadDialog } from "@/components/outdated-reload-dialog"
import { ReviewHeader } from "@/components/review-header"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  isModKey,
  shouldBlockReviewChromeShortcut,
} from "@/lib/mod-key"
import {
  REVIEW_MD_ADD_COMMENT,
  REVIEW_MD_CLEAR_ALL_COMMENTS,
  REVIEW_MD_SUBMIT_REVIEW,
} from "@/lib/review-md-events"

function reviewStampDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function AppKeyboardShortcuts() {
  const { showCommentSidebar, showNewComment, handleCloseNewComment, activeCommentId, setActiveCommentId } = useCommentContext()
  const handlerRef = useRef({ showNewComment, handleCloseNewComment, activeCommentId, setActiveCommentId })
  useEffect(() => {
    handlerRef.current = { showNewComment, handleCloseNewComment, activeCommentId, setActiveCommentId }
  })

  useEffect(() => {
    if (!showCommentSidebar) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const h = handlerRef.current
      if (h.showNewComment) { e.stopPropagation(); e.preventDefault(); h.handleCloseNewComment(); return }
      if (h.activeCommentId !== null) { e.stopPropagation(); e.preventDefault(); h.setActiveCommentId(null); return }
    }
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [showCommentSidebar])

  return null
}

function AppDismissHandler() {
  const { showCommentSidebar, activeCommentId, showNewComment, handleCloseNewComment, setActiveCommentId } = useCommentContext()
  const handlerRef = useRef({ showNewComment, handleCloseNewComment, activeCommentId, setActiveCommentId })
  useEffect(() => {
    handlerRef.current = { showNewComment, handleCloseNewComment, activeCommentId, setActiveCommentId }
  })

  useEffect(() => {
    if (activeCommentId === null && !showNewComment) return

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (
        t.closest(".bubble-menu") ||
        t.closest("[data-prevent-redlines-dismiss]") ||
        t.closest('[data-slot="dropdown-menu-content"]') ||
        t.closest('[data-slot="dropdown-menu-sub-content"]') ||
        t.closest('[data-slot="alert-dialog-overlay"]') ||
        t.closest('[data-slot="alert-dialog-content"]') ||
        t.closest('[data-slot="alert-dialog-portal"]') ||
        t.closest('[data-slot="dialog-content"]') ||
        t.closest('[data-slot="dialog-overlay"]')
      ) {
        return
      }
      const h = handlerRef.current
      if (h.showNewComment && !t.closest("[data-comment-draft]")) {
        h.handleCloseNewComment()
      }
      if (h.activeCommentId !== null) {
        const selector = `[data-comment-thread-id="${CSS.escape(h.activeCommentId)}"]`
        if (!t.closest(selector)) {
          const otherRow = t.closest("[data-comment-thread-id]")
          const otherId = otherRow?.getAttribute("data-comment-thread-id")
          if (
            otherRow != null &&
            otherId != null &&
            otherId !== h.activeCommentId
          ) {
            try {
              otherRow.setPointerCapture(e.pointerId)
            } catch {
              /* element may not accept capture in edge cases */
            }
            h.setActiveCommentId(otherId)
          } else {
            h.setActiveCommentId(null)
          }
        }
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [showCommentSidebar, activeCommentId, showNewComment])

  return null
}

function AppCommandListeners({
  onRequestClearAll,
}: {
  onRequestClearAll: () => void
}) {
  const {
    handleAddCommentClick,
    submitReview,
    hasComments,
    finishReviewOpen,
    setFinishReviewOpen,
  } = useCommentContext()
  const ref = useRef({
    handleAddCommentClick,
    submitReview,
    hasComments,
    finishReviewOpen,
    setFinishReviewOpen,
    onRequestClearAll,
  })
  useEffect(() => {
    ref.current = {
      handleAddCommentClick,
      submitReview,
      hasComments,
      finishReviewOpen,
      setFinishReviewOpen,
      onRequestClearAll,
    }
  })

  useEffect(() => {
    const onAdd = () => ref.current.handleAddCommentClick()
    const onSubmit = () => {
      const r = ref.current
      if (!r.hasComments) return
      if (!r.finishReviewOpen) {
        r.setFinishReviewOpen(true)
        return
      }
      void r.submitReview().then((ok) => {
        if (ok) r.setFinishReviewOpen(false)
      })
    }
    const onClear = () => {
      if (!ref.current.hasComments) return
      ref.current.onRequestClearAll()
    }

    window.addEventListener(REVIEW_MD_ADD_COMMENT, onAdd)
    window.addEventListener(REVIEW_MD_SUBMIT_REVIEW, onSubmit)
    window.addEventListener(REVIEW_MD_CLEAR_ALL_COMMENTS, onClear)
    return () => {
      window.removeEventListener(REVIEW_MD_ADD_COMMENT, onAdd)
      window.removeEventListener(REVIEW_MD_SUBMIT_REVIEW, onSubmit)
      window.removeEventListener(REVIEW_MD_CLEAR_ALL_COMMENTS, onClear)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isModKey(e) || !e.shiftKey || !e.altKey) return
      if (e.code !== "KeyC") return
      if (shouldBlockReviewChromeShortcut(e.target)) return
      e.preventDefault()
      window.dispatchEvent(new CustomEvent(REVIEW_MD_CLEAR_ALL_COMMENTS))
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isModKey(e) || !e.shiftKey || e.altKey) return
      if (e.key.toLowerCase() !== "c") return
      if (e.target instanceof Element && e.target.closest(".ProseMirror")) return
      if (shouldBlockReviewChromeShortcut(e.target)) return
      e.preventDefault()
      window.dispatchEvent(new CustomEvent(REVIEW_MD_SUBMIT_REVIEW))
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  return null
}

function EditorCommentSyncBridge({ editor }: { editor: TiptapEditor }) {
  const { comments, syncCommentAnchorsFromEditor, setActiveCommentId, setShowNewComment } = useCommentContext()
  useEditorCommentSync({ editor, comments, syncCommentAnchorsFromEditor, setActiveCommentId, setShowNewComment })
  return null
}

export function App() {
  const {
    file,
    save,
    saving,
    loadError,
    isOutdated,
    reloadFromDisk,
    notifyMarkdownChange,
    dirty,
    contentReloadNonce,
  } = useFile()

  const [editor, setEditor] = useState<TiptapEditor | null>(null)
  const [outdatedReloadOpen, setOutdatedReloadOpen] = useState(false)
  const [outdatedReloadPending, setOutdatedReloadPending] = useState(false)

  const commentsPersistenceKey = file ? (file.path ?? file.filename) : null

  const handleMarkdownUpdate = useCallback(
    (md: string) => {
      notifyMarkdownChange(md)
      save(md)
    },
    [notifyMarkdownChange, save],
  )

  if (loadError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm">{loadError}</p>
        <p className="text-muted-foreground max-w-md text-xs leading-relaxed">
          To use{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
            pnpm dev
          </code>{" "}
          without the CLI, add{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
            REVIEW_MD_FILE=./path/to/file.md
          </code>{" "}
          to{" "}
          <code className="font-mono text-[11px]">.env.local</code> or{" "}
          <code className="font-mono text-[11px]">.env.development.local</code>{" "}
          (path relative to the project root), then restart Vite. Or run{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
            node dist/cli/index.js ./file.md
          </code>{" "}
          and open the URL it prints.
        </p>
      </div>
    )
  }

  if (!file) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading…
        </div>
      </div>
    )
  }

  return (
    <ShortcutSchemeProvider>
      <CommentProvider editor={editor} persistenceKey={commentsPersistenceKey}>
        <AppShell
          file={file}
          editor={editor}
          setEditor={setEditor}
          saving={saving}
          isOutdated={isOutdated}
          dirty={dirty}
          contentReloadNonce={contentReloadNonce}
          handleMarkdownUpdate={handleMarkdownUpdate}
          outdatedReloadOpen={outdatedReloadOpen}
          setOutdatedReloadOpen={setOutdatedReloadOpen}
          outdatedReloadPending={outdatedReloadPending}
          setOutdatedReloadPending={setOutdatedReloadPending}
          reloadFromDisk={reloadFromDisk}
        />
      </CommentProvider>
    </ShortcutSchemeProvider>
  )
}

interface AppShellProps {
  file: FileData
  editor: TiptapEditor | null
  setEditor: (e: TiptapEditor) => void
  saving: boolean
  isOutdated: boolean
  dirty: boolean
  contentReloadNonce: number
  handleMarkdownUpdate: (md: string) => void
  outdatedReloadOpen: boolean
  setOutdatedReloadOpen: (v: boolean) => void
  outdatedReloadPending: boolean
  setOutdatedReloadPending: (v: boolean) => void
  reloadFromDisk: () => Promise<void>
}

function AppShell({
  file,
  editor,
  setEditor,
  saving,
  isOutdated,
  dirty,
  contentReloadNonce,
  handleMarkdownUpdate,
  outdatedReloadOpen,
  setOutdatedReloadOpen,
  outdatedReloadPending,
  setOutdatedReloadPending,
  reloadFromDisk,
}: AppShellProps) {
  const {
    showCommentSidebar,
    showNewComment,
    activeCommentId,
    pendingDraftCommentId,
    handleCloseNewComment,
    handleAddCommentClick,
    clearAllComments,
    clearHover,
  } = useCommentContext()

  const [clearCommentsOpen, setClearCommentsOpen] = useState(false)

  const confirmOutdatedReload = useCallback(async () => {
    setOutdatedReloadPending(true)
    try {
      await reloadFromDisk()
      if (showNewComment || pendingDraftCommentId) handleCloseNewComment()
      clearAllComments()
      clearHover()
      setOutdatedReloadOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setOutdatedReloadPending(false)
    }
  }, [
    showNewComment,
    pendingDraftCommentId,
    handleCloseNewComment,
    clearAllComments,
    reloadFromDisk,
    clearHover,
    setOutdatedReloadOpen,
    setOutdatedReloadPending,
  ])

  return (
    <div className="flex min-h-svh flex-col pt-[calc(env(safe-area-inset-top)+2.75rem)] pb-[max(3.5rem,env(safe-area-inset-bottom))]">
      <ReviewHeader
        isOutdated={isOutdated}
        saving={saving}
        onOutdatedClick={() => setOutdatedReloadOpen(true)}
      />

      <OutdatedReloadDialog
        open={outdatedReloadOpen}
        onOpenChange={setOutdatedReloadOpen}
        dirty={dirty}
        pending={outdatedReloadPending}
        onConfirm={confirmOutdatedReload}
      />

      <ClearCommentsDialog
        open={clearCommentsOpen}
        onOpenChange={setClearCommentsOpen}
        onConfirm={clearAllComments}
      />

      <AppKeyboardShortcuts />
      <AppDismissHandler />
      <AppCommandListeners
        onRequestClearAll={() => setClearCommentsOpen(true)}
      />
      {editor && <EditorCommentSyncBridge editor={editor} />}

        <main className="relative min-w-0 flex-1">
          <h1 className="sr-only">Review {file.filename}</h1>
          <div className="mx-auto w-full max-w-[72rem] px-6 py-6">
            <div
              className={cn(
                "relative mx-auto w-full",
                showCommentSidebar
                  ? "max-w-3xl lg:max-w-[min(100%,calc(48rem+clamp(13.5rem,22vw,16.5rem)))]"
                  : "max-w-3xl",
              )}
            >
              <div className="w-full max-w-3xl">
                <div className="editor-surface-light paper-stack w-full">
                  <div className="paper-page">
                    <div className="paper-stamp">
                      <span>
                        {file.root
                          ? `${file.root}/${file.path ?? file.filename}`
                          : (file.path ?? file.filename)}
                      </span>
                      <span aria-hidden className="paper-stamp-sep" />
                      <span>REV {reviewStampDate()}</span>
                    </div>
                    <Editor
                      content={file.content}
                      onUpdate={handleMarkdownUpdate}
                      contentReloadNonce={contentReloadNonce}
                      onEditorReady={setEditor}
                      bubbleMenuSuppressed={showNewComment || activeCommentId !== null}
                      onAddComment={handleAddCommentClick}
                    />
                  </div>
                </div>
              </div>

              <aside
                className={cn(
                  "min-h-0 min-w-0",
                  showCommentSidebar
                    ? "opacity-100"
                    : "pointer-events-none opacity-0 max-lg:hidden max-lg:max-h-0 max-lg:overflow-hidden lg:translate-x-1",
                  "mt-4 w-full max-lg:mx-auto max-lg:max-w-md sm:max-lg:max-w-lg",
                  "lg:mt-0 lg:mx-0 lg:w-[clamp(13.5rem,22vw,16.5rem)] lg:max-w-none",
                  "lg:absolute lg:top-0 lg:z-10 lg:pl-3 lg:translate-x-0 xl:pl-5",
                  "lg:left-[48rem]",
                )}
                aria-hidden={!showCommentSidebar}
              >
                <div className="min-w-0 w-full max-w-full">
                  <CommentSidebar editor={editor} />
                </div>
              </aside>
            </div>
          </div>
        </main>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
        aria-label="Quick actions"
      >
        <BottomToolbar />
      </div>
      <ReviewTray />
    </div>
  )
}

export default App
