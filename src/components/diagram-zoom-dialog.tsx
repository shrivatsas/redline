import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface DiagramZoomDialogProps {
  svg: string
  label: string
  className?: string
}

export function DiagramZoomDialog({
  svg,
  label,
  className,
}: DiagramZoomDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn("diagram-zoom-trigger", className)}
            aria-label={`Enlarge ${label}`}
            title={`Enlarge ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        }
      />
      <DialogContent className="diagram-zoom-dialog h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] p-8 sm:max-w-[calc(100vw-2rem)]">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <div
          className="diagram-zoom-dialog__diagram"
          role="img"
          aria-label={label}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </DialogContent>
    </Dialog>
  )
}
