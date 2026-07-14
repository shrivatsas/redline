import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { Comment } from "@/types/comment"

/** Collapse whitespace like `textBetween(..., " ")` + comparison in the editor. */
export function normalizeQuotedText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/**
 * Builds the same string as `doc.textBetween(1, doc.content.size, " ")` and records,
 * for each character index, a document position that lies on that character's range
 * (gap before the char, ProseMirror-style).
 */
function buildDocTextWithCharPositions(doc: PMNode): {
  raw: string
  docPosForCharIndex: number[]
} {
  const from = 1
  const to = doc.content.size
  const blockSeparator = " "

  let raw = ""
  const docPosForCharIndex: number[] = []
  let first = true

  doc.content.nodesBetween(
    from,
    to,
    (node, pos) => {
      const nodeText = node.isText
        ? node.text!.slice(
            Math.max(from, pos) - pos,
            Math.min(node.text!.length, to - pos),
          )
        : !node.isLeaf
          ? ""
          : node.type.spec.leafText
            ? node.type.spec.leafText(node)
            : ""

      if (
        node.isBlock &&
        ((node.isLeaf && nodeText) || node.isTextblock) &&
        blockSeparator
      ) {
        if (first) {
          first = false
        } else {
          raw += blockSeparator
          docPosForCharIndex.push(pos + 1)
        }
      }

      if (node.isText && nodeText.length > 0) {
        const rel0 = Math.max(from, pos) - pos
        for (let i = 0; i < nodeText.length; i += 1) {
          raw += nodeText[i]!
          docPosForCharIndex.push(pos + 1 + rel0 + i)
        }
      }

      return undefined
    },
    0,
  )

  return { raw, docPosForCharIndex }
}

/** Map each index in `normalizeQuotedText(raw)` to inclusive raw index range. */
function mapNormalizedIndicesToRaw(
  raw: string,
): { normalized: string; normStartRaw: number[]; normEndRaw: number[] } {
  let normalized = ""
  const normStartRaw: number[] = []
  const normEndRaw: number[] = []

  let i = 0
  while (i < raw.length) {
    const ch = raw[i]!
    if (/\s/.test(ch)) {
      let end = i
      while (end < raw.length && /\s/.test(raw[end]!)) {
        end += 1
      }
      normalized += " "
      normStartRaw.push(i)
      normEndRaw.push(end - 1)
      i = end
    } else {
      normalized += ch
      normStartRaw.push(i)
      normEndRaw.push(i)
      i += 1
    }
  }

  const trimStart = normalized.match(/^\s*/)?.[0].length ?? 0
  const trimEnd = normalized.match(/\s*$/)?.[0].length ?? 0
  const innerLen = normalized.length - trimStart - trimEnd
  if (innerLen <= 0) {
    return { normalized: "", normStartRaw: [], normEndRaw: [] }
  }

  return {
    normalized: normalized.slice(trimStart, trimStart + innerLen),
    normStartRaw: normStartRaw.slice(trimStart, trimStart + innerLen),
    normEndRaw: normEndRaw.slice(trimStart, trimStart + innerLen),
  }
}

export function resolveCommentRange(
  editor: TiptapEditor,
  comment: Comment,
): { from: number; to: number } | null {
  const docSize = editor.state.doc.content.size
  if (docSize < 2) return null

  const from = Math.max(1, Math.min(comment.anchorFrom, docSize - 1))
  const fallbackLength = Math.max(comment.quotedText.trim().length, 1)
  const rawTo =
    typeof comment.anchorTo === "number"
      ? comment.anchorTo
      : comment.anchorFrom + fallbackLength
  const to = Math.max(from + 1, Math.min(rawTo, docSize))

  if (to <= from) return null
  return { from, to }
}

export function resolveCommentRangeNearAnchor(
  editor: TiptapEditor,
  comment: Comment,
): { from: number; to: number } | null {
  const doc = editor.state.doc
  const docSize = doc.content.size
  if (docSize < 2) return null

  const normalizedQuote = normalizeQuotedText(comment.quotedText)
  if (!normalizedQuote) return null

  const reference = doc.textBetween(1, docSize, " ")
  const { raw, docPosForCharIndex } = buildDocTextWithCharPositions(doc)

  if (raw !== reference || raw.length !== docPosForCharIndex.length) {
    return resolveCommentRangeNearAnchorBruteForce(editor, comment)
  }

  const { normalized, normStartRaw, normEndRaw } = mapNormalizedIndicesToRaw(raw)
  if (!normalized || normalized.length !== normStartRaw.length) return null

  let match: { from: number; to: number } | null = null
  let searchAt = 0
  while (searchAt <= normalized.length - normalizedQuote.length) {
    const idx = normalized.indexOf(normalizedQuote, searchAt)
    if (idx === -1) break

    const startRaw = normStartRaw[idx]!
    const endRaw = normEndRaw[idx + normalizedQuote.length - 1]!
    const from = docPosForCharIndex[startRaw]!
    const to = docPosForCharIndex[endRaw]! + 1

    if (to > from) {
      if (match) return null
      match = { from, to }
    }
    searchAt = idx + 1
  }

  return match
}

/** Legacy path if the optimized builder ever diverges from `textBetween`. */
function resolveCommentRangeNearAnchorBruteForce(
  editor: TiptapEditor,
  comment: Comment,
): { from: number; to: number } | null {
  const docSize = editor.state.doc.content.size
  if (docSize < 2) return null
  const normalizedQuote = normalizeQuotedText(comment.quotedText)
  if (!normalizedQuote) return null

  const initial = resolveCommentRange(editor, comment)
  const baseFrom = initial?.from ?? Math.max(1, Math.min(comment.anchorFrom, docSize - 1))
  const baseLength = Math.max(
    (initial?.to ?? baseFrom + 1) - baseFrom,
    normalizedQuote.length,
    1,
  )
  const maxOffset = Math.min(docSize, 600)
  const maxLengthJitter = 20
  const MAX_ITERATIONS = 10_000
  let iterations = 0

  let match: { from: number; to: number } | null = null
  for (let k = 0; k <= maxOffset; k += 1) {
    const offsets = k === 0 ? [0] : [k, -k]
    for (const offset of offsets) {
      const candidateFrom = Math.max(1, Math.min(baseFrom + offset, docSize - 1))
      for (let jitter = 0; jitter <= maxLengthJitter; jitter += 1) {
        const lengths =
          jitter === 0 ? [baseLength] : [baseLength + jitter, baseLength - jitter]
        for (const candidateLength of lengths) {
          if (++iterations > MAX_ITERATIONS) return null
          if (candidateLength < 1) continue
          const candidateTo = Math.max(
            candidateFrom + 1,
            Math.min(candidateFrom + candidateLength, docSize),
          )
          if (candidateTo <= candidateFrom) continue
          const candidateText = normalizeQuotedText(
            editor.state.doc.textBetween(candidateFrom, candidateTo, " "),
          )
          if (candidateText === normalizedQuote) {
            if (match) return null
            match = { from: candidateFrom, to: candidateTo }
          }
        }
      }
    }
  }
  return match
}
