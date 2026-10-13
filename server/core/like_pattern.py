"""ILIKE patterns that match user text literally (%, _ and the escape character lose their meaning)."""

LIKE_ESCAPE = "\\"


def contains_pattern(text: str) -> str:
    """Pattern for `column.ilike(pattern, escape=LIKE_ESCAPE)` that finds *text* anywhere, literally."""
    escaped = text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2).replace("%", r"\%").replace("_", r"\_")
    return f"%{escaped}%"
