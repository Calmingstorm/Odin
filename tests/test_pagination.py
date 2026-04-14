"""Tests for pagination helpers."""

from src.discord.helpers.pagination import paginate_items


class TestPaginateItems:
    def test_empty_items(self):
        pages = paginate_items([], "Empty")
        assert len(pages) == 1
        assert "No items" in pages[0].description

    def test_single_page(self):
        items = [f"Item {i}" for i in range(5)]
        pages = paginate_items(items, "Test", page_size=10)
        assert len(pages) == 1
        assert "Item 0" in pages[0].description

    def test_multiple_pages(self):
        items = [f"Item {i}" for i in range(25)]
        pages = paginate_items(items, "Test", page_size=10)
        assert len(pages) == 3
        assert "Page 1/3" in pages[0].footer.text
        assert "Page 3/3" in pages[2].footer.text

    def test_exact_page_boundary(self):
        items = [f"Item {i}" for i in range(10)]
        pages = paginate_items(items, "Test", page_size=10)
        assert len(pages) == 1
