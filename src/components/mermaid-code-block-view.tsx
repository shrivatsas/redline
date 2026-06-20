import { useEffect, useId, useState } from "react"
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"
import type { ReactNodeViewProps } from "@tiptap/react"

let mermaidPromise: Promise<Awaited<ReturnType<typeof loadMermaid>>> | null =
  null
let mermaidRenderSequence = 0

async function loadMermaid() {
  const { default: mermaid } = await import("mermaid")

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "neutral",
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif",
  })

  return mermaid
}

function getMermaid() {
  mermaidPromise ??= loadMermaid()
  return mermaidPromise
}

export function MermaidCodeBlockView({ node }: ReactNodeViewProps) {
  const reactId = useId()
  const renderId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`
  const source = node.textContent
  const language = String(node.attrs.language ?? "").toLowerCase()
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (language !== "mermaid") return

    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (!source.trim()) {
        setSvg("")
        setError("")
        return
      }

      try {
        const mermaid = await getMermaid()
        const currentRenderId = `${renderId}-${++mermaidRenderSequence}`
        const { svg: renderedSvg } = await mermaid.render(
          currentRenderId,
          source,
        )
        if (cancelled) return
        setSvg(renderedSvg)
        setError("")
      } catch (cause) {
        if (cancelled) return
        setSvg("")
        setError(cause instanceof Error ? cause.message : "Unable to render diagram")
      }
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [language, renderId, source])

  if (language !== "mermaid") {
    return (
      <NodeViewWrapper>
        <pre>
          <NodeViewContent<"code">
            as="code"
            className={language ? `language-${language}` : undefined}
          />
        </pre>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="mermaid-code-block">
      <div className="mermaid-preview" contentEditable={false}>
        {svg ? (
          <div
            className="mermaid-preview__diagram"
            role="img"
            aria-label="Mermaid diagram"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : error ? (
          <div className="mermaid-preview__error" role="alert">
            <strong>Mermaid syntax error</strong>
            <span>{error}</span>
          </div>
        ) : (
          <div className="mermaid-preview__empty">
            {source.trim() ? "Rendering diagram…" : "Add Mermaid syntax below"}
          </div>
        )}
      </div>
      <div className="mermaid-source-label" contentEditable={false}>
        Mermaid source
      </div>
      <pre className="mermaid-source">
        <NodeViewContent<"code"> as="code" className="language-mermaid" />
      </pre>
    </NodeViewWrapper>
  )
}
