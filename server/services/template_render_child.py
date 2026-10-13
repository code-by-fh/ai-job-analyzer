"""Render child process: reads one render request as JSON on stdin, writes the HTML to stdout.

Started by services.template_filler.render_jinja2_template. It sets its own memory and CPU
limits before touching the template; any failure ends the process with a non-zero exit code.
"""

import json
import resource
import sys

from services.template_filler import render_jinja2_in_process

FAILURE_EXIT_CODE = 1


def _apply_limits(memory_bytes: int, cpu_seconds: int) -> None:
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))


def main() -> int:
    request = json.loads(sys.stdin.buffer.read())
    _apply_limits(request["memory_bytes"], request["cpu_seconds"])
    try:
        html = render_jinja2_in_process(request["template"], request["data"])
    except BaseException:
        return FAILURE_EXIT_CODE
    sys.stdout.buffer.write(html.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
