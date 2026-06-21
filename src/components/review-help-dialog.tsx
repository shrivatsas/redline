import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { useShortcutScheme } from "@/contexts/shortcut-scheme-context"
import {
  ChordModAltCompact,
  ChordModShiftAlt,
  ChordModShiftCompact,
  ChordNewCommentShortcut,
} from "@/components/shortcut-glyph-chords"
import { cn } from "@/lib/utils"
import {
  dialogBody,
  dialogHeaderBlock,
  dialogInlineKbdChip,
  dialogLead,
  dialogSection,
  dialogSectionLast,
  dialogSectionTitle,
  dialogScrollableSurface,
  dialogShortcutList,
  dialogShortcutRow,
} from "@/components/review-dialog-styles"

interface ReviewHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opens Settings (parent should close help). */
  onOpenSettings?: () => void
}

function Row({ label, keys }: { label: string; keys: ReactNode }) {
  return (
    <div className={dialogShortcutRow}>
      <span className={cn(dialogBody, "min-w-0 flex-1")}>{label}</span>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{keys}</div>
    </div>
  )
}

export function ReviewHelpDialog({
  open,
  onOpenChange,
  onOpenSettings,
}: ReviewHelpDialogProps) {
  const { scheme } = useShortcutScheme()
  const newCommentLabel =
    scheme === "google-docs" ? "New comment (Google Docs style)" : "New comment (Notion style)"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={dialogScrollableSurface}
        data-prevent-redlines-dismiss=""
      >
        <div className={dialogHeaderBlock}>
          <DialogHeader className="text-left">
            <DialogTitle>Redline</DialogTitle>
            <DialogDescription className="sr-only">
              Redline: review markdown with anchored comments and keyboard shortcuts.
            </DialogDescription>
            <div className="space-y-2">
              <p className={dialogLead}>
                Review mode for LLM-generated plans — Docs-style comments on any{" "}
                <Kbd className={dialogInlineKbdChip}>
                  .md
                </Kbd>
                , then copy everything back to the LLM in one shot.
              </p>
            </div>
          </DialogHeader>
        </div>

        <div className={dialogSection}>
          <div className="space-y-2">
            <h3 className={dialogSectionTitle}>How to use</h3>
            <p className={dialogBody}>
              Select text → thread replies →{" "}
              <span className="font-medium text-foreground/90">
                Finish review
              </span>{" "}
              to open the sheet and copy.
            </p>
          </div>
        </div>

        <div className={dialogSection}>
          <div className="space-y-2">
            <h3 className={dialogSectionTitle}>Shortcuts</h3>
            {onOpenSettings ? (
              <p className={dialogBody}>
                To customize these,{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-2 transition-colors duration-150 ease-out hover:underline"
                  onClick={() => {
                    onOpenChange(false)
                    onOpenSettings()
                  }}
                >
                  open Settings
                </button>
                .
              </p>
            ) : null}
            <div className={dialogShortcutList}>
              <Row
                label={newCommentLabel}
                keys={
                  <Kbd>
                    <ChordNewCommentShortcut scheme={scheme} />
                  </Kbd>
                }
              />
              <Row
                label="Finish review / copy"
                keys={
                  <Kbd>
                    <ChordModShiftCompact letter="C" />
                  </Kbd>
                }
              />
              <Row
                label="Clear all"
                keys={
                  <Kbd>
                    <ChordModShiftAlt letter="C" />
                  </Kbd>
                }
              />
              <Row
                label="Theme"
                keys={
                  <Kbd>
                    <ChordModAltCompact letter="T" />
                  </Kbd>
                }
              />
            </div>
          </div>
        </div>

        <div className={dialogSectionLast}>
          <p className={cn(dialogBody, "text-center")}>
            <span className="font-sans">Built for markdown review workflows.</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
