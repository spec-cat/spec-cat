# Implementation Plan: Chat Conflict Resolution

**Branch**: `027-chat-conflict-resolution` | **Date**: 2026-02-16 | **Spec**: `specs/027-chat-conflict-resolution/spec.md`

## Summary

Separate all conflict workflows into a dedicated stream with clear API/UI ownership.

## Scope Guardrails

### Owned Files

- `server/api/rebase/*`
- `components/chat/ConflictResolutionModal.vue`
- `components/chat/ConflictFileEditor.vue`
- `stores/chat.ts` (conflict section)

### Do Not Edit

- `server/api/chat/worktree*.ts`
- `server/api/chat/preview*.ts`
- `server/api/chat/finalize.post.ts`

## FR Coverage Matrix

| FR | Planned Coverage |
|----|------------------|
| FR-001 | Conflict listing APIs |
| FR-002 | Resolve/continue/abort APIs |
| FR-003 | Conflict editor interaction model |
| FR-004 | AI conflict assist contract |
