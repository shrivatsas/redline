import { Loader2 } from "lucide-react"
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

interface OutdatedReloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dirty: boolean
  pending: boolean
  onConfirm: () => void
}

export function OutdatedReloadDialog({
  open,
  onOpenChange,
  dirty,
  pending,
  onConfirm,
}: OutdatedReloadDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader className="gap-2 sm:place-items-start sm:text-left">
          <AlertDialogTitle>Refresh source?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-balance text-left">
            {dirty ? (
              <span className="block">Your unsaved edits will be discarded.</span>
            ) : null}
            <span className="block">
              Comments on unchanged or uniquely matched text will be retained.
              Other threads will be kept and marked as needing attention.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            data-alert-dialog-primary=""
            disabled={pending}
            onClick={() => void onConfirm()}
          >
            {pending ? (
              <>
                <Loader2
                  className="mr-1.5 size-3.5 shrink-0 animate-spin"
                  aria-hidden
                />
                Refreshing…
              </>
            ) : (
              "Refresh source"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
