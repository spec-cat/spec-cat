# Chat Content Architecture

## Overview

채팅창에 표시되는 콘텐츠의 종류와 렌더링 구조, 그리고 provider 추상화 경계를 정리한 문서.

---

## 1. Message Level

채팅은 `ChatMessage` 단위로 구성된다.

| 구분 | role | 설명 |
|------|------|------|
| 유저 메시지 | `user` | 사용자 입력 텍스트 + 이미지 첨부 |
| 어시스턴트 메시지 | `assistant` | AI 응답 (Content Block 배열로 구성) |

### Message Status (어시스턴트 전용)

| 상태 | UI 표시 |
|------|---------|
| `streaming` | 노란 "typing..." + 커서 애니메이션 |
| `complete` | (없음) |
| `stopped` | "(stopped)" |
| `error` | 빨간 테두리 + "(error)" |

---

## 2. Content Block Types

어시스턴트 메시지의 `contentBlocks: ContentBlock[]`로 구성된다.

```
ContentBlockType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'result_summary' | 'session_init'
```

| 블록 타입 | 컴포넌트 | 설명 |
|-----------|----------|------|
| `text` | `ChatTextBlock` | 마크다운 렌더링 텍스트 |
| `thinking` | `ChatThinkingBlock` | 접이식 사고 과정 (라인/글자 수 표시) |
| `tool_use` | `ChatToolBlock` | 도구 호출 (이름, 상태, 인풋 요약) |
| `tool_result` | (ChatToolBlock 내부) | 도구 결과 (tool_use에 페어링) |
| `result_summary` | `ChatResultSummary` | 턴 종료 요약 (시간, 비용, 토큰) |
| `session_init` | `ChatSessionInit` | 세션 초기화 (모델, 도구 수, 권한 모드) |

### 렌더링 트리

```
ChatMessage
├── [user] 텍스트 (마크다운) + 이미지 첨부 (썸네일 격자)
└── [assistant] contentBlocks[]
    ├── session_init   → 모델/도구/권한 모드 한 줄 헤더
    ├── thinking       → 접이식 사고 과정
    ├── text           → 마크다운 텍스트
    ├── tool_use       → 도구 호출 박스
    │   └── tool_result   → 실행 결과 (페어링)
    └── result_summary → 비용/시간/토큰 요약 푸터
```

### 렌더링 규칙

- `tool_result`는 독립 렌더링하지 않고, `tool_use`의 `toolUseId`로 페어링하여 `ChatToolBlock` 내부에 표시.
- 연속된 같은 타입 블록(`text`+`text`, `thinking`+`thinking`)은 병합하여 렌더링.
- contentBlocks가 없으면 `content` 필드를 flat 마크다운으로 폴백 렌더링 (레거시 호환).

---

## 3. Tool Block 세부 렌더링

도구 종류에 따라 `ChatToolBlock`이 다르게 표시한다.

| 도구 분류 | 인식 기준 | 특수 표시 |
|-----------|-----------|-----------|
| Read | `name === 'read'` | 파일 경로 + 범위 (offset/limit) |
| Write | `name === 'write'` | 파일 경로 + 새 콘텐츠 프리뷰 |
| Edit | `name === 'edit' \| 'multiedit'` | 파일 경로 + Before/After 비교 |
| Command | `bash, exec, execcommand, runcommand` | `$ command` 형태 |
| AskUserQuestion | `requestuserinput \| askuserquestion` | 질문/선택지 구조화 표시 |
| 기타 | 위에 해당하지 않음 | `inputSummary` 텍스트 |

### 도구 상태

| 상태 | 아이콘 | 토큰 | 색상 |
|------|--------|------|------|
| `running` | 스피너 | `[RUN]` | 노란색 |
| `pending` | 시계 | `[WAIT]` | 회색 |
| `complete` | 체크 | `[OK]` | 초록 |
| `error` | 느낌표 | `[ERR]` | 빨강 |

### 도구 결과 표시

- 일반 텍스트: 6줄 미리보기 + 접이식
- Diff 감지 시: 색상 하이라이팅 (`+` 초록, `-` 빨강, `@@` 시안) + added/removed 통계
- 에러: 빨간 배경

---

## 4. Provider Abstraction

### 추상화 경계

```
[Claude API]  [Gemini API]  [Codex API]
     │              │             │
     ▼              ▼             ▼
 toCanonicalEvents()  ← provider별 변환 (유일한 커플링 지점)
     │              │             │
     └──────────────┴─────────────┘
                    │
                    ▼
           UIStreamEvent (canonical)
                    │
                    ▼
            jobQueue / WebSocket
                    │
                    ▼
           useChatStream.ts (composable)
                    │
                    ▼
         ContentBlock → ChatMessage → UI 컴포넌트
```

### 레이어별 Provider 의존성

| 레이어 | Provider-agnostic | 파일 |
|--------|-------------------|------|
| 타입 정의 | Yes | `types/chat.ts` |
| Provider 인터페이스 | Yes | `server/utils/aiProvider.ts` |
| 변환 로직 | **No** (의도적 격리) | `server/utils/uiAdapter.ts`, `*Provider.ts` |
| 이벤트 라우팅 | Yes | `server/utils/jobQueue.ts`, `server/routes/_ws.ts` |
| 클라이언트 스트림 | Yes | `composables/useChatStream.ts` |
| UI 컴포넌트 | Yes | `components/chat/Chat*.vue` |

### Provider 커플링 상세 (변환 레이어 내부)

각 provider의 `toCanonicalEvents()` 구현에만 존재:

- **Claude**: `stream_event.event` 구조, `content_block_start/delta/stop`, `server_tool_use` → `tool_use` 정규화, `cache_read_input_tokens`
- **Gemini**: `message` 객체 + `delta: true`, 세션 상태 자체 추적 (`startedSessions` Set), cache 토큰 미지원 (0 반환)
- **Codex**: canonical 포맷 직접 지원 또는 Claude 포맷 위임

### 결론

Content Block 체계는 provider-agnostic. Adapter Pattern으로 변환 로직이 완전 격리되어 있어 새 provider 추가 시 `toCanonicalEvents()` 하나만 구현하면 UI 변경 없이 동작.

---

## 5. 관련 파일

| 파일 | 역할 |
|------|------|
| `types/chat.ts` | ContentBlock, UIStreamEvent 타입 정의 |
| `components/chat/ChatMessage.vue` | 메시지 렌더링 (블록 분배) |
| `components/chat/ChatContentBlock.vue` | 블록 타입별 컴포넌트 라우팅 |
| `components/chat/ChatTextBlock.vue` | 텍스트 블록 |
| `components/chat/ChatThinkingBlock.vue` | 사고 블록 |
| `components/chat/ChatToolBlock.vue` | 도구 호출/결과 블록 |
| `components/chat/ChatResultSummary.vue` | 결과 요약 블록 |
| `components/chat/ChatSessionInit.vue` | 세션 초기화 블록 |
| `utils/contentBlocks.ts` | 블록에서 텍스트 추출 유틸 |
| `composables/useChatStream.ts` | WebSocket 스트림 → ContentBlock 조립 |
| `server/utils/uiAdapter.ts` | Provider → canonical 이벤트 변환 |
| `server/utils/aiProvider.ts` | Provider 인터페이스 정의 |
