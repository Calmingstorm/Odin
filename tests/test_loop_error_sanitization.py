"""Loop-manager error-text boundary (B2 of the 2026-08-14 sanitization).

The iteration-history deque is next-iteration model context AND the WebUI
loop detail; the stop/crash messages post to the channel. None of them may
carry raw exception text (provider errors can embed whole HTML pages).
"""
from __future__ import annotations

import asyncio

# ---------------------------------------------------------------------------
# Loop-manager boundary (B2): channel posts + iteration history
# ---------------------------------------------------------------------------

class _FakeChannel:
    def __init__(self):
        self.sent: list[str] = []

    async def send(self, text):
        self.sent.append(text)


class TestLoopManagerErrorTextSanitized:
    async def test_history_and_channel_posts_carry_no_markup(self, monkeypatch):
        """A provider exception whose text smuggles HTML must reach neither
        the iteration history (model context + WebUI loop detail) nor the
        channel stop message."""

        import src.tools.autonomous_loop as al

        monkeypatch.setattr(al, "MIN_INTERVAL_SECONDS", 0)
        mgr = al.LoopManager()
        channel = _FakeChannel()

        async def exploding_iteration(prompt, ch, prev_context, cancel_event):
            raise RuntimeError("<html><body>@everyone edge page</body></html>")

        loop_id = mgr.start_loop(
            goal="g",
            channel=channel,
            requester_id="u1",
            requester_name="user",
            iteration_callback=exploding_iteration,
            interval_seconds=0,
            max_iterations=al.MAX_CONSECUTIVE_ERRORS + 2,
        )
        assert not loop_id.startswith("Error")
        for _ in range(200):
            info = mgr._loops.get(loop_id)
            if info is not None and info.status == "error":
                break
            await asyncio.sleep(0.05)
        info = mgr._loops[loop_id]
        assert info.status == "error"

        history = list(info._iteration_history)
        assert history, "expected error entries in iteration history"
        joined = "\n".join(history) + "\n" + "\n".join(channel.sent)
        assert "<html" not in joined.lower()
        assert "@everyone" not in joined  # neutralized by the formatter
        assert any("RuntimeError" in h for h in history)
        assert any("stopped after" in s for s in channel.sent)


class TestLoopPostTruncation:
    async def test_truncated_response_closes_cut_code_block(self):
        import src.tools.autonomous_loop as al

        manager = al.LoopManager()
        channel = _FakeChannel()
        info = al.LoopInfo(
            id="test-loop",
            goal="g",
            mode="notify",
            interval_seconds=1,
            stop_condition=None,
            max_iterations=1,
            channel_id="c",
            requester_id="u1",
            requester_name="user",
        )
        response = "```python\n" + "x" * 1980 + "\nrest of code\n```"
        await manager._post_response(info, channel, response)
        assert channel.sent == ["```python\n" + "x" * 1940 + "\n```\n... (truncated)"]

    async def test_short_response_is_posted_verbatim(self):
        import src.tools.autonomous_loop as al

        manager = al.LoopManager()
        channel = _FakeChannel()
        info = al.LoopInfo(
            id="test-loop",
            goal="g",
            mode="notify",
            interval_seconds=1,
            stop_condition=None,
            max_iterations=1,
            channel_id="c",
            requester_id="u1",
            requester_name="user",
        )
        response = "```python\nprint('kept exactly')\n```"
        await manager._post_response(info, channel, response)
        assert channel.sent == [response]
