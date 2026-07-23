import { resolve } from "path"
import { existsSync } from "fs"
import { execFileSync, spawn } from "child_process"
import { registerWithRunningServer, startServer, stopRunningServer } from "./server.js"

const args = process.argv.slice(2)

function printUsage() {
  console.log("Usage: redline <path-to-markdown-file> | serve | stop")
}

async function waitForRunningServer(filePath: string): Promise<string> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const url = await registerWithRunningServer(filePath)
    if (url) return url
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  throw new Error("Redline server did not start within 5 seconds")
}

function startBackgroundServer() {
  const entrypoint = process.argv[1]
  if (!entrypoint) throw new Error("Could not determine Redline CLI entrypoint")

  const child = spawn(process.execPath, [entrypoint, "serve"], {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
}

if (args[0] === "serve") {
  if (args.length !== 1) {
    printUsage()
    process.exit(1)
  }
  const runningServer = await startServer(4700)
  const stopServer = () => runningServer.close()
  process.on("SIGINT", stopServer)
  process.on("SIGTERM", stopServer)
} else if (args[0] === "stop") {
  if (args.length !== 1) {
    printUsage()
    process.exit(1)
  }
  const stopped = await stopRunningServer()
  console.log(stopped ? "Redline server stopped." : "No running Redline server found.")
} else if (args.length === 0 || args[0] === "--help") {
  printUsage()
  process.exit(0)
}

if (args[0] !== "serve" && args[0] !== "stop") {
  const filePath = resolve(args[0]!)

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  if (!filePath.endsWith(".md")) {
    console.error(`Not a markdown file: ${filePath}`)
    process.exit(1)
  }

  let url = await registerWithRunningServer(filePath)
  if (!url) {
    startBackgroundServer()
    try {
      url = await waitForRunningServer(filePath)
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Could not start Redline server")
      process.exit(1)
    }
  }

  console.log(`\n  redline`)
  console.log(`  Serving ${args[0]} at ${url}\n`)

  // Open browser (macOS)
  try {
    execFileSync("open", [url])
  } catch {
    console.log(`  Open ${url} in your browser`)
  }
}
