"""
spec-cat WebSocket Client for openclaw integration.

Usage:
    # Send a coding task and wait for completion
    python speccat_client.py "Implement the login feature"

    # Send with options
    python speccat_client.py "Fix the bug in auth.ts" --cwd /path/to/project --provider claude

    # Subscribe to an existing conversation
    python speccat_client.py --subscribe conv-abc123

    # Interactive mode: send multiple messages
    python speccat_client.py --interactive

Protocol: connects to spec-cat's /_ws endpoint (same as web dashboard).
"""

import asyncio
import json
import sys
import uuid
import argparse
import signal
from typing import Optional, Callable

try:
    import websockets
except ImportError:
    print("pip install websockets")
    sys.exit(1)


DEFAULT_URL = "ws://localhost:3000/_ws"


def make_id() -> str:
    return uuid.uuid4().hex[:12]


class SpecCatClient:
    """WebSocket client that speaks spec-cat's native protocol."""

    def __init__(self, url: str = DEFAULT_URL, on_event: Optional[Callable] = None):
        self.url = url
        self.ws = None
        self.on_event = on_event or self._default_handler
        self._conversation_id: Optional[str] = None
        self._done_event = asyncio.Event()
        self._connected = asyncio.Event()

    @property
    def conversation_id(self) -> Optional[str]:
        return self._conversation_id

    async def connect(self):
        self.ws = await websockets.connect(self.url)
        self._connected.set()

    async def close(self):
        if self.ws:
            await self.ws.close()

    # ── Send primitives ──

    async def chat(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        permission_mode: str = "auto",
        cwd: Optional[str] = None,
        feature_id: Optional[str] = None,
        provider_id: Optional[str] = None,
        provider_model_key: Optional[str] = None,
    ) -> str:
        """Send a chat message. Returns the conversationId."""
        cid = conversation_id or f"conv-{make_id()}"
        self._conversation_id = cid
        self._done_event.clear()

        payload = {
            "type": "chat",
            "message": message,
            "conversationId": cid,
            "requestId": f"req-{make_id()}",
            "permissionMode": permission_mode,
        }
        if cwd:
            payload["cwd"] = cwd
        if feature_id:
            payload["featureId"] = feature_id
        if provider_id:
            payload["providerId"] = provider_id
        if provider_model_key:
            payload["providerModelKey"] = provider_model_key

        await self.ws.send(json.dumps(payload))
        return cid

    async def subscribe(self, conversation_id: str, cursor: int = 0):
        """Subscribe to an existing conversation's event stream."""
        self._conversation_id = conversation_id
        self._done_event.clear()
        await self.ws.send(json.dumps({
            "type": "subscribe",
            "conversationId": conversation_id,
            "cursor": cursor,
        }))

    async def abort(self):
        """Abort the current job."""
        await self.ws.send(json.dumps({"type": "abort"}))

    async def respond_permission(self, allow: bool):
        """Respond to a permission request."""
        await self.ws.send(json.dumps({
            "type": "permission_response",
            "allow": allow,
        }))

    async def ping(self):
        await self.ws.send(json.dumps({"type": "ping"}))

    # ── Receive loop ──

    async def listen(self):
        """Listen for events until 'done' or disconnect."""
        try:
            async for raw in self.ws:
                event = json.loads(raw)
                self.on_event(event)

                if event.get("type") == "done":
                    self._done_event.set()
        except websockets.ConnectionClosed:
            pass

    async def wait_done(self):
        """Block until the current job emits 'done'."""
        await self._done_event.wait()

    # ── Convenience: send and wait ──

    async def run(self, message: str, **kwargs) -> str:
        """Connect, send a message, listen until done, close. Returns conversationId."""
        await self.connect()
        cid = await self.chat(message, **kwargs)
        listener = asyncio.create_task(self.listen())
        await self.wait_done()
        await self.close()
        listener.cancel()
        return cid

    # ── Default event handler ──

    @staticmethod
    def _default_handler(event: dict):
        etype = event.get("type", "")

        if etype == "pong":
            return

        # Global notifications
        if etype == "notification":
            ne = event.get("notificationEvent", "")
            cid = event.get("conversationId", "")
            print(f"\n[notification] {ne} conversation={cid}")
            return

        # Subscription confirmations
        if etype in ("subscribed", "replay_start", "replay_end"):
            print(f"[{etype}] {json.dumps(event, ensure_ascii=False)}")
            return

        # Streaming content
        if etype == "session_init":
            model = event.get("model", "?")
            mode = event.get("permissionMode", "?")
            print(f"\n[session] model={model} mode={mode}")

        elif etype == "block_start":
            bt = event.get("blockType", "")
            name = event.get("name", "")
            if bt == "tool_use":
                print(f"\n[tool] {name}", end="", flush=True)
            elif bt == "text":
                print("\n", end="", flush=True)
            elif bt == "thinking":
                print("\n[thinking] ", end="", flush=True)

        elif etype == "block_delta":
            text = event.get("text") or event.get("thinking") or ""
            if text:
                print(text, end="", flush=True)

        elif etype == "block_end":
            pass

        elif etype == "tool_result":
            is_err = event.get("isError", False)
            content = event.get("content", "")[:200]
            tag = "error" if is_err else "result"
            print(f"\n  [{tag}] {content}")

        elif etype == "permission_request":
            tool = event.get("tool", "?")
            desc = event.get("description", "")
            print(f"\n[permission?] tool={tool} {desc}")

        elif etype == "turn_result":
            cost = event.get("totalCostUsd", 0)
            turns = event.get("numTurns", 0)
            sub = event.get("subtype", "")
            print(f"\n[turn_result] {sub} cost=${cost:.4f} turns={turns}")

        elif etype == "error":
            print(f"\n[ERROR] {event.get('error', '')}")

        elif etype == "done":
            print("\n[done]")

        else:
            # Unknown event — dump as-is
            print(f"\n[{etype}] {json.dumps(event, ensure_ascii=False)[:200]}")


