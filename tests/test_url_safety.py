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
