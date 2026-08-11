import { createServer, type IncomingMessage, type ServerResponse } from "http"
import { randomUUID } from "crypto"
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from "fs"
import { join, dirname, basename, resolve } from "path"
import { tmpdir } from "os"
import { fileURLToPath } from "url"
import {
  computeRevFromStats,
  getDisplayPath,
  getRootLabel,
  isResolvedPathInsideDirectory,
  parseFilePutBody,
  resolveExcalidrawAssetPath,
} from "../shared/api-handlers.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const registryPath = join(tmpdir(), "redline-server.json")

interface ServerRegistry {
  port: number
  token: string
}

interface ReviewSession {
  filePath: string
}

export interface StartedServer {
  close: () => void
}

function reviewUrl(port: number, reviewId: string): string {
  return `http://localhost:${port}/reviews/${reviewId}`
}

function createReview(sessions: Map<string, ReviewSession>, filePath: string): string {
  const reviewId = randomUUID()
  sessions.set(reviewId, { filePath })
  return reviewId
}

function readRegistry(): ServerRegistry | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(registryPath, "utf-8"))
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as ServerRegistry).port !== "number" ||
      typeof (parsed as ServerRegistry).token !== "string"
    ) {
      return null
    }
    return parsed as ServerRegistry
  } catch {
    return null
  }
}

function removeRegistry(expectedToken?: string) {
  try {
    if (expectedToken && readRegistry()?.token !== expectedToken) return
    unlinkSync(registryPath)
  } catch {
    // The registry may already have been removed by a prior shutdown.
  }
}

/** Registers a review with the existing local Redline server, if one is live. */
export async function registerWithRunningServer(filePath: string): Promise<string | null> {
  const registry = readRegistry()
  if (!registry) return null

  try {
    const response = await fetch(`http://localhost:${registry.port}/api/reviews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Redline-Control": registry.token,
      },
      body: JSON.stringify({ filePath }),
      signal: AbortSignal.timeout(500),
    })
    if (!response.ok) throw new Error("Could not register review")
    const data: unknown = await response.json()
    if (!data || typeof data !== "object" || typeof (data as { url?: unknown }).url !== "string") {
      throw new Error("Invalid response from Redline server")
    }
    return (data as { url: string }).url
  } catch {
    removeRegistry(registry.token)
    return null
  }
}

/** Stops the existing local Redline server, if one is live. */
export async function stopRunningServer(): Promise<boolean> {
  const registry = readRegistry()
  if (!registry) return false

  try {
    const response = await fetch(`http://localhost:${registry.port}/api/server/stop`, {
      method: "POST",
      headers: { "X-Redline-Control": registry.token },
      signal: AbortSignal.timeout(500),
    })
    if (!response.ok) throw new Error("Could not stop Redline server")
    removeRegistry(registry.token)
    return true
  } catch {
    removeRegistry(registry.token)
    return false
  }
}

