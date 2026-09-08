"""Private map-state comparison; never part of the input-scope fingerprint."""

from .x11_app_scope import MAX_INVENTORY_WINDOWS


def same_application_appearance(before, after, transition):
    """Measured new dialog of the same native process without transient hints.

    GIMP/GTK2 may omit WM_TRANSIENT_FOR. Do not relax input-scope matching or
    ordinary focus verification: this exception requires complete native map
    evidence and applies only to an appeared safe dialog/menu after release.
    """
    return (
        type(before) is dict
        and type(after) is dict
        and type(transition) is dict
        and transition.get("method") == "native_complete_map_inventory_transition"
        and transition.get("appeared") is True
        and transition.get("kind") in {"dialog", "menu"}
        and bool(before.get("process"))
        and before["process"] == after.get("process")
        and after.get("focused") is True
        and after.get("modal_kind") == "safe_application"
        and all(
            key in before and before[key] == after.get(key)
            for key in ("topology", "source_rect", "source_origin")
        )
    )


def appearance_transition(before, after, before_scope, after_scope):
    """Prove the specific after-target was absent/unmapped, not merely unfocused.

    Native inventories are complete, twice-sampled by the capture worker and
    anchored to each capture's XRes/proc-guarded target. This is sampled evidence,
    not event history, an atomic X transaction, or proof input caused the map.
    """

    def states(inventory, scope):
        if (
            type(inventory) is not dict
            or type(scope) is not dict
            or inventory.get("complete") is not True
            or inventory.get("root") != scope.get("topology", {}).get("root")
            or inventory.get("process") != scope.get("process")
            or inventory.get("target") != scope.get("window")
        ):
            return None
        rows = inventory.get("windows")
        if type(rows) is not list or not 1 <= len(rows) <= MAX_INVENTORY_WINDOWS:
            return None
        result = {}
        for row in rows:
            if (
                type(row) not in {list, tuple}
                or len(row) != 2
                or type(row[0]) is not int
                or row[0] <= 1
                or row[0] in result
                or type(row[1]) is not int
                or row[1] not in {0, 1, 2}
            ):
                return None
            result[row[0]] = row[1]
        target = scope.get("window")
        if type(target) is not int or result.get(target) != 2 or inventory["root"] not in result:
            return None
        return result

    old = states(before, before_scope)
    new = states(after, after_scope)
    if (
        old is None
        or new is None
        or before["root"] != after["root"]
        or before_scope.get("process") != after_scope.get("process")
        or before_scope.get("topology") != after_scope.get("topology")
        or after_scope.get("window_kind") not in {"normal", "dialog", "menu"}
    ):
        return None
    target = after_scope["window"]
    kind = after_scope["window_kind"]
    # GTK2 utility dialogs may omit DIALOG type and MODAL state. A measured
    # transient chain in the same process supplies native dialog evidence.
    chain = after_scope.get("transient_chain")
    identities = after_scope.get("transient_processes")
    if (
        kind == "normal"
        and after_scope.get("modal") is True
        and after_scope.get("modal_kind") == "safe_application"
        and type(chain) is list
        and chain
        and type(identities) is list
        and len(identities) == len(chain)
        and all(identity == after_scope.get("process") for identity in identities)
        and (
            before_scope["window"] in chain
            or (
                before_scope.get("transient_chain")
                and before_scope["transient_chain"][-1] == chain[-1]
            )
        )
    ):
        kind = "dialog"
    prior = old.get(target)
    # IsUnviewable (1) is already mapped but has an unmapped ancestor. Neither
    # restoring that ancestor nor focusing a viewable window proves a new map.
    return {
        "method": "native_complete_map_inventory_transition",
        "kind": kind,
        "appeared": prior is None or prior == 0,
    }