# ── CLI ──

async def main():
    parser = argparse.ArgumentParser(description="spec-cat WS client for openclaw")
    parser.add_argument("message", nargs="?", help="Message to send")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"WebSocket URL (default: {DEFAULT_URL})")
    parser.add_argument("--cwd", help="Working directory for the task")
    parser.add_argument("--conversation-id", help="Existing conversation ID to continue")
    parser.add_argument("--feature-id", help="Feature ID (creates worktree)")
    parser.add_argument("--provider", default=None, help="Provider ID (claude, codex, gemini)")
    parser.add_argument("--model", default=None, help="Provider model key")
    parser.add_argument("--permission", default="auto", choices=["plan", "ask", "auto", "bypass"])
    parser.add_argument("--subscribe", metavar="CONV_ID", help="Subscribe to existing conversation (observe only)")
    parser.add_argument("--interactive", action="store_true", help="Interactive mode: send multiple messages")

    args = parser.parse_args()

    client = SpecCatClient(url=args.url)

    # Handle Ctrl+C gracefully
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(_shutdown(client)))

    await client.connect()
    listener = asyncio.create_task(client.listen())

    try:
        if args.subscribe:
            # Observe mode
            print(f"Subscribing to {args.subscribe}...")
            await client.subscribe(args.subscribe)
            await listener  # run until disconnect

        elif args.interactive:
            # Interactive mode
            cid = args.conversation_id
            print("spec-cat interactive mode. Type message and press Enter. Ctrl+C to quit.")
            while True:
                try:
                    msg = await asyncio.get_event_loop().run_in_executor(None, lambda: input("\n> "))
                except EOFError:
                    break
                if not msg.strip():
                    continue
                if msg.strip().lower() in ("/quit", "/exit"):
                    break
                if msg.strip() == "/abort":
                    await client.abort()
                    continue

                cid = await client.chat(
                    msg,
                    conversation_id=cid,
                    permission_mode=args.permission,
                    cwd=args.cwd,
                    feature_id=args.feature_id,
                    provider_id=args.provider,
                    provider_model_key=args.model,
                )
                print(f"[sent] conversation={cid}")
                await client.wait_done()

        elif args.message:
            # One-shot mode
            cid = await client.chat(
                args.message,
                conversation_id=args.conversation_id,
                permission_mode=args.permission,
                cwd=args.cwd,
                feature_id=args.feature_id,
                provider_id=args.provider,
                provider_model_key=args.model,
            )
            print(f"[sent] conversation={cid}")
            await client.wait_done()

        else:
            parser.print_help()

    finally:
        await client.close()
        listener.cancel()


async def _shutdown(client: SpecCatClient):
    print("\n[shutdown]")
    await client.close()
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
