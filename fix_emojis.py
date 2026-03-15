import re

EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "\u23F0\u23F3\u2705\u274C\u274E"
    "]+",
    flags=re.UNICODE,
)

FILES = [
    "server/worker.py",
    "server/api.py",
    "server/scraper_api.py",
]

for path in FILES:
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    def strip_emoji_from_log(match):
        line = match.group(0)
        return EMOJI_PATTERN.sub("", line).replace("  ", " ").replace('" "', '" "')

    new_content = re.sub(r'logger\.(info|debug|warning|error|warning)\(.*\)', strip_emoji_from_log, content)

    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Fixed: {path}")
    else:
        print(f"No changes: {path}")
