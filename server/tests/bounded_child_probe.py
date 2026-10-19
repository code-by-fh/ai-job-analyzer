"""Child process for test_bounded_child.py: the request on stdin picks a misbehaviour."""

import sys
import time

FLOOD_BYTES = 1024 * 1024
NOISE_BYTES = 10_000
HANG_SECONDS = 30


def main() -> int:
    request = sys.stdin.buffer.read()
    if request == b"flood":
        sys.stdout.buffer.write(b"x" * FLOOD_BYTES)
        sys.stdout.buffer.flush()
        time.sleep(HANG_SECONDS)
        return 0
    sys.stderr.write("y" * NOISE_BYTES)
    return 1


if __name__ == "__main__":
    sys.exit(main())
