# Redline

<img width="3984" alt="image" src="https://github.com/user-attachments/assets/81e10f61-3383-42c0-93da-6ae91e599ef7" />

Review mode for LLM-generated plans.

LLMs write plans and specs as markdown. Reviewing them in chat is imprecise — you end up quoting passages by hand, losing context, or just saying "looks good" when it doesn't. Redline gives you a Google Docs-style commenting experience on any `.md` file so you can leave anchored, passage-level feedback. When you're done, copy all your comments in one click and paste them back into the LLM.

**The loop:** LLM writes a plan → you review it in Redline → your feedback goes back to the LLM.

Inspired by [Agentation](https://agentation.dev).

## Quickstart

```bash
npx @btn0s/redline ./plan.md
```

Redline starts one local server in the background on port `4700` (falling back to the next available port if needed), then opens the review UI in your browser. Subsequent `redline <file>.md` commands reuse that server and open each document in its own browser tab, so no terminal needs to remain open. Stop the local server when you are done with `redline stop`.

## Install

```bash
npm i -g @btn0s/redline
```

Or run directly with `npx` / `pnpm dlx` — no install required.

## How it works

1. **Select text** in the rendered markdown to start a comment thread
2. **Leave comments** anchored to the exact passage — replies are threaded
3. **Copy all** — one click copies every comment as structured text, ready to paste back into your LLM conversation

Comments persist to disk alongside the markdown so you can close and come back.

## Agent skill

Redline ships an agent skill so AI coding assistants (Cursor, Claude Code, Codex, etc.) can open the review UI on your behalf when a plan or spec needs your sign-off.

```bash
npx skills add btn0s/redline --skill redline
```

The agent writes a plan, launches Redline, and waits for your feedback — no copy-pasting commands.

## Troubleshooting

### `npx` exits with "A complete log of this run can be found in…"

When you run `redline` via `npx github:shrivatsas/redline`, `npx` clones the
repo and runs `npm install --force --include dev` to build `dist/` from source.
That install can fail mid-fetch on heavy transitive packages (playwright,
vitest, `@vitejs/devtools-*`) that are not even in redline's `package.json`.
The failed install leaves the npx cache (`~/.npm/_npx/<hash>/`) in a corrupted
half-state — the `@shrivatsas/redline` directory ends up empty with a dangling
`.bin/redline` symlink. Every retry then exits with only the recursive message
```
A complete log of this run can be found in: <the same log file>
```
because the real error (from the inner `npm install`) is swallowed.

**Fix:** clear the corrupted cache and kill any orphaned `redline serve` process
holding port 4700:

```bash
rm -rf ~/.npm/_npx/<hash>/          # the dir containing @shrivatsas/redline
lsof -iTCP:4700 -sTCP:LISTEN | grep node   # find an orphaned server
kill <pid>
```

### Durable install with auto-update

To avoid the `npx` rebuild-on-every-run fragility entirely, install redline to a
permanent path and build with `pnpm` (the project's designated package manager,
declared via `"packageManager"` in `package.json`). `pnpm` resolves the
dependency tree correctly without the `npm --force` transitive junk that times
out. A shell function can wrap this so updates only happen when a new commit is
pushed:

```zsh
# ~/.zshrc
unalias redline 2>/dev/null
redline() {
  local dir="$HOME/.local/redline"
  local commit_file="$dir/.installed-commit"
  if [[ ! -f "$dir/dist/cli/index.js" ]]; then
    echo "redline: installing to $dir ..." >&2
    git clone --depth 1 https://github.com/shrivatsas/redline.git "$dir"
    (cd "$dir" && pnpm install --no-frozen-lockfile)
    git -C "$dir" rev-parse HEAD > "$commit_file"
  else
    local remote=$(git ls-remote https://github.com/shrivatsas/redline.git HEAD 2>/dev/null | cut -f1)
    local installed=$(cat "$commit_file" 2>/dev/null)
    if [[ -n "$remote" && "$remote" != "$installed" ]]; then
      echo "redline: updating to $remote ..." >&2
      git -C "$dir" pull --ff-only
      (cd "$dir" && pnpm install --no-frozen-lockfile)
      git -C "$dir" rev-parse HEAD > "$commit_file"
    fi
  fi
  node "$dir/dist/cli/index.js" "$@"
}
```

Most runs are instant — the function only rebuilds when a new commit exists on
the default branch (one cheap `git ls-remote` check per run).

## Development

```bash
pnpm install
pnpm dev
```

## License

MIT
