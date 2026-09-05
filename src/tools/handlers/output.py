"""Read retained evidence without re-executing the originating tool."""
from ..output_authorization import request_delivery_channel
from ..output_delivery import delivery_scope, get_delivery_budget, render_page
from ..output_retention import RetentionError


class OutputTools:
    def __init__(self, executor):
        self.executor = executor

    async def _handle_get_tool_output(self, inp):
        executor = self.executor
        owner, channel = delivery_scope.get()
        owner = str(executor._current_user_id or owner or "")
        channel = request_delivery_channel.get() or channel
        limit = inp.get("limit", 8000)
        if type(limit) is not int or not 4 <= limit <= 8000:
            return "Error: limit must be an integer from 4 through 8000."
        try:
            snapshot, offset = executor._ensure_output_store().read(
                inp.get("cursor", ""), owner=owner, channel=str(channel),
                authorize=lambda tool, hosts: executor._authorize_output(tool, hosts, owner))
            return render_page(snapshot, offset=offset, limit=limit,
                               budget=get_delivery_budget(executor.config))
        except RetentionError as exc:
            return f"Error: {exc}"
