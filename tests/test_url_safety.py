"""Tests for URL safety / SSRF protection with allowlist support."""
from src.tools.url_safety import is_url_blocked


class TestDefaultBlocking:
    def test_localhost_blocked(self):
        assert is_url_blocked("http://localhost/", resolve_dns=False)

    def test_127_blocked(self):
        assert is_url_blocked("http://127.0.0.1/", resolve_dns=False)

    def test_metadata_blocked(self):
        assert is_url_blocked("http://169.254.169.254/latest/meta-data/", resolve_dns=False)

    def test_google_metadata_blocked(self):
        assert is_url_blocked("http://metadata.google.internal/", resolve_dns=False)

    def test_public_url_allowed(self):
        assert not is_url_blocked("https://example.com/", resolve_dns=False)


class TestAllowlist:
    ALLOW = ["http://127.0.0.1:3002", "http://localhost:3002"]

    def test_allowed_localhost_port(self):
        assert not is_url_blocked(
            "http://127.0.0.1:3002/ui/",
            allowed_urls=self.ALLOW,
            resolve_dns=False,
        )

    def test_allowed_localhost_name(self):
        assert not is_url_blocked(
            "http://localhost:3002/api/status",
            allowed_urls=self.ALLOW,
            resolve_dns=False,
        )

    def test_wrong_port_still_blocked(self):
        assert is_url_blocked("http://127.0.0.1:9999/", allowed_urls=self.ALLOW, resolve_dns=False)

    def test_port_prefix_no_bypass(self):
        """http://127.0.0.1:30020 must NOT match allowlist entry for :3002."""
        assert is_url_blocked("http://127.0.0.1:30020/", allowed_urls=self.ALLOW, resolve_dns=False)

    def test_userinfo_metadata_no_bypass(self):
        """Userinfo in URL must not bypass allowlist matching."""
        assert is_url_blocked(
            "http://localhost:3002@169.254.169.254/latest/meta-data/",
            allowed_urls=self.ALLOW, resolve_dns=False,
        )

    def test_metadata_always_blocked_even_if_allowlisted(self):
        """Cloud metadata endpoints are blocked even if explicitly listed."""
        bad_allow = ["http://169.254.169.254"]
        assert is_url_blocked(
            "http://169.254.169.254/latest/meta-data/",
            allowed_urls=bad_allow,
            resolve_dns=False,
        )

    def test_scheme_mismatch_blocked(self):
        assert is_url_blocked(
            "https://127.0.0.1:3002/ui/",
            allowed_urls=self.ALLOW,
            resolve_dns=False,
        )

    def test_empty_allowlist_still_blocks(self):
        assert is_url_blocked("http://127.0.0.1:3002/", allowed_urls=[], resolve_dns=False)

    def test_path_prefix_matching(self):
        allow_with_path = ["http://127.0.0.1:3002/ui/"]
        assert not is_url_blocked(
            "http://127.0.0.1:3002/ui/schedules",
            allowed_urls=allow_with_path,
            resolve_dns=False,
        )
        assert is_url_blocked(
            "http://127.0.0.1:3002/api/status",
            allowed_urls=allow_with_path,
            resolve_dns=False,
        )


class TestReviewFixes:
    """Odin PR#238 review: CGNAT/Tailscale range + allowlist path-boundary."""

    def test_cgnat_tailscale_range_blocked(self):
        # 100.64.0.0/10 (CGNAT / Tailscale overlay) is non-global -> blocked.
        assert is_url_blocked("http://100.64.1.2/", resolve_dns=False)
        assert is_url_blocked("http://100.100.100.100/", resolve_dns=False)
        # A public address stays allowed.
        assert not is_url_blocked("https://1.1.1.1/", resolve_dns=False)

    def test_allowlist_sibling_prefix_not_matched(self):
        allow = ["http://127.0.0.1:8188/api"]
        # /api-evil must NOT match the /api prefix.
        assert is_url_blocked(
            "http://127.0.0.1:8188/api-evil", allowed_urls=allow, resolve_dns=False
        )
        # the exact prefix and a real sub-path DO match (not blocked).
        assert not is_url_blocked(
            "http://127.0.0.1:8188/api", allowed_urls=allow, resolve_dns=False
        )
        assert not is_url_blocked(
            "http://127.0.0.1:8188/api/status", allowed_urls=allow, resolve_dns=False
        )

    def test_allowlist_encoded_traversal_blocked(self):
        allow = ["http://127.0.0.1:8188/api"]
        # /api/%2e%2e/admin decodes+normalizes to /admin -> escapes the prefix.
        assert is_url_blocked(
            "http://127.0.0.1:8188/api/%2e%2e/admin", allowed_urls=allow, resolve_dns=False
        )

    def test_ipv4_mapped_ipv6_metadata_blocked_even_if_allowlisted(self):
        # ::ffff:169.254.169.254 (and the expanded form) is the metadata IP in a
        # non-canonical spelling — must stay blocked even when allowlisted.
        u = "http://[::ffff:169.254.169.254]/latest/meta-data/"
        assert is_url_blocked(u, allowed_urls=[u], resolve_dns=False)
        u2 = "http://[0:0:0:0:0:ffff:a9fe:a9fe]/x"
        assert is_url_blocked(u2, allowed_urls=[u2], resolve_dns=False)

    def test_is_metadata_ip_spellings(self):
        from src.tools.url_safety import _is_metadata_ip

        assert _is_metadata_ip("169.254.169.254")  # dotted (direct)
        assert _is_metadata_ip("fd00:ec2::254")  # ipv6 metadata
        assert _is_metadata_ip("::ffff:169.254.169.254")  # mapped
        assert not _is_metadata_ip("example.com")  # non-IP host
        assert not _is_metadata_ip("1.1.1.1")  # public

    def test_dns_rebind_to_metadata_blocked_even_if_allowlisted(self, monkeypatch):
        import socket as _socket

        from src.tools import url_safety

        def fake_gai(host, *a, **k):
            return [(_socket.AF_INET, _socket.SOCK_STREAM, 6, "", ("169.254.169.254", 0))]

        monkeypatch.setattr(url_safety.socket, "getaddrinfo", fake_gai)
        allow = ["http://internal.example/api"]
        # An allowlisted host that RESOLVES to metadata is still blocked
        # (unconditional metadata check runs before the allowlist exemption).
        assert url_safety.is_url_blocked(
            "http://internal.example/api", allowed_urls=allow, resolve_dns=True
        )

    def test_resolves_to_metadata_dns_failure_permits_allowlist(self, monkeypatch):
        from src.tools import url_safety

        def fake_gai(host, *a, **k):
            raise url_safety.socket.gaierror("nxdomain")

        monkeypatch.setattr(url_safety.socket, "getaddrinfo", fake_gai)
        allow = ["http://example.com/api"]
        # DNS fails -> _resolves_to_metadata False -> allowlist applies (allowed).
        assert not url_safety.is_url_blocked(
            "http://example.com/api", allowed_urls=allow, resolve_dns=True
        )
