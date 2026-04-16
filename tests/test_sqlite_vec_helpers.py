"""Tests for SQLite vector search helpers (src/search/sqlite_vec.py).

Covers serialize_vector, deserialize_vector roundtrip and edge cases,
and load_extension with mocked sqlite_vec import.
"""
from __future__ import annotations

import struct
from unittest.mock import MagicMock, patch

import pytest

from src.search.sqlite_vec import deserialize_vector, load_extension, serialize_vector


# ---------------------------------------------------------------------------
# serialize_vector
# ---------------------------------------------------------------------------

class TestSerializeVector:
    def test_basic_serialization(self):
        vec = [1.0, 2.0, 3.0]
        result = serialize_vector(vec)
        assert isinstance(result, bytes)
        assert len(result) == 3 * 4  # 3 floats × 4 bytes each

    def test_empty_vector(self):
        result = serialize_vector([])
        assert result == b""

    def test_single_element(self):
        result = serialize_vector([42.0])
        assert len(result) == 4
        unpacked = struct.unpack("1f", result)
        assert abs(unpacked[0] - 42.0) < 1e-6

    def test_known_values(self):
        vec = [1.0, -1.0, 0.0]
        result = serialize_vector(vec)
        expected = struct.pack("3f", 1.0, -1.0, 0.0)
        assert result == expected

    def test_large_vector(self):
        vec = [float(i) for i in range(384)]
        result = serialize_vector(vec)
        assert len(result) == 384 * 4


# ---------------------------------------------------------------------------
# deserialize_vector
# ---------------------------------------------------------------------------

class TestDeserializeVector:
    def test_basic_deserialization(self):
        data = struct.pack("3f", 1.0, 2.0, 3.0)
        result = deserialize_vector(data, 3)
        assert len(result) == 3
        assert abs(result[0] - 1.0) < 1e-6
        assert abs(result[1] - 2.0) < 1e-6
        assert abs(result[2] - 3.0) < 1e-6

    def test_empty_deserialization(self):
        result = deserialize_vector(b"", 0)
        assert result == []

    def test_single_element(self):
        data = struct.pack("1f", 3.14)
        result = deserialize_vector(data, 1)
        assert len(result) == 1
        assert abs(result[0] - 3.14) < 1e-4


# ---------------------------------------------------------------------------
# Roundtrip
# ---------------------------------------------------------------------------

class TestRoundtrip:
    def test_roundtrip_basic(self):
        vec = [1.0, 2.5, -3.7, 0.0, 100.0]
        data = serialize_vector(vec)
        result = deserialize_vector(data, len(vec))
        for a, b in zip(vec, result):
            assert abs(a - b) < 1e-5

    def test_roundtrip_384_dim(self):
        """Test with the embedding dimension used by the project (384)."""
        vec = [float(i) / 384.0 for i in range(384)]
        data = serialize_vector(vec)
        result = deserialize_vector(data, 384)
        assert len(result) == 384
        for a, b in zip(vec, result):
            assert abs(a - b) < 1e-5

    def test_roundtrip_negative_values(self):
        vec = [-1.0, -0.5, -100.0]
        data = serialize_vector(vec)
        result = deserialize_vector(data, 3)
        for a, b in zip(vec, result):
            assert abs(a - b) < 1e-5


# ---------------------------------------------------------------------------
# load_extension
# ---------------------------------------------------------------------------

class TestLoadExtension:
    def test_load_extension_success(self):
        mock_conn = MagicMock()
        mock_sqlite_vec = MagicMock()
        with patch.dict("sys.modules", {"sqlite_vec": mock_sqlite_vec}):
            result = load_extension(mock_conn)
        assert result is True
        mock_conn.enable_load_extension.assert_called_once_with(True)
        mock_sqlite_vec.load.assert_called_once_with(mock_conn)

    def test_load_extension_import_error(self):
        mock_conn = MagicMock()
        with patch.dict("sys.modules", {"sqlite_vec": None}):
            # When module is None in sys.modules, import raises ImportError
            result = load_extension(mock_conn)
        assert result is False

    def test_load_extension_runtime_error(self):
        mock_conn = MagicMock()
        mock_conn.enable_load_extension.side_effect = RuntimeError("not supported")
        result = load_extension(mock_conn)
        assert result is False
