"""Coding-agent handler domain — claude_code (RFC-004 P5, wave 2).

Body moved VERBATIM from executor.py (no adjustments needed — its lazy
imports are absolute). ``_parse_claude_stream_json`` moves with its sole
consumer (plan advisory #7).
"""

from __future__ import annotations

import json
import shlex

from .deps import HandlerBase


class CodingTools(HandlerBase):
    async def _handle_claude_code(self, inp: dict) -> str:
        host = inp.get("host") or self.config.claude_code_host
        if not host:
            return "claude_code_host not configured in tools config"
        working_dir = inp["working_directory"]
        prompt = inp["prompt"]
        allowed_tools = inp.get("allowed_tools")
        allow_edits = inp.get("allow_edits", False)

        resolved = self._resolve_host(host)
        if not resolved:
            return f"Unknown or disallowed host: {host}"
        address, ssh_user, _os = resolved

        claude_user = self.config.claude_code_user
        import os

        _already_claude_user = (os.getenv("USER", "") == claude_user) if claude_user else False
        if allow_edits and not claude_user:
            return "claude_code_user not configured — required for allow_edits=true"

        import base64 as b64mod

        encoded_prompt = b64mod.b64encode(prompt.encode()).decode()

        claude_args = [
            "claude",
            "--print",
            "--output-format stream-json",
            "--verbose",
            "--no-session-persistence",
        ]
        if allow_edits:
            claude_args.append("--dangerously-skip-permissions")
        if allowed_tools:
            claude_args.append(f"--allowedTools {shlex.quote(allowed_tools)}")

        claude_cmd = " ".join(claude_args)
        safe_wd = shlex.quote(working_dir)

        if allow_edits:
            safe_user = shlex.quote(claude_user)
            inner = (
                f"cd {safe_wd} && echo '{encoded_prompt}' | base64 -d | timeout 3600 {claude_cmd}"
            )
            if _already_claude_user:
                cmd = inner
            else:
                cmd = f"su - {safe_user} -c {shlex.quote(inner)}"
        else:
            cmd = f"cd {safe_wd} && echo '{encoded_prompt}' | base64 -d | timeout 3600 {claude_cmd}"

        on_output = None
        finish_cb = None
        if self.output_streamer and self.output_streamer.is_enabled("claude_code"):
            _, on_output, finish_cb = self.output_streamer.create_callback(
                "claude_code",
                channel_id=host,
            )

        code, output = await self._exec_command(
            address,
            cmd,
            ssh_user,
            timeout=3660,
            on_output=on_output,
        )
        if finish_cb:
            try:
                await finish_cb()
            except Exception:
                pass

        if code != 0:
            return f"Claude Code failed (exit {code}):\n{output[-2000:]}"

        response_text, activity = self._parse_claude_stream_json(output)

        max_output = inp.get("max_output_chars", 6000)
        if len(response_text) > max_output:
            half = max_output // 2
            response_text = response_text[:half] + "[... truncated ...]" + response_text[-half:]
        return response_text + activity

    @staticmethod
    def _parse_claude_stream_json(raw_output: str) -> tuple[str, str]:
        """Parse stream-json output into (response_text, activity_summary)."""
        response_text = ""
        tool_calls: list[dict] = []
        cost = 0.0
        num_turns = 0
        duration_ms = 0

        for line in raw_output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue

            msg_type = d.get("type", "")

            if msg_type == "assistant":
                for block in (d.get("message") or {}).get("content", []):
                    bt = block.get("type", "")
                    if bt == "tool_use":
                        inp = block.get("input", {})
                        entry = {"tool": block.get("name", "?"), "input": inp}
                        tool_calls.append(entry)

            elif msg_type == "result":
                response_text = d.get("result", "") or ""
                cost = d.get("total_cost_usd", 0)
                num_turns = d.get("num_turns", 0)
                duration_ms = d.get("duration_ms", 0)

        if not tool_calls and not cost:
            return raw_output, ""

        lines = ["\n\n--- claude_code activity ---"]
        lines.append(
            f"Turns: {num_turns} | Cost: ${cost:.4f} | Duration: {duration_ms / 1000:.1f}s"
        )

        reads = []
        edits = []
        writes = []
        commands = []
        other = []

        for tc in tool_calls:
            tool = tc["tool"]
            inp = tc["input"]
            if tool == "Read":
                path = inp.get("file_path", "?")
                if path not in reads:
                    reads.append(path)
            elif tool == "Edit":
                path = inp.get("file_path", "?")
                old = inp.get("old_string", "")
                new = inp.get("new_string", "")
                edits.append(f"{path}: '{old[:40]}' → '{new[:40]}'")
            elif tool == "Write":
                path = inp.get("file_path", "?")
                size = len(inp.get("content", ""))
                writes.append(f"{path} ({size} chars)")
            elif tool in ("Bash", "bash"):
                cmd = inp.get("command", "?")
                commands.append(cmd[:100])
            else:
                desc = inp.get("description", "") or inp.get("query", "") or inp.get("pattern", "")
                other.append(f"{tool}: {desc[:60]}" if desc else tool)

        if reads:
            shown = reads[:10]
            extra = f" (+{len(reads) - 10} more)" if len(reads) > 10 else ""
            lines.append(f"Files read: {', '.join(shown)}{extra}")
        if edits:
            lines.append("Files edited:")
            for e in edits[:8]:
                lines.append(f"  {e}")
            if len(edits) > 8:
                lines.append(f"  (+{len(edits) - 8} more)")
        if writes:
            lines.append(f"Files written: {', '.join(writes[:8])}")
        if commands:
            lines.append("Commands run:")
            for c in commands[:8]:
                lines.append(f"  $ {c}")
            if len(commands) > 8:
                lines.append(f"  (+{len(commands) - 8} more)")
        if other:
            lines.append(f"Other tools: {', '.join(other[:8])}")

        activity = "\n".join(lines)
        if len(activity) > 2000:
            activity = activity[:1997] + "..."

        return response_text, activity
