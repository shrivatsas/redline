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

Redline starts a local server on port `4700` and falls back to the next available port if needed, then opens the review UI in your browser.

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

## Development

```bash
pnpm install
pnpm dev
```

## License

MIT
