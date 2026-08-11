import fs from "fs"
import path from "path"
import type { Plugin } from "vite"
import {
  computeRevFromStats,
  getDisplayPath,
  getRootLabel,
  parseFilePutBody,
  resolveExcalidrawAssetPath,
} from "../shared/api-handlers.js"

function fileMetaFromStats(st: fs.Stats) {
  const rev = computeRevFromStats(st)
  return { mtimeMs: st.mtimeMs, size: st.size, rev }
}

/**
 * In development, serves GET/PUT /api/file and GET /api/file/meta from disk when REVIEW_MD_FILE is set
 * (path relative to cwd or absolute). Lets `pnpm dev` work without the CLI.
 */
export function reviewMdDevApi(fileFromEnv: string): Plugin {
  const resolved = path.isAbsolute(fileFromEnv)
    ? path.normalize(fileFromEnv)
    : path.resolve(process.cwd(), fileFromEnv)

  return {
    name: "review-md-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? ""
        if (
          pathname !== "/api/file" &&
          pathname !== "/api/file/meta" &&
          pathname !== "/api/file/asset"
        ) {
          next()
          return
        }

        res.setHeader("Access-Control-Allow-Origin", "*")

        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
          res.setHeader("Access-Control-Allow-Headers", "Content-Type")
          res.statusCode = 204
          res.end()
          return
        }

        if (pathname === "/api/file/meta" && req.method === "GET") {
          try {
            if (!fs.existsSync(resolved)) {
              res.setHeader("Content-Type", "application/json")
              res.statusCode = 404
              res.end(
                JSON.stringify({
                  error: `File not found: ${resolved}. Create it or fix REVIEW_MD_FILE.`,
                }),
              )
              return
            }
            const st = fs.statSync(resolved)
            res.setHeader("Content-Type", "application/json")
            res.statusCode = 200
            res.end(JSON.stringify(fileMetaFromStats(st)))
          } catch (e) {
            res.setHeader("Content-Type", "application/json")
            res.statusCode = 500
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : "Failed to stat file",
              }),
            )
          }
          return
        }

        if (pathname === "/api/file/asset" && req.method === "GET") {
          const requestUrl = new URL(req.url ?? "", "http://localhost")
          const assetPath = resolveExcalidrawAssetPath(
            resolved,
            requestUrl.searchParams.get("path") ?? "",
          )
          if (!assetPath) {
            res.statusCode = 403
            res.end("Forbidden")
            return
          }
          try {
            const st = fs.statSync(assetPath)
            if (!st.isFile()) throw new Error("Asset is not a file")
            res.setHeader("Content-Type", "application/json")
            res.statusCode = 200
            res.end(fs.readFileSync(assetPath, "utf-8"))
          } catch {
            res.statusCode = 404
            res.end("Excalidraw file not found")
          }
          return
        }

        if (req.method === "GET") {
          try {
            if (!fs.existsSync(resolved)) {
              res.setHeader("Content-Type", "application/json")
              res.statusCode = 404
              res.end(
                JSON.stringify({
                  error: `File not found: ${resolved}. Create it or fix REVIEW_MD_FILE.`,
                }),
              )
              return
            }
            const content = fs.readFileSync(resolved, "utf-8")
            const filename = path.basename(resolved)
            const displayPath = getDisplayPath(resolved)
            const root = getRootLabel(resolved)
            res.setHeader("Content-Type", "application/json")
            res.statusCode = 200
            res.end(
              JSON.stringify({
                content,
                filename,
                path: displayPath,
                root,
              }),
            )
          } catch (e) {
            res.setHeader("Content-Type", "application/json")
            res.statusCode = 500
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : "Failed to read file",
              }),
            )
          }
          return
        }

        if (req.method === "PUT") {
          let body = ""
          req.on("data", (chunk: Buffer | string) => {
            body += chunk
          })
          req.on("end", () => {
            const parsed = parseFilePutBody(body)
            if (!parsed.ok) {
              res.setHeader("Content-Type", "application/json")
              res.statusCode = 400
              res.end(JSON.stringify({ error: parsed.error }))
              return
            }
            try {
              fs.writeFileSync(resolved, parsed.content, "utf-8")
              res.setHeader("Content-Type", "application/json")
              res.statusCode = 200
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.setHeader("Content-Type", "application/json")
              res.statusCode = 500
              res.end(
                JSON.stringify({
                  error: e instanceof Error ? e.message : "Failed to write file",
                }),
              )
            }
          })
          return
        }

        res.statusCode = 405
        res.end()
      })
    },
  }
}
