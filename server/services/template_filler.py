"""Fill annotated HTML templates with AI-generated content."""

from bs4 import BeautifulSoup, NavigableString

_REQUIRED_SLOTS: dict[str, set[str]] = {
    "CV": {"name", "role"},
    "COVER_LETTER": {"body"},
}


def fill_template(template_html: str, data: dict) -> str:
    """Replace data-slot / data-repeat annotations with content from *data*."""
    soup = BeautifulSoup(template_html, "html.parser")

    # Repeat blocks first (they contain inner data-slots)
    for repeat_el in list(soup.find_all(attrs={"data-repeat": True})):
        key = repeat_el["data-repeat"]
        items = data.get(key) or []
        parent = repeat_el.parent

        for item in items:
            clone = BeautifulSoup(str(repeat_el), "html.parser").find(
                attrs={"data-repeat": True}
            )
            del clone["data-repeat"]
            for slot in clone.find_all(attrs={"data-slot": True}):
                slot_key = slot["data-slot"]
                slot.clear()
                slot.append(NavigableString(str(item.get(slot_key, ""))))
                del slot["data-slot"]
            parent.append(clone)

        repeat_el.decompose()

    # Simple slots
    for slot_el in list(soup.find_all(attrs={"data-slot": True})):
        key = slot_el["data-slot"]
        value = data.get(key, "")
        slot_el.clear()
        slot_el.append(NavigableString(str(value) if value is not None else ""))
        del slot_el["data-slot"]

    return str(soup)


def validate_template(template_html: str, doc_type: str) -> str:
    """Parse, sanitise and validate *template_html* for *doc_type*.

    Returns sanitised HTML.
    Raises ValueError if required slots are missing.
    """
    soup = BeautifulSoup(template_html, "html.parser")

    for script in list(soup.find_all("script")):
        script.decompose()

    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith("on"):
                del tag[attr]

    required = _REQUIRED_SLOTS.get(doc_type.upper(), set())
    found = {el["data-slot"] for el in soup.find_all(attrs={"data-slot": True})}
    missing = required - found
    if missing:
        raise ValueError(f"Missing required slots for {doc_type}: {', '.join(sorted(missing))}")

    return str(soup)
