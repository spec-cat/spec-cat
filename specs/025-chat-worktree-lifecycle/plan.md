# Implementation Plan: Chat Worktree Lifecycle

**Branch**: `025-chat-worktree-lifecycle` | **Date**: 2026-02-16 | **Spec**: `specs/025-chat-worktree-lifecycle/spec.md`

## Summary

Separate lifecycle primitives from preview/finalize and conflict flows.

## Scope Guardrails

### Owned Files

- `server/api/chat/worktree*.ts`
- `server/utils/worktreeResolver.ts`
- `server/utils/ensureChatWorktree.ts`
- `stores/chat.ts` (lifecycle section)

### Do Not Edit

- `server/api/chat/preview*.ts`
- `server/api/chat/finalize.post.ts`
- `server/api/rebase/*`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Create lifecycle |
| FR-002 | Delete lifecycle |
| FR-003 | Commit lifecycle |
| FR-004 | Recovery lifecycle |
