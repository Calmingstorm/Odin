"""Private map-state comparison; never part of the input-scope fingerprint."""
from .x11_app_scope import MAX_INVENTORY_WINDOWS


def appearance_transition(before, after, before_scope, after_scope):
    """Prove the specific after-target was absent/unmapped, not merely unfocused.

    Native inventories are complete, twice-sampled by the capture worker and
    anchored to each capture's XRes/proc-guarded target. This is sampled evidence,
    not event history, an atomic X transaction, or proof input caused the map.
    """
    def states(inventory, scope):
        if (type(inventory) is not dict or type(scope) is not dict
                or inventory.get("complete") is not True
                or inventory.get("root") != scope.get("topology", {}).get("root")
                or inventory.get("process") != scope.get("process")
                or inventory.get("target") != scope.get("window")):
            return None
        rows = inventory.get("windows")
        if type(rows) is not list or not 1 <= len(rows) <= MAX_INVENTORY_WINDOWS:
            return None
        result = {}
        for row in rows:
            if (type(row) not in {list, tuple} or len(row) != 2
                    or type(row[0]) is not int or row[0] <= 1
                    or row[0] in result or type(row[1]) is not int
                    or row[1] not in {0, 1, 2}):
                return None
            result[row[0]] = row[1]
        if result.get(scope.get("window")) != 2 or inventory["root"] not in result:
            return None
        return result

    old = states(before, before_scope)
    new = states(after, after_scope)
    if (old is None or new is None or before["root"] != after["root"]
            or before_scope.get("process") != after_scope.get("process")
            or before_scope.get("topology") != after_scope.get("topology")
            or after_scope.get("window_kind") not in {"normal", "dialog", "menu"}):
        return None
    target = after_scope["window"]
    prior = old.get(target)
    # IsUnviewable (1) is already mapped but has an unmapped ancestor. Neither
    # restoring that ancestor nor focusing a viewable window proves a new map.
    return {"method": "native_complete_map_inventory_transition",
            "kind": after_scope["window_kind"],
            "appeared": prior is None or prior == 0}
