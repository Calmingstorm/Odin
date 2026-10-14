from __future__ import annotations


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
