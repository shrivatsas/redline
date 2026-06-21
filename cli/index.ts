import { resolve } from "path"
import { existsSync } from "fs"
import { execFileSync } from "child_process"
import { startServer } from "./server.js"

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

const startingPort = 4700
const url = await startServer(filePath, startingPort)

console.log(`\n  redline`)
console.log(`  Serving ${args[0]} at ${url}\n`)

// Open browser (macOS)
try {
  execFileSync("open", [url])
} catch {
  console.log(`  Open ${url} in your browser`)
}

// Keep alive until Ctrl+C
process.on("SIGINT", () => {
  console.log("\n  Goodbye.\n")
  process.exit(0)
})
