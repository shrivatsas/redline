import { useEffect, useState } from "react"
import { MarkViewContent } from "@tiptap/react"
import type { MarkViewProps } from "@tiptap/core"

function isExcalidrawLink(href: string) {
  try {
    const url = new URL(href, window.location.href)
    return (
      url.origin === window.location.origin &&
      url.pathname.toLowerCase().endsWith(".excalidraw")
    )
  } catch {
    return false
  }
}

function getAssetUrl(href: string) {
  const reviewId = window.location.pathname.match(/^\/reviews\/([^/]+)/)?.[1]
  const fileApiPath = reviewId ? `/api/reviews/${reviewId}/file` : "/api/file"
  const linkedPath = href.split(/[?#]/, 1)[0] ?? href
  return `${fileApiPath}/asset?path=${encodeURIComponent(linkedPath)}`
}

export function ExcalidrawLinkView({ mark }: MarkViewProps) {
  const href = String(mark.attrs.href ?? "")
  const previewable = isExcalidrawLink(href)
  const [svg, setSvg] = useState<SVGSVGElement | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!previewable) return

    const controller = new AbortController()
    void fetch(getAssetUrl(href), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Excalidraw file not found")
        const scene: unknown = await response.json()
        if (
          !scene ||
          typeof scene !== "object" ||
          !("elements" in scene) ||
          !Array.isArray(scene.elements)
        ) {
          throw new Error("Invalid Excalidraw file")
        }

        const { exportToSvg } = await import("@excalidraw/excalidraw")
        const data = scene as Parameters<typeof exportToSvg>[0]
        return exportToSvg({
          elements: data.elements,
          appState: {
            ...data.appState,
            exportBackground: true,
            exportWithDarkMode: false,
          },
          files: data.files ?? null,
          exportPadding: 24,
        })
      })
      .then((renderedSvg) => {
        if (controller.signal.aborted) return
        renderedSvg.setAttribute("role", "img")
        renderedSvg.setAttribute("aria-label", "Excalidraw diagram")
        setSvg(renderedSvg)
        setError("")
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setSvg(null)
        setError(
          cause instanceof Error ? cause.message : "Unable to render diagram"
        )
      })

    return () => controller.abort()
  }, [href, previewable])

  return (
    <>
      <a
        href={previewable ? getAssetUrl(href) : href}
        target={previewable ? "_blank" : mark.attrs.target}
        rel={previewable ? "noopener noreferrer" : mark.attrs.rel}
      >
        <MarkViewContent />
      </a>
      {previewable ? (
        <span className="excalidraw-preview" contentEditable={false}>
          {svg ? (
            <span
              className="excalidraw-preview__diagram"
              ref={(element) => {
                if (element && !element.contains(svg)) element.appendChild(svg)
              }}
            />
          ) : error ? (
            <span className="excalidraw-preview__error" role="alert">
              <strong>Excalidraw preview unavailable</strong>
              <span>{error}</span>
            </span>
          ) : (
            <span className="excalidraw-preview__empty">
              Rendering diagram…
            </span>
          )}
        </span>
      ) : null}
    </>
  )
}
