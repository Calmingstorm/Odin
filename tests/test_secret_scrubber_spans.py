"""Shared format-preserving credential spans and linear byte-mask regressions."""
import json
import time

import pytest

from src.llm.secret_scrubber import (
    embedded_process_scrubber_source,
    is_credential_key,
    iter_secret_spans,
    scrub_output_secrets,
    scrub_process_secrets,
)
from src.tools.output_delivery import DeliveredOutput, RankedOutput


@pytest.mark.parametrize("value", ["42", "false", "null", "0.125", "[]", "{}",
                                  '["public"]', '{"nested":"public"}'])
def test_nonstring_credential_values_remain_byte_exact(value):
    text = '{\n  "token": ' + value + ',\n  "secret": false, "café": "世界"\n}\n'
    assert scrub_output_secrets(text) == text
    assert scrub_process_secrets(text.encode()) == text.encode()


@pytest.mark.parametrize("key", ["password", "passwd", "pwd", "api_key", "api-key",
                                "apiKey", "access_token", "auth_token", "secret",
                                "token", "Authorization", "private_key", "credentials",
                                "servicePassword", "nested-secret"])
def test_one_key_rule_for_both_consumers(key):
    assert is_credential_key(key)
    raw = '{"' + key + '": "fixture hidden"}'
    assert scrub_output_secrets(raw) == '{"' + key + '": "[REDACTED]"}'
    assert scrub_process_secrets(raw.encode()) == (
        '{"' + key + '": "' + '*' * len("fixture hidden") + '"}').encode()


def test_indentation_unicode_escapes_and_unrelated_strings_preserved():
    source = ('  {\n\t"café" : "世界", "escaped": "caf\\u00e9",\n'
              '  "pass\\u0077ord" : "hidden \\"quote\\" \\u00e9",\n'
              '  "secret": false, "nested": [ {"token":"other"} ]\n  }  \n')
    expected = source.replace('hidden \\"quote\\" \\u00e9', '[REDACTED]').replace(
        '"other"', '"[REDACTED]"')
    assert scrub_output_secrets(source) == expected
    assert json.loads(expected)["café"] == "世界"
    masked = scrub_process_secrets(source.encode())
    assert len(masked) == len(source.encode())
    assert masked.startswith('  {\n\t"café" : "世界", "escaped": "caf\\u00e9",\n'.encode())
    assert json.loads(masked)["secret"] is False


@pytest.mark.parametrize("tail", ['fixture partial', 'fixture \\"quoted',
                                 'fixture \\', 'fixture \\u00', 'fixture \\"'])
def test_incomplete_credential_string_preserves_opening_framing(tail):
    source = '{"pass\\u0077ord": "' + tail
    assert scrub_output_secrets(source) == '{"pass\\u0077ord": "[REDACTED]'
    masked = scrub_process_secrets(source.encode())
    assert masked == b'{"pass\\u0077ord": "' + b'*' * len(tail.encode())
    assert scrub_process_secrets(masked) == masked
    assert scrub_output_secrets(masked.decode()) == masked.decode()


def test_malformed_key_escape_does_not_hide_later_credentials():
    source = '{"bad\\q":"public", "password":"fixture hidden"}'
    assert scrub_output_secrets(source) == '{"bad\\q":"public", "password":"[REDACTED]"}'


def test_escaped_pattern_inside_ordinary_json_string_preserves_source():
    source = ' { "public": "before sk-\\u0041' + 'A' * 20 + ' after", "café": 42 }\n'
    assert scrub_output_secrets(source) == (
        ' { "public": "before [REDACTED] after", "café": 42 }\n')
    assert len(scrub_process_secrets(source.encode())) == len(source.encode())


@pytest.mark.parametrize("escaped", ['\\ud83d\\ude00', '\\u0041\\u0042'])
def test_decoded_source_map_handles_surrogate_pair_and_separate_escapes(escaped):
    source = '{"public":"' + escaped + ' sk-' + 'A' * 22 + ' end"}'
    assert scrub_output_secrets(source) == '{"public":"' + escaped + ' [REDACTED] end"}'


