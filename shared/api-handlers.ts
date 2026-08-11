import { createHash } from "node:crypto"
import { existsSync, statSync } from "node:fs"
import { basename, dirname, relative, resolve, sep } from "node:path"
import type { Stats } from "node:fs"

export function computeRevFromStats(st: Pick<Stats, "mtimeMs" | "size">): string {
  return createHash("sha256")
    .update(`${st.mtimeMs}:${st.size}`)
    .digest("hex")
    .slice(0, 16)
}

/**
 * Walk up from the file's directory looking for a `.git` entry. Returns the
 * absolute path of the nearest repo root, or null if the file isn't inside a
 * git repo.
 */
function findRepoRoot(filePath: string): string | null {
  const resolved = resolve(filePath)
  let dir = dirname(resolved)
  while (true) {
    const gitPath = `${dir}${sep}.git`
    if (existsSync(gitPath)) {
      try {
        const st = statSync(gitPath)
        if (st.isDirectory() || st.isFile()) return dir
      } catch {
        // fall through to parent
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Path shown next to the REV stamp. Relative to the nearest git repo root when
 * one exists (so the location reads the same no matter where the CLI was
 * launched from); falls back to cwd-relative otherwise.
 */
export function getDisplayPath(filePath: string): string {
  const filename = basename(filePath)
  const repoRoot = findRepoRoot(filePath)
  const base = repoRoot ?? process.cwd()
  return relative(base, filePath).split(/[/\\]/).join("/") || filename
}

/**
 * Returns a label for the file's enclosing context:
 *   - The basename of the nearest git repo root (walking up from the file's dir), or
 *   - The basename of the file's immediate parent directory if not in a git repo.
 *
 * Returns null only if the path has no parent (filesystem root) and no git repo —
 * which in practice means we got passed an unusable path.
 */
export function getRootLabel(filePath: string): string | null {
  const repoRoot = findRepoRoot(filePath)
  if (repoRoot) return basename(repoRoot) || null
  const resolved = resolve(filePath)
  return basename(dirname(resolved)) || null
}

export type ParsePutBodyResult =
  | { ok: true; content: string }
  | { ok: false; error: string }

/** Safe JSON body for PUT /api/file — rejects malformed JSON and wrong shape. */
export function parseFilePutBody(body: string): ParsePutBodyResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { ok: false, error: "Invalid JSON" }
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("content" in parsed) ||
    typeof (parsed as { content: unknown }).content !== "string"
  ) {
    return { ok: false, error: "Expected { content: string }" }
  }
  return { ok: true, content: (parsed as { content: string }).content }
}

/**
 * Returns true if `candidatePath` is exactly `rootDir` or a file/dir inside it
 * (after resolving). Prevents path traversal via `..` or absolute paths.
 */
export function isResolvedPathInsideDirectory(
  rootDir: string,
  candidatePath: string,
): boolean {
  const root = resolve(rootDir)
  const candidate = resolve(candidatePath)
  if (candidate === root) return true
  const prefix = root.endsWith(sep) ? root : root + sep
  return candidate.startsWith(prefix)
}

/** Resolve an Excalidraw link without allowing access outside the document folder. */
export function resolveExcalidrawAssetPath(
  markdownFilePath: string,
  linkedPath: string,
): string | null {
  const documentDir = dirname(resolve(markdownFilePath))
  const assetPath = resolve(documentDir, linkedPath)

  if (!linkedPath.toLowerCase().endsWith(".excalidraw")) return null
  if (!isResolvedPathInsideDirectory(documentDir, assetPath)) return null

  return assetPath
}
