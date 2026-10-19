"""Fill annotated HTML templates with profile data."""

import json

from bs4 import BeautifulSoup, NavigableString
from jinja2 import TemplateError, TemplateSyntaxError, Undefined, nodes
from jinja2.sandbox import ImmutableSandboxedEnvironment, SecurityError

from core.logger import get_logger
from services.bounded_child import ChildLimits, run_child

logger = get_logger(__name__)

# Shown to the user as the generation error; never carries the Jinja2 exception text.
TEMPLATE_REJECTED_MESSAGE = "Die Lebenslauf-Vorlage ist ungültig und wurde abgelehnt."
# Same bound as a stored job document's HTML (routers.jobs.MAX_DOCUMENT_HTML_LENGTH).
MAX_RENDERED_HTML_LENGTH = 1_000_000
MAX_TEMPLATE_VALUE_LENGTH = 100_000
MAX_POWER_RESULT_BITS = 100_000
# Render child limits. Memory and CPU are enforced by the OS inside the child; the wall-clock
# timeout is enforced by the parent, which kills the child.
TEMPLATE_RENDER_MEMORY_BYTES = 512 * 1024 * 1024
TEMPLATE_RENDER_CPU_SECONDS = 15
TEMPLATE_RENDER_TIMEOUT_SECONDS = 20
_CHILD_MODULE = "services.template_render_child"
_MAX_CHILD_OUTPUT_BYTES = MAX_RENDERED_HTML_LENGTH * 4
_PRIVATE_NAME_PREFIX = "_"
_ATTR_FILTER = "attr"
CV_DOC_TYPE = "CV"


class TemplateRejected(ValueError):
    """A user template is unsafe or broken; the message is safe to show to the client."""


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


def has_data_slots(html: str) -> bool:
    """Return True if the HTML contains data-slot or data-repeat annotations."""
    soup = BeautifulSoup(html, "html.parser")
    return bool(
        soup.find(attrs={"data-slot": True}) or soup.find(attrs={"data-repeat": True})
    )


class _BoundedSandboxedEnvironment(ImmutableSandboxedEnvironment):
    """Sandbox that also refuses `*` and `**` results large enough to exhaust memory."""

    intercepted_binops = frozenset({"*", "**"})

    def call_binop(self, context, operator, left, right):
        if operator == "*":
            _check_repetition(left, right)
        elif operator == "**":
            _check_power(left, right)
        return super().call_binop(context, operator, left, right)


def _check_repetition(left, right) -> None:
    sequence, count = (left, right) if hasattr(left, "__len__") else (right, left)
    if hasattr(sequence, "__len__") and isinstance(count, int) and len(sequence) * count > MAX_TEMPLATE_VALUE_LENGTH:
        raise SecurityError("Template value too large")


def _check_power(base, exponent) -> None:
    if isinstance(base, int) and isinstance(exponent, int) and base.bit_length() * exponent > MAX_POWER_RESULT_BITS:
        raise SecurityError("Template value too large")


# CV templates come from users (or from the AI annotating a user upload), so they are untrusted
# code: the sandbox blocks private attributes (the path to os/subprocess) and mutating methods.
# Values are escaped because CV data is AI output influenced by job ads and must not inject
# markup into the PDF; the bundled templates escape the same way.
_jinja_env = _BoundedSandboxedEnvironment(autoescape=True, undefined=Undefined)


def has_jinja2_syntax(html: str) -> bool:
    """Return True if the HTML contains Jinja2 variable or block markers."""
    return "{{" in html or "{%" in html


def render_jinja2_in_process(template_html: str, data: dict) -> str:
    """Render inside the bounded sandbox of THIS process; raises on any failure.

    Only the render child process and tests call this directly: a template can still
    exhaust CPU or memory through filters the sandbox cannot intercept, so production
    code goes through render_jinja2_template, which isolates the render.
    """
    return _render_bounded(_jinja_env.from_string(template_html), data)


