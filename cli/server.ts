import { createServer, type IncomingMessage, type ServerResponse } from "http"
import { readFileSync, writeFileSync, existsSync, statSync } from "fs"
import { join, dirname, basename, resolve } from "path"
import { fileURLToPath } from "url"
import {
  computeRevFromStats,
  getDisplayPath,
  getRootLabel,
  isResolvedPathInsideDirectory,
  parseFilePutBody,
} from "../shared/api-handlers.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

export function startServer(filePath: string, port: number): Promise<string> {
  const clientDirRaw = join(__dirname, "../client")
  const clientDirResolved = resolve(clientDirRaw)
  const useClientDir = existsSync(clientDirResolved)
  let activePort = port

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://localhost:${activePort}`)

    // API: file metadata (mtime/size/rev)
    if (url.pathname === "/api/file/meta" && req.method === "GET") {
      try {
        const st = statSync(filePath)
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

    // API: read file
    if (url.pathname === "/api/file" && req.method === "GET") {
      const content = readFileSync(filePath, "utf-8")
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      })
      const filename = basename(filePath)
      const displayPath = getDisplayPath(filePath)
      const root = getRootLabel(filePath)
      res.end(JSON.stringify({ content, filename, path: displayPath, root }))
      return
    }

    // API: write file
    if (url.pathname === "/api/file" && req.method === "PUT") {
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
      writeFileSync(filePath, parsed.content, "utf-8")
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
        resolveListen(`http://localhost:${candidatePort}`)
      }

      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(candidatePort)
    }

    listenOnPort(port)
  })
}
