"""Compile and exercise the native selection JSON wire fixture, off desktop."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/hyprland-input/scope-plugin.cpp"


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
static void put(json_object* object, const char* key, int value) {
  json_object_object_add(object, key, json_object_new_int(value));
}
static void put(json_object* object, const char* key, int64_t value) {
  json_object_object_add(object, key, json_object_new_int64(value));
}
int main() {
  auto* inventory = json_object_new_object();
  put(inventory, "ok", 1); put(inventory, "version", 1);
  put(inventory, "instance_id", "i1-11111111111111111111111111111111");
  put(inventory, "topology_epoch", 9);
  const char* digest = "1111111111111111111111111111111111111111111111111111111111111111";
  const char* epoch = "222222222222222222222222222222222222222222222222";
  const char* window = "w1-222222222222222222222222222222222222222222222222-"
                       "333333333333333333333333333333333333333333333333";
  put(inventory, "topology_digest", digest);
  auto* candidates = json_object_new_array();
  auto* candidate = json_object_new_object();
  put(candidate, "id", "c1-native-fixture");
  put(candidate, "label", "Drawing - Fixture");
  put(candidate, "output_id", "DP-1"); put(candidate, "output_name", "DP-1");
  put(candidate, "topology_digest", digest);
  put(candidate, "window_id", window); put(candidate, "plugin_epoch", epoch);
  auto* output = json_object_new_object();
  put(output, "x", 0); put(output, "y", 0);
  put(output, "width", 800); put(output, "height", 600);
  put(output, "pixel_width", 800); put(output, "pixel_height", 600);
  put(output, "scale", 1); put(output, "transform", 0);
  json_object_object_add(candidate, "output", output);
  auto* identity = json_object_new_object();
  put(identity, "pid", 1234); put(identity, "uid", 1000); put(identity, "start_ticks", 77);
  put(identity, "executable", "/usr/bin/fixture");
  put(identity, "exe_device", 1); put(identity, "exe_inode", 2);
  json_object_object_add(candidate, "identity", identity);
  json_object_array_add(candidates, candidate);
  json_object_object_add(inventory, "candidates", candidates);
  assert(json_object_array_length(candidates) <= 32);
  assert(std::strlen(json_object_get_string(json_object_object_get(candidate, "label"))) <= 256);
  std::cout << json_object_to_json_string_ext(inventory, JSON_C_TO_STRING_PLAIN) << "\n";
  auto* focus = json_object_new_object();
  put(focus, "ok", 1); put(focus, "version", 1);
  put(focus, "instance_id", "i1-11111111111111111111111111111111");
  put(focus, "candidate_id", "c1-native-fixture");
  put(focus, "output_id", "DP-1"); put(focus, "output_name", "DP-1");
  put(focus, "topology_epoch", 9); put(focus, "topology_digest", digest);
  put(focus, "window_id", window); put(focus, "plugin_epoch", epoch);
  auto* focused_output = json_object_new_object();
  put(focused_output, "x", 0); put(focused_output, "y", 0);
  put(focused_output, "width", 800); put(focused_output, "height", 600);
  put(focused_output, "pixel_width", 800); put(focused_output, "pixel_height", 600);
  put(focused_output, "scale", 1); put(focused_output, "transform", 0);
  json_object_object_add(focus, "output", focused_output);
  auto* focused = json_object_new_object();
  put(focused, "pid", 1234); put(focused, "uid", 1000); put(focused, "start_ticks", 77);
  put(focused, "executable", "/usr/bin/fixture");
  put(focused, "exe_device", 1); put(focused, "exe_inode", 2);
  json_object_object_add(focus, "identity", focused);
  std::cout << json_object_to_json_string_ext(focus, JSON_C_TO_STRING_PLAIN) << "\n";
  json_object_put(inventory); json_object_put(focus);
}
''')
    subprocess.run(["g++-14", "-std=c++23", str(source), "-ljson-c", "-o", str(binary)], check=True)
    inventory, focus = map(
        json.loads, subprocess.check_output([str(binary)], text=True).splitlines()
    )
    source_text = SOURCE.read_text()
    assert 'put(item.get(), "window_id", c.windowID)' in source_text
    assert 'put(item.get(), "plugin_epoch", pluginEpoch)' in source_text
    assert 'put(response.get(), "window_id", candidate.windowID)' in source_text
    assert 'put(response.get(), "plugin_epoch", pluginEpoch)' in source_text
    assert set(inventory) == {
        "ok", "version", "instance_id", "topology_epoch", "topology_digest", "candidates",
    }
    assert set(inventory["candidates"][0]) == {
        "id", "label", "output_id", "output_name", "topology_digest", "output", "identity",
        "window_id", "plugin_epoch",
    }
    assert inventory["candidates"][0]["identity"] == {
        "pid": 1234, "uid": 1000, "start_ticks": 77, "executable": "/usr/bin/fixture",
        "exe_device": 1, "exe_inode": 2,
    }
    assert set(focus) == {
        "ok", "version", "instance_id", "candidate_id", "output_id", "output_name",
        "topology_epoch", "topology_digest", "output", "identity", "window_id", "plugin_epoch",
    }
    assert focus["identity"] == inventory["candidates"][0]["identity"]
    assert focus["window_id"] == inventory["candidates"][0]["window_id"]
    assert focus["plugin_epoch"] == inventory["candidates"][0]["plugin_epoch"]