/** Starts the shared local Redline server without registering a review. */
export function startServer(port: number): Promise<StartedServer> {
  const clientDirRaw = join(__dirname, "../client")
  const clientDirResolved = resolve(clientDirRaw)
  const useClientDir = existsSync(clientDirResolved)
  let activePort = port
  const controlToken = randomUUID()
  const sessions = new Map<string, ReviewSession>()

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://localhost:${activePort}`)

    if (url.pathname === "/api/server" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ service: "redline" }))
      return
    }

    if (url.pathname === "/api/server/stop" && req.method === "POST") {
      if (req.headers["x-redline-control"] !== controlToken) {
        res.writeHead(403)
        res.end("Forbidden")
        return
      }
      server.close(() => removeRegistry(controlToken))
      res.writeHead(202)
      res.end()
      return
    }

    if (url.pathname === "/api/reviews" && req.method === "POST") {
      if (req.headers["x-redline-control"] !== controlToken) {
        res.writeHead(403)
        res.end("Forbidden")
        return
      }
      let body = ""
      for await (const chunk of req) body += chunk
      try {
        const parsed: unknown = JSON.parse(body)
        if (!parsed || typeof parsed !== "object" || typeof (parsed as { filePath?: unknown }).filePath !== "string") {
          throw new Error("Invalid request")
        }
        const reviewId = createReview(sessions, (parsed as { filePath: string }).filePath)
        res.writeHead(201, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ url: reviewUrl(activePort, reviewId) }))
      } catch {
        res.writeHead(400)
        res.end("Invalid request")
      }
      return
    }

    const reviewRoute = url.pathname.match(/^\/api\/reviews\/([^/]+)\/file(?:\/(meta|asset))?$/)
    const session = reviewRoute ? sessions.get(reviewRoute[1]!) : undefined

    if (reviewRoute && !session) {
      res.writeHead(404)
      res.end("Review not found")
      return
    }

    // API: file metadata (mtime/size/rev)
    if (reviewRoute?.[2] === "meta" && req.method === "GET") {
      try {
        const st = statSync(session!.filePath)
        const rev = computeRevFromStats(st)
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        })
        res.end(
          JSON.stringify({
            mtimeMs: st.mtimeMs,
            size: st.size,
            rev,
          }),
        )
      } catch (e) {
        res.writeHead(500, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        })
        res.end(
          JSON.stringify({
            error: e instanceof Error ? e.message : "Failed to stat file",
          }),
        )
      }
      return
    }

    // API: read an Excalidraw file linked from the reviewed document
    if (reviewRoute?.[2] === "asset" && req.method === "GET") {
      const assetPath = resolveExcalidrawAssetPath(
        session!.filePath,
        url.searchParams.get("path") ?? "",
      )
      if (!assetPath) {
        res.writeHead(403)
        res.end("Forbidden")
        return
      }
      try {
        const st = statSync(assetPath)
        if (!st.isFile()) throw new Error("Asset is not a file")
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        })
        res.end(readFileSync(assetPath, "utf-8"))
      } catch {
        res.writeHead(404)
        res.end("Excalidraw file not found")
      }
      return
    }

    // API: read file
    if (reviewRoute && !reviewRoute[2] && req.method === "GET") {
      const content = readFileSync(session!.filePath, "utf-8")
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      })
      const filename = basename(session!.filePath)
      const displayPath = getDisplayPath(session!.filePath)
      const root = getRootLabel(session!.filePath)
      res.end(JSON.stringify({ content, filename, path: displayPath, root }))
      return
    }

    // API: write file
    if (reviewRoute && !reviewRoute[2] && req.method === "PUT") {
      let body = ""
      for await (const chunk of req) body += chunk
      const parsed = parseFilePutBody(body)
      if (!parsed.ok) {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        })
        res.end(JSON.stringify({ error: parsed.error }))
        return
      }
      writeFileSync(session!.filePath, parsed.content, "utf-8")
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      })
      res.end()
      return
    }

    // Static files (production only — in dev, Vite handles this)
    if (useClientDir) {
      const rawPath =
        url.pathname === "/" || url.pathname === "" ? "index.html" : url.pathname.replace(/^\//, "")
      let decodedPath = rawPath
      try {
        decodedPath = decodeURIComponent(rawPath)
      } catch {
        res.writeHead(400)
        res.end("Bad request")
        return
      }
      const staticPath = resolve(clientDirResolved, decodedPath)
      if (!isResolvedPathInsideDirectory(clientDirResolved, staticPath)) {
        res.writeHead(403)
        res.end("Forbidden")
        return
      }
      if (existsSync(staticPath)) {
        const ext = staticPath.split(".").pop()
        const mimeTypes: Record<string, string> = {
          html: "text/html",
          js: "application/javascript",
          css: "text/css",
          svg: "image/svg+xml",
          png: "image/png",
          json: "application/json",
        }
        res.writeHead(200, {
          "Content-Type": mimeTypes[ext!] || "application/octet-stream",
        })
        res.end(readFileSync(staticPath))
        return
      }
      // SPA fallback
      const indexPath = resolve(clientDirResolved, "index.html")
      if (!isResolvedPathInsideDirectory(clientDirResolved, indexPath)) {
        res.writeHead(403)
        res.end("Forbidden")
        return
      }
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(readFileSync(indexPath))
      return
    }

    res.writeHead(404)
    res.end("Not found")
  })

  return new Promise((resolveListen, rejectListen) => {
    const listenOnPort = (candidatePort: number) => {
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          server.off("listening", onListening)
          listenOnPort(candidatePort + 1)
          return
        }

        rejectListen(err)
      }

      const onListening = () => {
        server.off("error", onError)
        activePort = candidatePort
        writeFileSync(
          registryPath,
          JSON.stringify({ port: candidatePort, token: controlToken }),
          { mode: 0o600 },
        )
        resolveListen({
          close: () => {
            removeRegistry(controlToken)
            server.close()
          },
        })
      }

      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(candidatePort)
    }

    listenOnPort(port)
  })
}
