import { useState, useEffect, useCallback, useRef } from "react"

export interface FileData {
  content: string
  filename: string
  /** Relative path for display (POSIX-style), e.g. docs/README.md */
  path?: string
  /**
   * Display label for the file's enclosing context — basename of the nearest
   * git repo root, or basename of the file's parent dir if not in a repo.
   */
  root?: string
}

export interface FileMeta {
  mtimeMs: number
  size: number
  rev: string
}

function parseFileMeta(data: unknown): FileMeta | null {
  if (!data || typeof data !== "object") return null
  const o = data as Record<string, unknown>
  if (
    typeof o.mtimeMs !== "number" ||
    typeof o.size !== "number" ||
    typeof o.rev !== "string"
  ) {
    return null
  }
  return { mtimeMs: o.mtimeMs, size: o.size, rev: o.rev }
}

function getFileApiPath(): string {
  const reviewId = window.location.pathname.match(/^\/reviews\/([^/]+)/)?.[1]
  return reviewId ? `/api/reviews/${reviewId}/file` : "/api/file"
}

async function fetchFileMeta(fileApiPath: string): Promise<FileMeta | null> {
  const res = await fetch(`${fileApiPath}/meta`)
  if (!res.ok) return null
  const text = await res.text()
  let data: unknown
  try {
    data = text.trim() === "" ? null : JSON.parse(text)
  } catch {
    return null
  }
  return parseFileMeta(data)
}

export function useFile() {
  const fileApiPath = getFileApiPath()
  const [file, setFile] = useState<FileData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [baseMeta, setBaseMeta] = useState<FileMeta | null>(null)
  const [latestMeta, setLatestMeta] = useState<FileMeta | null>(null)
  const [workingMarkdown, setWorkingMarkdown] = useState<string | null>(null)
  const [contentReloadNonce, setContentReloadNonce] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  const notifyMarkdownChange = useCallback((markdown: string) => {
    setWorkingMarkdown(markdown)
  }, [])

  useEffect(() => {
    if (file) {
      setWorkingMarkdown(file.content)
    } else {
      setWorkingMarkdown(null)
    }
  }, [file])

  useEffect(() => {
    setLoadError(null)
    void fetch(fileApiPath)
      .then(async (r) => {
        const text = await r.text()
        let data: unknown
        try {
          data = text.trim() === "" ? null : JSON.parse(text)
        } catch {
          throw new Error(
            r.ok
              ? "Invalid JSON from /api/file (empty or non-JSON body)."
              : `Server error (${r.status}): ${text.slice(0, 120) || "empty response"}`,
          )
        }
        if (!r.ok && data && typeof data === "object" && data !== null && "error" in data) {
          throw new Error(String((data as { error: unknown }).error))
        }
        if (!r.ok) {
          throw new Error(r.statusText || "Failed to load file")
        }
        if (
          !data ||
          typeof data !== "object" ||
          !("content" in data) ||
          !("filename" in data)
        ) {
          throw new Error("Invalid response from /api/file")
        }
        return data as FileData
      })
      .then(async (loaded) => {
        setFile(loaded)
        const meta = await fetchFileMeta(fileApiPath)
        if (meta) {
          setBaseMeta(meta)
          setLatestMeta(meta)
        }
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Failed to load file")
      })
    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [fileApiPath])

  useEffect(() => {
    if (loadError || !file) return

    const poll = async () => {
      try {
        const meta = await fetchFileMeta(fileApiPath)
        if (meta) setLatestMeta(meta)
      } catch {
        // ignore network errors during poll
      }
    }

    void poll()
    const id = window.setInterval(poll, 2000)
    return () => window.clearInterval(id)
  }, [loadError, file, fileApiPath])

  const save = useCallback((content: string) => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch(fileApiPath, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        })
        if (res.ok) {
          setFile((f) => (f ? { ...f, content } : f))
          setWorkingMarkdown(content)
          const meta = await fetchFileMeta(fileApiPath)
          if (meta) {
            setBaseMeta(meta)
            setLatestMeta(meta)
          }
        }
      } finally {
        setSaving(false)
      }
    }, 500)
  }, [fileApiPath])

  const reloadFromDisk = useCallback(async () => {
    const res = await fetch(fileApiPath)
    const text = await res.text()
    let data: unknown
    try {
      data = text.trim() === "" ? null : JSON.parse(text)
    } catch {
      throw new Error(
        res.ok
          ? "Invalid JSON from /api/file."
          : `Server error (${res.status})`,
      )
    }
    if (!res.ok || !data || typeof data !== "object" || !("content" in data)) {
      throw new Error("Failed to reload file")
    }
    setFile(data as FileData)
    try {
      const meta = await fetchFileMeta(fileApiPath)
      if (meta) {
        setBaseMeta(meta)
        setLatestMeta(meta)
      }
    } catch {
      // ignore meta fetch errors; file content still reloaded above
    }
    setContentReloadNonce((n) => n + 1)
  }, [fileApiPath])

  const dirty =
    file !== null &&
    workingMarkdown !== null &&
    workingMarkdown !== file.content

  const isOutdated =
    baseMeta !== null &&
    latestMeta !== null &&
    baseMeta.rev !== latestMeta.rev

  return {
    file,
    save,
    saving,
    loadError,
    isOutdated,
    reloadFromDisk,
    notifyMarkdownChange,
    dirty,
    contentReloadNonce,
  }
}
