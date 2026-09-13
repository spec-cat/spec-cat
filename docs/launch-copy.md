# Sidings launch copy

Replace every bracketed placeholder and verify every link before posting.

## Hacker News

**Title:** Show HN: Sidings – A Git-native workbench for coding agents on worktrees

Hey HN,

I run Claude Code, OpenAI Codex, and Antigravity concurrently, and raw tmux eventually exposed three recurring problems.

First, large prompts could stall. Sending a roughly 12 KB diff with `send-keys -l` sometimes left only part of the prompt in the pane. Sidings instead writes the prompt through `tmux load-buffer`, uses `paste-buffer -p` for bracketed paste, waits for the CLI to settle, and sends Enter as a separate frame.

Second, agents sharing a working tree overwrite or distract one another. Sidings creates a managed Git worktree and branch for each conversation, with preview, rebase, squash, finalization, and cleanup operations in the UI.

Third, tmux alone does not answer “which agent needs me?” Sidings combines provider signals, captured screen text, and a quiet window to distinguish active, idle, and input-waiting conversations.

It is a self-hosted local web workbench built with Nuxt, xterm.js, tmux, and node-pty. There is also a browserless job API for automation and spec-driven batches.

Code: https://github.com/spec-cat/sidings

I would especially value feedback on the worktree lifecycle and false positives in turn detection.

## X thread

**Post 1**

I built Sidings: a Git-native workbench for running multiple coding agents without turning your main working tree into a traffic jam. Each conversation gets an isolated worktree + persistent tmux session. [DEMO VIDEO]

**Post 2**

The bug that pushed me over the edge: a large diff sent through `tmux send-keys -l` could stop partway through. Sidings uses `load-buffer` + bracketed `paste-buffer -p`, then sends Enter after a settle delay.

**Post 3**

The dashboard also answers the question raw tmux cannot: which agent is working, finished, or waiting for input? It combines provider signals, screen text, and quiet-time detection.

**Post 4**

Open source: https://github.com/spec-cat/sidings

Try it with `npx sidings@latest` after the npm release. Feedback welcome, especially from people running several agents at once.

## Reddit

**Title:** I built an open-source tool to run Claude Code and Codex in isolated Git worktrees without tmux babysitting

I regularly run more than one coding agent, but sharing a checkout led to branch pollution and jumping between tmux panes made it easy to miss an agent waiting for input.

Sidings is a local web workbench that gives every conversation its own Git worktree, branch, and persistent tmux session. It supports Claude Code, OpenAI Codex, and Antigravity, shows repository history and diffs beside the terminal, and can preview, rebase, squash, archive, restore, or remove conversation work.

One detail I spent disproportionate time on was reliable large-prompt delivery. Instead of `send-keys -l`, Sidings loads prompts into a tmux buffer, pastes them in bracketed-paste mode, waits for the terminal to settle, and sends Enter separately. Turn state similarly uses provider signals plus screen text and a quiet window rather than one brittle prompt match.

Code and quickstart: https://github.com/spec-cat/sidings

I am interested in feedback about macOS/Linux behavior, worktree cleanup, and additional local agent CLIs people want supported.

## First-response notes

- **Why tmux?** It provides durable local sessions and attachment/recovery while Sidings adds lifecycle and visibility.
- **Why worktrees?** Separate directories and branches prevent concurrent agents from editing the same checkout while preserving normal Git operations.
- **Is it cloud-hosted?** No. It binds to localhost by default and runs installed CLIs with the local user's permissions.
- **Windows?** Treat WSL as the initial supported path; do not claim native Windows support until node-pty, tmux, and packaging are verified there.