def render_jinja2_template(template_html: str, data: dict) -> str:
    """Render a Jinja2-annotated HTML string with the given data dict, isolated from the worker.

    Missing variables render as empty string; values are HTML-escaped. The render runs in a
    short-lived child process (memory, CPU and wall-clock limited), so a hostile template
    can neither pin nor crash the Celery worker. Raises TemplateRejected (fixed message) for
    any failure; the cause is logged, not returned.
    """
    try:
        return _render_in_child(template_html, data)
    except Exception as error:
        # Any failure (limits, crash, ZeroDivisionError, RecursionError, ...) is a user
        # template problem; its text must never reach the client.
        logger.error("CV template rejected while rendering", exc_info=True)
        raise TemplateRejected(TEMPLATE_REJECTED_MESSAGE) from error


def _render_in_child(template_html: str, data: dict) -> str:
    request = json.dumps({
        "template": template_html,
        "data": data,
        "memory_bytes": TEMPLATE_RENDER_MEMORY_BYTES,
        "cpu_seconds": TEMPLATE_RENDER_CPU_SECONDS,
    }).encode("utf-8")
    limits = ChildLimits(TEMPLATE_RENDER_TIMEOUT_SECONDS, _MAX_CHILD_OUTPUT_BYTES)
    return run_child(_CHILD_MODULE, request, limits).decode("utf-8")


def _render_bounded(template, data: dict) -> str:
    """Render chunk by chunk so a template cannot build an unbounded document."""
    chunks, length = [], 0
    for chunk in template.generate(**data):
        length += len(chunk)
        if length > MAX_RENDERED_HTML_LENGTH:
            raise TemplateRejected(TEMPLATE_REJECTED_MESSAGE)
        chunks.append(chunk)
    return "".join(chunks)


def check_jinja2_template(template_html: str) -> None:
    """Reject a template that does not parse or names a private attribute.

    Best-effort defence in depth at save time, easy to bypass (e.g. '_'*2~'init' or
    map(attribute='__init__')) and deliberately not extended: the sandbox in
    render_jinja2_template is the real boundary.
    Raises TemplateRejected with a message that names the problem.
    """
    try:
        template_ast = _jinja_env.parse(template_html)
    except TemplateSyntaxError as error:
        raise TemplateRejected(f"Template is not valid Jinja2 (line {error.lineno})") from error
    accesses = template_ast.find_all((nodes.Getattr, nodes.Getitem, nodes.Filter))
    if any(_is_private_name(_accessed_name(node)) for node in accesses):
        raise TemplateRejected("Template must not access attributes starting with '_'")


def _accessed_name(node: nodes.Node) -> object:
    """The attribute or key a node reads when it is a literal, else None."""
    if isinstance(node, nodes.Getattr):
        return node.attr
    if isinstance(node, nodes.Getitem):
        return getattr(node.arg, "value", None)
    if node.name == _ATTR_FILTER and node.args:
        return getattr(node.args[0], "value", None)
    return None


def _is_private_name(name: object) -> bool:
    return isinstance(name, str) and name.startswith(_PRIVATE_NAME_PREFIX)


def validate_template(template_html: str, doc_type: str) -> str:
    """Parse, sanitise and validate *template_html* for *doc_type*.

    Returns sanitised HTML.
    Raises TemplateRejected (a ValueError) if a CV template fails check_jinja2_template; cover
    letters are never Jinja-rendered, so a literal "{{" in one is legal.
    """
    soup = BeautifulSoup(template_html, "html.parser")

    for script in list(soup.find_all("script")):
        script.decompose()

    for tag in soup.find_all(True):
        for attr in list(tag.attrs):
            if attr.lower().startswith("on"):
                del tag[attr]

    # Checked after sanitising: the parser decodes entities, e.g. &#95; into "_".
    sanitised_html = str(soup)
    if doc_type == CV_DOC_TYPE:
        check_jinja2_template(sanitised_html)
    return sanitised_html
