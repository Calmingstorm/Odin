"""State handler domain — memory_manage, manage_list (RFC-004 P6, wave 3).

The LOCK-HEAVY domain, extracted last and alone for isolated review
(plan advisory #2). Locks and the memory path live ON THE EXECUTOR and
are reached by identity through deps — memory PERSISTENCE primitives
(_load_all_memory/_save_all_memory) STAY CORE because prompts.py and the
web API call them on the executor directly; this domain uses them via
passthroughs. MEMORY_MAX_KEYS_PER_SECTION moves here with its only
consumer (its two monkeypatch test sites are re-pointed, declared).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from .deps import HandlerBase, HandlerDeps

# Max working-memory notes retained per section (global / per-user). The full
# merged map is injected into every system prompt, so this bounds prompt bloat;
# oldest-by-write notes are evicted past the cap.
MEMORY_MAX_KEYS_PER_SECTION = 200


class StateTools(HandlerBase):
    def __init__(self, deps: HandlerDeps) -> None:
        super().__init__(deps)
        self._load_all_memory = deps.load_all_memory
        self._save_all_memory = deps.save_all_memory

    @property
    def _memory_path(self) -> Path | None:
        return self._deps.memory_path()

    @property
    def _memory_lock(self):
        return self._deps.memory_lock()

    @property
    def _lists_lock(self):
        return self._deps.lists_lock()

    async def _handle_memory_manage(self, inp: dict, *, user_id: str | None = None) -> str:
        action = inp.get("action")
        if not action:
            return (
                "memory_manage requires an 'action' field. "
                "Valid actions: list, save, get, delete. "
                "Example: {'action': 'get', 'key': 'foo'}."
            )
        scope = inp.get("scope", "personal")
        from ...json_store import StoreCorruptError

        async with self._memory_lock:
            if action in ("get", "recall", "read"):
                key = inp.get("key")
                if not key:
                    return "'key' is required for get."
                try:
                    all_mem = await asyncio.to_thread(self._load_all_memory)
                except StoreCorruptError as exc:
                    return (
                        "Memory store is currently unreadable or corrupt (a backup copy was "
                        f"preserved). Cannot complete '{action}' to avoid data loss. Details: {exc}"
                    )
                user_key = f"user_{user_id}" if user_id else None
                if user_key and key in all_mem.get(user_key, {}):
                    return f"**{key}** (personal): {all_mem[user_key][key]}"
                if key in all_mem.get("global", {}):
                    return f"**{key}** (global): {all_mem['global'][key]}"
                return f"No note found with key '{key}'."

            if action == "list":
                try:
                    all_mem = await asyncio.to_thread(self._load_all_memory)
                except StoreCorruptError as exc:
                    return (
                        "Memory store is currently unreadable or corrupt (a backup copy was "
                        f"preserved). Cannot complete '{action}' to avoid data loss. Details: {exc}"
                    )
                global_mem = all_mem.get("global", {})
                user_mem = all_mem.get(f"user_{user_id}", {}) if user_id else {}
                lines = []
                if global_mem:
                    lines.append("**Global notes:**")
                    lines.extend(f"- **{k}**: {v}" for k, v in global_mem.items())
                if user_mem:
                    lines.append("**Your personal notes:**")
                    lines.extend(f"- **{k}**: {v}" for k, v in user_mem.items())
                return "\n".join(lines) if lines else "No notes saved yet."

            elif action == "save":
                key = inp.get("key")
                value = inp.get("value")
                if not key or not value:
                    return "Both 'key' and 'value' are required for save."
                try:
                    all_mem = await asyncio.to_thread(self._load_all_memory)
                except StoreCorruptError as exc:
                    return (
                        "Memory store is currently unreadable or corrupt (a backup copy was "
                        f"preserved). Cannot complete '{action}' to avoid data loss. Details: {exc}"
                    )
                if scope == "global":
                    section = "global"
                elif user_id:
                    section = f"user_{user_id}"
                else:
                    section = "global"
                section_map = all_mem.setdefault(section, {})
                # Move-to-end + cap: working memory is injected into every
                # system prompt, so it must not grow without bound. Re-inserting
                # gives LRU-by-write order; evict the oldest keys beyond the cap
                # (never the one just written).
                section_map.pop(key, None)
                section_map[key] = value
                evicted = 0
                while len(section_map) > MEMORY_MAX_KEYS_PER_SECTION:
                    oldest = next(iter(section_map))
                    if oldest == key:
                        break
                    del section_map[oldest]
                    evicted += 1
                await asyncio.to_thread(self._save_all_memory, all_mem)
                scope_label = "global" if section == "global" else "personal"
                suffix = (
                    f" (evicted {evicted} oldest note(s) at cap {MEMORY_MAX_KEYS_PER_SECTION})"
                    if evicted
                    else ""
                )
                return f"Saved {scope_label} note '{key}'.{suffix}"

            elif action == "delete":
                key = inp.get("key")
                if not key:
                    return "'key' is required for delete."
                try:
                    all_mem = await asyncio.to_thread(self._load_all_memory)
                except StoreCorruptError as exc:
                    return (
                        "Memory store is currently unreadable or corrupt (a backup copy was "
                        f"preserved). Cannot complete '{action}' to avoid data loss. Details: {exc}"
                    )
                user_key = f"user_{user_id}" if user_id else None
                if user_key and key in all_mem.get(user_key, {}):
                    del all_mem[user_key][key]
                    await asyncio.to_thread(self._save_all_memory, all_mem)
                    return f"Deleted personal note '{key}'."
                elif key in all_mem.get("global", {}):
                    del all_mem["global"][key]
                    await asyncio.to_thread(self._save_all_memory, all_mem)
                    return f"Deleted global note '{key}'."
                return f"No note found with key '{key}'."

        return f"Unknown memory action: {action}"

    def _lists_path(self) -> Path | None:
        """Return path to data/lists.json (sibling of memory.json)."""
        if not self._memory_path:
            return None
        return self._memory_path.parent / "lists.json"

    def _load_lists(self) -> dict:
        """Load all lists. Migrates old grocery_list.json on first access.

        Structure: {
            "grocery": {
                "owner": "shared",
                "items": [{"name": "...", "added_by": "...", "added_at": "...", "done": false}, ...]
            },
            ...
        }
        """
        path = self._lists_path()
        if not path:
            return {}
        from ...json_store import load_json_store_safe

        # READ path: corruption degrades (and a corrupt copy is preserved) so a
        # damaged file can't crash; mutations use _load_lists_for_write.
        data, ok = load_json_store_safe(path, container=dict, what="lists.json")
        if ok and data:
            return data
        # Auto-migrate old grocery_list.json if it exists
        old_grocery = path.parent / "grocery_list.json"
        if old_grocery.exists():
            try:
                old_data = json.loads(old_grocery.read_text())
                old_items = old_data.get("items", [])
                migrated_items = []
                for item in old_items:
                    migrated_items.append(
                        {
                            "name": item.get("name", ""),
                            "added_by": item.get("added_by", ""),
                            "added_at": item.get("added_at", ""),
                            "done": False,
                        }
                    )
                lists = {"grocery": {"owner": "shared", "items": migrated_items}}
                self._save_lists(lists)
                return lists
            except Exception:
                pass
        return {}

    def _load_lists_for_write(self) -> dict:
        """MUTATION path — raises StoreCorruptError on a corrupt lists.json so
        the caller refuses rather than overwriting (which would wipe the
        lists). Missing/empty falls back to the read path (grocery migration)."""
        from ...json_store import load_json_store

        path = self._lists_path()
        if not path:
            return {}
        data = load_json_store(path, container=dict)
        if data:
            return data
        return self._load_lists()

    def _save_lists(self, data: dict) -> None:
        path = self._lists_path()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2))
            tmp.replace(path)

    async def _handle_manage_list(self, inp: dict, *, user_id: str | None = None) -> str:
        action = inp["action"]
        list_name = inp.get("list_name", "").strip().lower()
        raw_items = inp.get("items", [])
        owner_pref = inp.get("owner", "shared")

        return await self._manage_list_locked(action, list_name, raw_items, owner_pref, user_id)

    async def _manage_list_locked(self, action, list_name, raw_items, owner_pref, user_id):
        from datetime import datetime

        async with self._lists_lock:
            from ...json_store import StoreCorruptError

            try:
                lists = await asyncio.to_thread(self._load_lists_for_write)
            except StoreCorruptError as exc:
                # Reads degrade to an empty view; mutations refuse — never
                # overwrite a corrupt file, which would wipe the lists.
                if action not in ("list_all", "show"):
                    return (
                        "Lists store is unreadable or corrupt (a backup copy was preserved). "
                        f"Refusing to modify it to avoid data loss. Details: {exc}"
                    )
                lists = {}

            if action == "list_all":
                if not lists:
                    return "No lists exist yet. Add items to create one."
                lines = ["**Your Lists**\n"]
                for name, lst in sorted(lists.items()):
                    lst_owner = lst.get("owner", "shared")
                    if lst_owner != "shared" and lst_owner != user_id:
                        continue
                    count = len(lst.get("items", []))
                    done = sum(1 for i in lst.get("items", []) if i.get("done"))
                    owner_label = "shared" if lst_owner == "shared" else "personal"
                    if done:
                        lines.append(f"- **{name}** ({count} items, {done} done) [{owner_label}]")
                    else:
                        lines.append(f"- **{name}** ({count} items) [{owner_label}]")
                if len(lines) == 1:
                    return "No lists visible to you."
                return "\n".join(lines)

            if not list_name:
                return "list_name is required for this action."

            # Resolve the list — check for personal or shared
            lst = lists.get(list_name)
            if lst and lst.get("owner") not in ("shared", user_id, None):
                return f"You don't have access to the '{list_name}' list."

            if action == "show":
                if not lst or not lst.get("items"):
                    return f"The '{list_name}' list is empty."
                return self._format_list(list_name, lst)

            if action == "clear":
                if not lst or not lst.get("items"):
                    return f"The '{list_name}' list is already empty."
                count = len(lst["items"])
                lst["items"] = []
                await asyncio.to_thread(self._save_lists, lists)
                return f"Cleared {count} item(s) from the '{list_name}' list."

            if action == "add":
                if not raw_items:
                    return "No items specified to add."
                # Create list on the fly if it doesn't exist
                if not lst:
                    owner = user_id if owner_pref == "personal" and user_id else "shared"
                    lst = {"owner": owner, "items": []}
                    lists[list_name] = lst
                added, already = [], []
                for name in raw_items:
                    name = name.strip()
                    if not name:
                        continue
                    if any(i["name"].lower() == name.lower() for i in lst["items"]):
                        already.append(name)
                        continue
                    lst["items"].append(
                        {
                            "name": name,
                            "added_by": user_id or "",
                            "added_at": datetime.now().isoformat(),
                            "done": False,
                        }
                    )
                    added.append(name)
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if added:
                    parts.append(f"Added to '{list_name}': {', '.join(added)}")
                if already:
                    parts.append(f"Already on the list: {', '.join(already)}")
                parts.append(f"\n{self._format_list(list_name, lst)}")
                return "\n".join(parts)

            if action == "remove":
                if not lst:
                    return f"The '{list_name}' list doesn't exist."
                if not raw_items:
                    return "No items specified to remove."
                removed, not_found = [], []
                for name in raw_items:
                    name = name.strip()
                    if not name:
                        continue
                    q = name.lower()
                    matches = [
                        i for i, item in enumerate(lst["items"]) if q in item["name"].lower()
                    ]
                    if matches:
                        for idx in sorted(matches, reverse=True):
                            removed.append(lst["items"].pop(idx)["name"])
                    else:
                        not_found.append(name)
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if removed:
                    parts.append(f"Removed from '{list_name}': {', '.join(removed)}")
                if not_found:
                    parts.append(f"Not found: {', '.join(not_found)}")
                if lst["items"]:
                    parts.append(f"\n{self._format_list(list_name, lst)}")
                else:
                    parts.append(f"\nThe '{list_name}' list is now empty.")
                return "\n".join(parts)

            if action == "mark_done":
                if not lst:
                    return f"The '{list_name}' list doesn't exist."
                if not raw_items:
                    return "No items specified to mark as done."
                marked, not_found = [], []
                for name in raw_items:
                    q = name.strip().lower()
                    if not q:
                        continue
                    found = False
                    for item in lst["items"]:
                        if q in item["name"].lower() and not item.get("done"):
                            item["done"] = True
                            marked.append(item["name"])
                            found = True
                            break
                    if not found:
                        not_found.append(name.strip())
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if marked:
                    parts.append(f"Marked done: {', '.join(marked)}")
                if not_found:
                    parts.append(f"Not found or already done: {', '.join(not_found)}")
                parts.append(f"\n{self._format_list(list_name, lst)}")
                return "\n".join(parts)

            if action == "mark_undone":
                if not lst:
                    return f"The '{list_name}' list doesn't exist."
                if not raw_items:
                    return "No items specified to mark as undone."
                marked, not_found = [], []
                for name in raw_items:
                    q = name.strip().lower()
                    if not q:
                        continue
                    found = False
                    for item in lst["items"]:
                        if q in item["name"].lower() and item.get("done"):
                            item["done"] = False
                            marked.append(item["name"])
                            found = True
                            break
                    if not found:
                        not_found.append(name.strip())
                await asyncio.to_thread(self._save_lists, lists)
                parts = []
                if marked:
                    parts.append(f"Marked undone: {', '.join(marked)}")
                if not_found:
                    parts.append(f"Not found or not done: {', '.join(not_found)}")
                parts.append(f"\n{self._format_list(list_name, lst)}")
                return "\n".join(parts)

            return f"Unknown action: {action}"

    @staticmethod
    def _format_list(list_name: str, lst: dict) -> str:
        items = lst.get("items", [])
        if not items:
            return f"The '{list_name}' list is empty."
        lines = [f"**{list_name.title()} List** ({len(items)} items)\n"]
        for i, item in enumerate(items, 1):
            done_mark = "\u2705 " if item.get("done") else ""
            strike = f"~~{item['name']}~~" if item.get("done") else item["name"]
            added = item.get("added_by", "")
            ts = item.get("added_at", "")
            suffix = ""
            if added or ts:
                parts = []
                if added:
                    parts.append(added)
                if ts:
                    try:
                        from datetime import datetime

                        dt = datetime.fromisoformat(ts)
                        parts.append(dt.strftime("%b %d"))
                    except ValueError:
                        pass
                suffix = f"  _({', '.join(parts)})_"
            lines.append(f"{i}. {done_mark}{strike}{suffix}")
        return "\n".join(lines)
