# Tasks: Human-Readable Tool Rendering in Chat

**Input**: `specs/020-chat-tool-readable-rendering/spec.md`, `specs/020-chat-tool-readable-rendering/plan.md`

## Phase 1: Implementation

- [x] T001 [FR-001] Add tool-name normalization and human-readable header summary generation in `components/chat/ChatToolBlock.vue`.
- [x] T002 [FR-002] Add readable `Read` detail rows (`File`, `Range`) in expanded panel in `components/chat/ChatToolBlock.vue`.
- [x] T003 [FR-003] Add `Write` new-content preview section with truncation in `components/chat/ChatToolBlock.vue`.
- [x] T004 [FR-004] Add `Edit/MultiEdit` before/after preview panels in `components/chat/ChatToolBlock.vue`.
- [x] T005 [FR-005] Add shared preview clipping utility with explicit `Truncated preview` hint in `components/chat/ChatToolBlock.vue`.
- [x] T006 [FR-006] Replace always-visible raw JSON with collapsible `Raw input JSON` section in `components/chat/ChatToolBlock.vue`.
- [x] T007 [FR-007] Preserve fallback behavior for non-target tools and existing result rendering in `components/chat/ChatToolBlock.vue`.

## Phase 2: Validation

- [ ] T008 [FR-001] Manual validation with `Read` tool event.
- [ ] T009 [FR-003] Manual validation with `Write` tool event.
- [ ] T010 [FR-004] Manual validation with `Edit/MultiEdit` tool event.
- [ ] T011 [FR-007] Manual regression check for non-target tools (`Bash`, `Grep`).
