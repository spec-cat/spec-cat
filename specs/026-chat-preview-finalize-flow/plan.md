# Implementation Plan: Chat Preview & Finalize Flow

**Branch**: `026-chat-preview-finalize-flow` | **Date**: 2026-02-16 | **Spec**: `specs/026-chat-preview-finalize-flow/spec.md`

## Summary

Extract preview/finalize workflows from lifecycle/conflict concerns to run in parallel safely.

## Scope Guardrails

### Owned Files

- `server/api/chat/preview*.ts`
- `server/api/chat/finalize.post.ts`
- `server/api/chat/rebase.post.ts`
- `components/chat/ChatPanel.vue`
- `stores/chat.ts` (preview/finalize section)

### Do Not Edit

- `server/api/chat/worktree*.ts`
- `server/api/rebase/*`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Preview/unpreview API + store flow |
| FR-002 | Preview sync flow across API + store caller + stream-completion caller, including explicit handling of `success: false` responses |
| FR-003 | Finalize workflow |
| FR-004 | Rebase transition handling |
| FR-005 | Cascade automation finalized check in FeaturesPanel + error messaging |
