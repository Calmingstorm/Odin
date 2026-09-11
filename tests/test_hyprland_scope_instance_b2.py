"""Pure instance-endpoint derivation checks.  No compositor is contacted."""

import subprocess

from src.computer.runtime.hyprland_identity import ExecutableTrust, HyprlandIdentity, ProcessPin
from src.computer.runtime.hyprland_scope import instance_scope_socket


def test_instance_socket_matches_compiled_native_canonical_fixture(tmp_path):
    trust = ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.55.2", "b" * 40)
    pin = ProcessPin(321, 1000, 456, "boot-id", 1, 2, 3, 4, 5, "a" * 64)
    identity = HyprlandIdentity(pin, trust)
    source = tmp_path / "instance-token.cpp"
    binary = tmp_path / "instance-token"
    source.write_text(
        "#include <iomanip>\n"
        "#include <iostream>\n"
        "#include <openssl/sha.h>\n"
        "#include <string>\n"
        "int main() {\n"
        "  const std::string value = std::string(\"odin-hyprland-instance-v1\\0\", 26)\n"
        "      + \"boot-id\" + '\\0' + \"321\" + '\\0' + \"456\";\n"
        "  unsigned char digest[SHA256_DIGEST_LENGTH];\n"
        "  SHA256(reinterpret_cast<const unsigned char*>(value.data()), value.size(), digest);\n"
        "  for (int i = 0; i != 16; ++i) std::cout << std::hex << std::setw(2)\n"
        "      << std::setfill('0') << static_cast<unsigned>(digest[i]);\n"
        "}\n"
    )
    subprocess.run(
        ["g++", "-std=c++20", str(source), "-lcrypto", "-o", str(binary)],
        check=True,
    )
    token = subprocess.check_output([str(binary)], text=True)
    assert instance_scope_socket(identity, "/run/user/1000") == (
        f"/run/user/1000/odin-hyprland-scope-i1-{token}.sock"
    )
