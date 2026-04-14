"""Tests for custom converters."""

from datetime import timedelta
from unittest.mock import MagicMock

import pytest

from src.discord.helpers.converters import DurationConverter, ReasonConverter


class TestDurationConverter:
    @pytest.fixture
    def converter(self):
        return DurationConverter()

    @pytest.fixture
    def ctx(self):
        return MagicMock()

    @pytest.mark.asyncio
    async def test_seconds_only(self, converter, ctx):
        result = await converter.convert(ctx, "60")
        assert result == timedelta(seconds=60)

    @pytest.mark.asyncio
    async def test_minutes(self, converter, ctx):
        result = await converter.convert(ctx, "30m")
        assert result == timedelta(minutes=30)

    @pytest.mark.asyncio
    async def test_hours_minutes(self, converter, ctx):
        result = await converter.convert(ctx, "1h30m")
        assert result == timedelta(hours=1, minutes=30)

    @pytest.mark.asyncio
    async def test_full_format(self, converter, ctx):
        result = await converter.convert(ctx, "1d2h30m10s")
        assert result == timedelta(days=1, hours=2, minutes=30, seconds=10)

    @pytest.mark.asyncio
    async def test_invalid_format(self, converter, ctx):
        from discord.ext.commands import BadArgument

        with pytest.raises(BadArgument):
            await converter.convert(ctx, "abc")


class TestReasonConverter:
    @pytest.fixture
    def converter(self):
        return ReasonConverter()

    @pytest.fixture
    def ctx(self):
        return MagicMock()

    @pytest.mark.asyncio
    async def test_valid_reason(self, converter, ctx):
        result = await converter.convert(ctx, "Breaking rules")
        assert result == "Breaking rules"

    @pytest.mark.asyncio
    async def test_too_long(self, converter, ctx):
        from discord.ext.commands import BadArgument

        with pytest.raises(BadArgument):
            await converter.convert(ctx, "x" * 513)
