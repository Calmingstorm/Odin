from __future__ import annotations

# A peer that stops answering mid-call (a laptop host gone to sleep) is
# dropped after about 45 s of silence instead of holding the call until its
# tool timeout; ssh then exits 255. Any data from the server resets the
# count, so busy and quiet commands alike keep their connection.
KEEPALIVE_OPTIONS = ("-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3")


def known_hosts_option(path: str) -> str:
    """Keep one trust file through OpenSSH's own option tokenizer.

    Subprocess argv quoting is not enough: UserKnownHostsFile parses its
    value as a list of filenames. Keep ordinary paths byte-identical and
    quote paths that would otherwise be split or interpreted as quotes.
    """
    if any(char in path for char in ("\x00", "\n", "\r")):
        raise ValueError("SSH known_hosts path must not contain NUL or line breaks")
    if any(char.isspace() or char in "\"'\\" for char in path):
        escaped = path.replace("\\", "\\\\").replace('"', '\\"')
        return f'UserKnownHostsFile="{escaped}"'
    return f"UserKnownHostsFile={path}"
