# 007 스펙 재정렬 제안

## 개요
007 스펙을 현재 multi-provider 아키텍처에 맞게 재정렬

## 제안된 변경사항

### 1. 스펙 이름 변경
- `007-claude-code-chat` → `007-ai-provider-chat`

### 2. 스펙 구조 업데이트

#### spec.md 변경사항
- Feature name: "Claude Code Chat" → "AI Provider Chat"
- FR 추가:
  - **FR-020**: System MUST support multiple AI providers (claude, codex, gemini)
  - **FR-021**: System MUST allow users to select provider and model from available options
  - **FR-022**: System MUST handle provider-specific capabilities gracefully
  - **FR-023**: System MUST fallback to default provider when selected provider is unavailable

#### plan.md 변경사항
- Title: "Claude Code Chat" → "AI Provider Chat"
- Technical Context 업데이트:
  - Dependencies: `@anthropic-ai/claude-code` → multiple provider SDKs
  - AIProvider 인터페이스 기반 아키텍처 강조
- 새로운 섹션 추가: "Provider Integration"

#### 새로운 문서 추가
- `provider-guide.md`: 각 provider별 특성 및 설정 가이드
- `provider-comparison.md`: provider별 기능 비교표

### 3. 코드 구조는 유지
현재 구현이 이미 provider-agnostic하므로:
- AIProvider 인터페이스 기반
- AIProviderRegistry를 통한 provider 관리
- AIProviderSelection을 통한 provider/model 선택

### 4. Provider별 특성 문서화

#### Claude Provider
- Models: sonnet, opus, haiku
- Capabilities: streaming, permissions, resume
- CLI: @anthropic-ai/claude-code

#### Codex Provider
- Models: base, turbo, advanced
- Capabilities: streaming, code-focused
- CLI: codex CLI

#### Gemini Provider (예정)
- Models: pro, ultra
- Capabilities: TBD
- SDK: @google/generative-ai

## 마이그레이션 계획

1. 스펙 파일들의 이름과 내용 업데이트
2. Provider 중립적 용어로 문서 수정
3. Provider 선택 UI 관련 FR 추가
4. 각 provider별 가이드 문서 작성

## 영향 범위
- 스펙 문서만 변경 (코드는 이미 provider-agnostic)
- 관련 스펙들 (009, 010, 011, 012)의 참조 업데이트 필요