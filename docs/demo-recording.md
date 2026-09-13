# Sidings hero demo recording runbook

Produce a 10–12 second, silent 16:9 recording at 1440×900 or 1920×1080. Export WebM as the primary asset and an optimized GIF fallback. Do not stage secrets, private repository names, or real conversation history.

## Staging

1. Use a disposable public demo repository with a clean `main` branch.
2. Prepare two short, deterministic tasks that visibly edit different files.
3. Create one Claude conversation and one Codex conversation so two managed worktree branches are visible.
4. Use a fresh browser profile, hide bookmarks and notifications, and zoom until the Git graph, conversation list, terminal, and diff remain legible.
5. Pre-run slow authentication or package-download steps; the recorded take must show product behavior, not setup.

## Shot list

| Time | Frame | Required proof |
| --- | --- | --- |
| 0–2s | Git graph and new conversations | Two branches split from `main`; provider labels are visible. |
| 2–6s | Side-by-side conversation activity | Claude and Codex stream output in isolated worktrees. |
| 6–9s | Conversation states | Activity changes from working to idle or waiting for input. |
| 9–12s | Git diff | Select a changed file and show a readable diff without leaving the dashboard. |

## Export and acceptance

- Save `assets/demo/sidings-hero.webm` and `assets/demo/sidings-hero.gif`.
- Keep the WebM under 4 MB and the GIF under 8 MB; target 12–15 fps for the GIF.
- Verify both assets loop cleanly, contain no cursor dead time, and remain readable at 800 px width.
- Replace the README placeholder with a linked WebM poster or the GIF fallback.
- Test the rendered README on GitHub desktop and mobile widths before publishing.
