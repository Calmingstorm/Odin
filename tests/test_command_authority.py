"""Classification-only tests for offline command URL authority helpers."""

from src.tools.command_authority import is_external_url, is_metadata_url


def test_metadata_known_hosts_ports_and_case() -> None:
    for url in (
        "http://169.254.169.254/latest/meta-data",
        "https://169.254.169.254:8443/",
        "http://METADATA.GOOGLE.INTERNAL/computeMetadata/v1",
        "http://metadata.google/",
        "http://metadata.azure.internal/",
        "http://instance-data.ec2.internal/",
        "http://169.254.170.2/",
        "http://[fd00:ec2::254]:8080/",
    ):
        assert is_metadata_url(url)


def test_metadata_recognizes_numeric_ipv4_authority_spellings() -> None:
    for authority in ("0xA9FEA9FE", "0251.0376.0251.0376", "2852039166"):
        assert is_metadata_url(f"http://{authority}/")


def test_non_metadata_private_and_link_local_remain_non_metadata() -> None:
    for url in (
        "http://192.168.1.10:8080/",
        "http://10.2.3.4/",
        "http://169.254.1.20/",
        "http://[fd00::1234]/",
    ):
        assert not is_metadata_url(url)


def test_external_url_distinguishes_public_from_local_authorities() -> None:
    for url in (
        "https://example.com/path",
        "http://203.0.113.1/",
    ):
        # Documentation-only IPv4 ranges are not globally routable.
        assert is_external_url(url) is ("example.com" in url)

    for url in (
        "http://localhost/",
        "http://printer/",
        "http://service.lan/",
        "http://box.local/",
        "http://api.internal/",
        "http://127.0.0.1:8000/",
        "http://10.1.2.3/",
        "http://169.254.1.2/",
        "http://[::1]/",
        "http://[fd00::1]/",
        "http://[fe80::1]/",
    ):
        assert not is_external_url(url)


def test_external_url_classifies_legacy_numeric_ipv4_offline() -> None:
    assert not is_external_url("http://0177.1/")
    assert not is_external_url("http://0x7f000001/")
    assert is_external_url("http://0x08080808/")


def test_invalid_or_unbounded_urls_are_not_classified_as_external() -> None:
    for value in ("", "example.com", "http:///missing-host", "http://host:bad/", "x" * 8193):
        assert not is_external_url(value)
        assert not is_metadata_url(value)
