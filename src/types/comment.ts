export interface CommentMessage {
  id: string
  body: string
  createdAt: string
}

export interface Comment {
  id: string
  quotedText: string
  messages: CommentMessage[]
  createdAt: string
  anchorFrom: number
  anchorTo?: number
  anchorStatus?: "attached" | "needs-attention"
}

export function isCommentMessage(x: unknown): x is CommentMessage {
  if (typeof x !== "object" || x === null) return false
  const m = x as Record<string, unknown>
  return (
    typeof m.id === "string" &&
    typeof m.body === "string" &&
    typeof m.createdAt === "string"
  )
}

export function isComment(x: unknown): x is Comment {
  if (typeof x !== "object" || x === null) return false
  const c = x as Record<string, unknown>
  if (typeof c.id !== "string") return false
  if (typeof c.quotedText !== "string") return false
  if (typeof c.createdAt !== "string") return false
  if (typeof c.anchorFrom !== "number") return false
  if (c.anchorTo !== undefined && typeof c.anchorTo !== "number") return false
  if (
    c.anchorStatus !== undefined &&
    c.anchorStatus !== "attached" &&
    c.anchorStatus !== "needs-attention"
  ) {
    return false
  }
  if (!Array.isArray(c.messages) || !c.messages.every(isCommentMessage)) {
    return false
  }
  return true
}
