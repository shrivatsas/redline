import { resolve } from "path"
import { existsSync } from "fs"
import { execFileSync } from "child_process"
import { registerWithRunningServer, startServer } from "./server.js"

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === "--help") {
  console.log("Usage: redline <path-to-markdown-file>")
  process.exit(0)
}

const filePath = resolve(args[0]!)

if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

if (!filePath.endsWith(".md")) {
  console.error(`Not a markdown file: ${filePath}`)
  process.exit(1)
}

const existingUrl = await registerWithRunningServer(filePath)
const startedServer = existingUrl ? null : await startServer(filePath, 4700)
const url = existingUrl ?? startedServer!.url

console.log(`\n  redline`)
console.log(`  Serving ${args[0]} at ${url}${existingUrl ? " (existing server)" : ""}\n`)

// Open browser (macOS)
try {
  execFileSync("open", [url])
} catch {
  console.log(`  Open ${url} in your browser`)
}

// Only the process that started the server needs to remain alive.
if (startedServer) {
  const stopServer = () => {
    startedServer.close()
  }
  process.on("SIGINT", () => {
    stopServer()
    console.log("\n  Goodbye.\n")
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    stopServer()
    process.exit(0)
  })
  process.on("exit", stopServer)
}
