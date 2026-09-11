"""Compile and exercise the native selection JSON wire fixture, off desktop."""
import json
import subprocess


def test_native_selection_wire_fixture_has_private_inventory_proof_and_focus_echo(tmp_path):
    source = tmp_path / "selection-wire.cpp"
    binary = tmp_path / "selection-wire"
    source.write_text(r'''
#include <json-c/json.h>
#include <cassert>
#include <cstring>
#include <iostream>
static void put(json_object* object, const char* key, const char* value) {
  json_object_object_add(object, key, json_object_new_string(value));
}
static void put(json_object* object, const char* key, int64_t value) {
  json_object_object_add(object, key, json_object_new_int64(value));
}
int main() {
  auto* inventory = json_object_new_object();
  put(inventory, "ok", 1); put(inventory, "version", 1);
  put(inventory, "instance_id", "i1-native-fixture"); put(inventory, "topology_epoch", 9);
  auto* candidates = json_object_new_array();
  auto* candidate = json_object_new_object();
  put(candidate, "id", "c1-native-fixture");
  put(candidate, "label", "Drawing - Fixture");
  put(candidate, "output_id", "DP-1");
  auto* identity = json_object_new_object();
  put(identity, "pid", 1234); put(identity, "uid", 1000); put(identity, "start_ticks", 77);
  json_object_object_add(candidate, "identity", identity);
  json_object_array_add(candidates, candidate);
  json_object_object_add(inventory, "candidates", candidates);
  assert(json_object_array_length(candidates) <= 32);
  assert(std::strlen(json_object_get_string(json_object_object_get(candidate, "label"))) <= 256);
  std::cout << json_object_to_json_string_ext(inventory, JSON_C_TO_STRING_PLAIN) << "\n";
  auto* focus = json_object_new_object();
  put(focus, "ok", 1); put(focus, "version", 1); put(focus, "instance_id", "i1-native-fixture");
  put(focus, "candidate_id", "c1-native-fixture");
  put(focus, "output_id", "DP-1");
  put(focus, "topology_epoch", 9);
  auto* focused = json_object_new_object();
  put(focused, "pid", 1234); put(focused, "uid", 1000); put(focused, "start_ticks", 77);
  json_object_object_add(focus, "identity", focused);
  std::cout << json_object_to_json_string_ext(focus, JSON_C_TO_STRING_PLAIN) << "\n";
  json_object_put(inventory); json_object_put(focus);
}
''')
    subprocess.run(["g++-14", "-std=c++23", str(source), "-ljson-c", "-o", str(binary)], check=True)
    inventory, focus = map(
        json.loads, subprocess.check_output([str(binary)], text=True).splitlines()
    )
    assert set(inventory) == {"ok", "version", "instance_id", "topology_epoch", "candidates"}
    assert set(inventory["candidates"][0]) == {"id", "label", "output_id", "identity"}
    assert inventory["candidates"][0]["identity"] == {"pid": 1234, "uid": 1000, "start_ticks": 77}
    assert set(focus) == {
        "ok", "version", "instance_id", "candidate_id", "output_id",
        "topology_epoch", "identity",
    }
    assert focus["identity"] == inventory["candidates"][0]["identity"]
