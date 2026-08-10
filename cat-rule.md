# 절대 지켜져야 하는 룰

- codex, claude모두 동일하게 작동해야함
- codex기본명령어: "codex --dangerously-bypass-approvals-and-sandbox"
- claude: "claude --dangerously-skip-permissions"
- UI 변경시 (리사이즈, 대화전환시) 맨 위로 스크롤했다가 다시 내려오는 일은 절대 없어야함 (화면 깜빡거림)
- 절대 화면 글씨들이 깨지지 않아야 함 (이상한 문자들이 좀 붙어나오는것은 제일 후순위로 어쩔수 없다면 알려줘)
- 어떤 상황에서도 (리사이즈, 새로고침, conversation 전환) chat패널에 꽉 찬 화면이 나와야함
- 새로고침시, conversation들을 전환시에도 마우스 휠로 대화 스크롤이 언제나 가능해야함
- idle, processing감지가 정확해야함 (1~2초 이내감지)
- 