@pytest.mark.parametrize("text", [
    'password=fixturehidden', 'password="fixture hidden"',
    "password='fixture hidden'", "token='fixture hidden with spaces'",
    'api_key: "fixture hidden"', 'token=' + 'A' * 24,
    'sk-' + 'A' * 24, 'ghp_' + 'A' * 38,
    'AKIA' + 'A' * 16, 'aws_secret_access_key=' + 'A' * 40,
    'sk_live_' + 'A' * 24, 'xoxb-fixture-token',
    'eyJ' + 'A' * 12 + '.' + 'B' * 12 + '.' + 'C' * 12,
    'sk-ant-' + 'A' * 24,
    'M' + 'A' * 24 + '.' + 'B' * 6 + '.' + 'C' * 28,
    'AIza' + 'A' * 35, 'hvs.' + 'A' * 24,
    'BEGIN RSA PRIVATE KEY', 'postgres://user:fixturehidden@example.invalid/db',
])
def test_existing_pattern_families_remain_protected(text):
    clean = scrub_output_secrets(text)
    assert clean != text and '[REDACTED]' in clean
    masked = scrub_process_secrets(text.encode())
    assert masked != text.encode() and len(masked) == len(text.encode())
    assert scrub_output_secrets(masked.decode()) == masked.decode()


def test_json_patterns_do_not_consume_closing_quotes_or_other_values():
    source = '{"public":"password=fixturehidden", "ok":"café"}\n'
    assert scrub_output_secrets(source) == '{"public":"[REDACTED]", "ok":"café"}\n'
    assert json.loads(scrub_process_secrets(source.encode()))['ok'] == 'café'


def test_mask_unions_overlaps_and_preserves_original_utf8_coordinates():
    source = '世界 {"password":"sk-' + 'A' * 30 + ' café"}\nbye\n'
    spans = list(iter_secret_spans(source))
    assert len(spans) == 1
    start, end = spans[0]
    raw = source.encode()
    masked = scrub_process_secrets(raw)
    expected = (source[:start].encode() + b'*' * len(source[start:end].encode())
                + source[end:].encode())
    assert masked == expected and len(masked) == len(raw)
    assert scrub_process_secrets(masked) == masked
    assert scrub_process_secrets(b'plain \xff text') == b'plain \xff text'


def test_delivered_passthrough_and_ranked_metadata_are_unchanged():
    delivered = DeliveredOutput('{"token":"already delivered"}')
    assert scrub_output_secrets(delivered) is delivered
    ranked = RankedOutput('ranked {"token":"fixture hidden"}',
                          matches=('{"secret":"full hidden"}',), recovery_required=True)
    clean = scrub_output_secrets(ranked)
    assert isinstance(clean, RankedOutput)
    assert str(clean) == 'ranked {"token":"[REDACTED]"}'
    assert clean.matches == ('{"secret":"[REDACTED]"}',)
    assert clean.recovery_required is True


def test_remote_embedded_source_is_self_contained_and_identical():
    namespace = {}
    exec(embedded_process_scrubber_source(), namespace)
    samples = [b'{"token":42,"password":"fixture hidden"}',
               '世界 {"pass\\u0077ord":"fixture \\"hidden"}'.encode(),
               b'{"password":"partial\\', b'plain \xff text',
               ('sk-' + 'A' * 24).encode()]
    for raw in samples:
        assert namespace['scrub'](raw) == scrub_process_secrets(raw)


def test_json_lines_scaling_and_linear_coordinate_conversion():
    line = ('{"café":"世界", "pass\\u0077ord":"fixture hidden", "token":42}\n').encode()
    small = line * (1024 * 1024 // len(line))
    large = small * 4
    results = []
    for raw in (small, large):
        started = time.perf_counter()
        masked = scrub_process_secrets(raw)
        results.append(time.perf_counter() - started)
        assert len(masked) == len(raw)
        assert b'fixture hidden' not in masked
        assert masked.count(b'"token":42') == raw.count(b'"token":42')
    print(f'JSON-lines mask: {len(small)} bytes={results[0]:.3f}s; '
          f'{len(large)} bytes={results[1]:.3f}s; ratio={results[1] / results[0]:.2f}')
    assert results[1] < results[0] * 8 + 0.5
