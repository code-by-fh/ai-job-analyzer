"""PDF render child process: reads one render request as JSON on stdin, writes the PDF to stdout.

Started by services.document_renderer.render_pdf_isolated. It sets its own memory and CPU limits
before rendering; any failure ends the process with a non-zero exit code and writes the exception
type and stack to stderr, which the parent logs. Never the exception message and no library log
records: both can quote the document (a CV is personal data).
"""

import json
import logging
import resource
import sys
import traceback

from services.document_renderer import html_to_pdf

FAILURE_EXIT_CODE = 1


def _apply_limits(memory_bytes: int, cpu_seconds: int) -> None:
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))


def main() -> int:
    # Library warnings (WeasyPrint, fontTools) may quote document CSS or text.
    logging.disable(logging.CRITICAL)
    request = json.loads(sys.stdin.buffer.read())
    _apply_limits(request["memory_bytes"], request["cpu_seconds"])
    try:
        pdf = html_to_pdf(request["html"])
    except BaseException as error:
        sys.stderr.write(type(error).__name__ + "\n" + "".join(traceback.format_tb(error.__traceback__)))
        return FAILURE_EXIT_CODE
    sys.stdout.buffer.write(pdf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
