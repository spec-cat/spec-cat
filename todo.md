# Server-Driven Chat Architecture TODO

## Goal
서버에서 스케줄러/트리거로 AI 작업을 독립 실행하고, 클라이언트는 이벤트를 구독하여 열람/interaction하는 구조로 전환.

```
Before:  Client ──── drives ────→ Server (passive)
After:   Client ←── subscribes ── EventBus ←── Server (active)
                                     ↑
                                JobQueue + Scheduler
```

---

## Phase 1: EventBus + Job Buffer 도입

### 1-1. EventBus 생성 (`server/utils/eventBus.ts`)
- Conversation별 이벤트 발행/구독 싱글턴
- `emit(conversationId, event: UIStreamEvent)` — 이벤트 발행
- `subscribe(conversationId, callback)` / `unsubscribe()` — 구독 관리
- 다수 subscriber 지원 (같은 conversation을 여러 클라이언트가 볼 수 있음)

### 1-2. JobQueue 생성 (`server/utils/jobQueue.ts`)
- Job 데이터 모델:
  ```
  ChatJob {
    id, conversationId, message,
    source: 'user' | 'scheduler' | 'cascade',
    status: 'queued' | 'running' | 'waiting_permission' | 'done' | 'error',
    events: UIStreamEvent[],          // 이벤트 버퍼
    eventCursor: Map<string, number>  // per-subscriber 커서
  }
  ```
- `submit(job)` — Provider 실행 + EventBus로 이벤트 발행
- `getJob(id)` / `listJobs(conversationId)` — 상태 조회
- 이벤트 버퍼: 클라이언트 미접속 시에도 누적, 접속 시 replay

### 1-3. `_ws.ts` 리팩터링
- 현재: `handleChatMessage()` → `runProvider()` → `peer.send()` 직접 전송
- 변경: `handleChatMessage()` → `jobQueue.submit()` → EventBus 구독 → `peer.send()`
- WS 접속 시 해당 conversation의 미수신 이벤트 replay 지원

### 1-4. `aiProvider.ts` 출력 대상 변경
- 현재: 콜백(`onProviderJson`) → peer 직접 전송
- 변경: 콜백 → EventBus.emit()으로 변경
- Provider 라이프사이클을 WebSocket peer에서 분리

---

## Phase 2: 클라이언트 구독 모델 전환

### 2-1. `useChatStream.ts` 수정
- WS 접속 시 conversation의 미수신 이벤트 replay 요청 추가
- 메시지 타입에 `replay_events` 추가 (버퍼된 이벤트 수신)
- 기존 실시간 이벤트 처리 로직은 그대로 유지

### 2-2. `stores/chat.ts` 확장
- Conversation에 `source: 'user' | 'scheduler'` 필드 추가
- 서버 주도 conversation 표시 구분 (badge 등)
- 서버에서 새 conversation 생성 알림 수신 처리

### 2-3. Job 상태 API (`server/api/jobs/*.ts`)
- `GET /api/jobs` — 활성 Job 목록
- `GET /api/jobs/:id` — Job 상태 및 이벤트 조회
- `POST /api/jobs/:id/cancel` — Job 취소

---

## Phase 3: 스케줄러 도입

### 3-1. Scheduler 생성 (`server/utils/scheduler.ts`)
- 크론/트리거 기반 작업 정의
- 실행 시 conversation 자동 생성 + jobQueue.submit()
- worktree 자동 할당

### 3-2. Permission 모델 확장
- 스케줄러 작업: 기본 `bypass` 모드 (자동 승인)
- 선택적 `ask` 모드: 이벤트 버퍼에 permission_request 저장 → 클라이언트 접속 시 표시
- 타임아웃 설정: N분 내 응답 없으면 자동 deny/approve 정책

### 3-3. 스케줄러 설정 UI
- 스케줄 정의 (크론식 또는 이벤트 트리거)
- 실행 이력 조회
- 실행 결과 conversation으로 바로 이동

---

## Phase 4: 알림 + 동기화

### 4-1. 서버 → 클라이언트 푸시 알림
- WS를 통한 새 conversation/job 알림
- 클라이언트 conversation 목록 자동 갱신

### 4-2. 다중 클라이언트 동기화
- 같은 conversation을 여러 탭/클라이언트에서 동시 구독
- EventBus의 다중 subscriber로 자연스럽게 지원

---

## 수정 대상 파일 요약

| 구분 | 파일 | 변경 내용 |
|------|------|----------|
| 신규 | `server/utils/eventBus.ts` | 이벤트 브로드캐스트 싱글턴 |
| 신규 | `server/utils/jobQueue.ts` | Job 큐 + 실행 관리 |
| 신규 | `server/utils/scheduler.ts` | 크론/트리거 스케줄러 |
| 신규 | `server/api/jobs/*.ts` | Job CRUD API |
| 수정 | `server/routes/_ws.ts` | runProvider 직접호출 → jobQueue.submit + EventBus 구독 |
| 수정 | `server/utils/aiProvider.ts` | 출력 대상을 EventBus로 변경 |
| 수정 | `composables/useChatStream.ts` | 이벤트 replay 요청 추가 |
| 수정 | `stores/chat.ts` | source 필드 + 서버 주도 conversation 지원 |
| 수정 | `types/chat.ts` | Job, source 관련 타입 추가 |

## 실행 순서
1. Phase 1 (EventBus + JobQueue) — 핵심 인프라, 기존 동작 유지하며 간접화
2. Phase 2 (클라이언트 구독 모델) — replay + 서버 주도 conversation 지원
3. Phase 3 (스케줄러) — 서버 독립 실행 기능
4. Phase 4 (알림/동기화) — UX 완성
