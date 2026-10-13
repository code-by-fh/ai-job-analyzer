"""Resource policy for the PDF renderers (WeasyPrint and xhtml2pdf).

Rendered HTML is user-edited or AI-generated (prompt injection from a job ad), so it must not
make the renderer read local files (e.g. /proc/self/environ with SECRET_KEY) or send requests
to internal hosts (SSRF). Only data: URLs and files inside the bundled template directory are
loaded; everything else is denied.
"""

import os
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import url2pathname

TEMPLATE_DIR = os.path.realpath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates"))
# xhtml2pdf loads the original URI when its link callback returns a falsy value, so a denied
# resource is replaced by an inline one instead. It must be a decodable image (1x1 transparent
# PNG): xhtml2pdf crashes on an empty resource used as list-style-image or @page background.
DENIED_RESOURCE_URI = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)
# xhtml2pdf (xhtml2pdf/files.py) treats a URI as inline data only on this exact, case-sensitive
# prefix and opens anything else, e.g. "DATA:/x", as a local file path.
_XHTML2PDF_DATA_PREFIX = "data:"

_DATA_SCHEME = "data"
_FILE_SCHEME = "file"
_LOCAL_FILE_HOSTS = frozenset({"", "localhost"})
_ATTACHMENT_LINK_TYPE = "attachment"
_REL_ATTRIBUTE = "rel"


class ResourceDenied(ValueError):
    """A renderer asked for a URL outside the policy; WeasyPrint logs it and skips the resource."""


def _scheme(url: str) -> str:
    return urlsplit(url).scheme.lower()


def _local_path(url: str) -> str | None:
    """Filesystem path named by a local file: URL or a bare path (xhtml2pdf); None otherwise."""
    parts = urlsplit(url)
    if not parts.scheme:
        return url
    if parts.scheme.lower() == _FILE_SCHEME and parts.netloc.lower() in _LOCAL_FILE_HOSTS:
        return url2pathname(parts.path)
    return None


def allowed_template_file(url: str) -> str | None:
    """Return the real path of *url* if it resolves inside TEMPLATE_DIR, else None.

    The path is resolved with realpath first, so `..` segments (also percent-encoded) and
    symlinks pointing out of the directory are rejected.
    """
    path = _local_path(url)
    if path is None:
        return None
    try:
        real_path = os.path.realpath(path)
    except ValueError:  # embedded NUL byte (e.g. %00): no valid path, so nothing to allow
        return None
    return real_path if os.path.commonpath([real_path, TEMPLATE_DIR]) == TEMPLATE_DIR else None


def safe_url_fetcher(url: str):
    """WeasyPrint `url_fetcher`: fetch data: URLs and template files, deny everything else.

    Returns a `weasyprint.urls.URLFetcherResponse`. Raises ResourceDenied for any other URL.
    """
    from weasyprint.urls import URLFetcher  # Deferred: WeasyPrint requires GTK libs not available on all hosts

    fetcher = URLFetcher(allowed_protocols={_DATA_SCHEME, _FILE_SCHEME}, allow_redirects=False)
    if _scheme(url) == _DATA_SCHEME:
        return fetcher.fetch(url)
    template_file = allowed_template_file(url)
    if template_file is None:
        raise ResourceDenied(f"Resource URL not allowed in PDF rendering: {url}")
    # Fetch the resolved path, not the original URL, so the checked file is the one read.
    return fetcher.fetch(Path(template_file).as_uri())


def xhtml2pdf_link_callback(uri, rel):
    """xhtml2pdf `link_callback`: return the URI to load in place of *uri*.

    data: URIs pass unchanged, template files become their real path, anything else becomes
    DENIED_RESOURCE_URI. Non-string values (internal buffers) are passed through.
    """
    if not isinstance(uri, str):
        return uri
    if uri.startswith(_XHTML2PDF_DATA_PREFIX):
        return uri
    return allowed_template_file(uri) or DENIED_RESOURCE_URI


def strip_attachment_links(root) -> None:
    """Remove every `rel` value that contains "attachment" from the parsed HTML tree *root*.

    WeasyPrint embeds the target of `<link rel="attachment">` and `<a rel="attachment">` into
    the PDF. Without the `rel` the element is inert. The URL fetcher denies such targets as well;
    this keeps attachments out even if the fetch policy is ever widened.
    """
    for element in root.iter():
        if _ATTACHMENT_LINK_TYPE in element.get(_REL_ATTRIBUTE, "").lower():
            del element.attrib[_REL_ATTRIBUTE]
