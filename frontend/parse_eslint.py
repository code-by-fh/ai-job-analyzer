import json


def process_eslint():
    with open("eslint_report.json", "r", encoding="utf-16le") as f:
        data = json.load(f)

    for file in data:
        if file["errorCount"] > 0 or file["warningCount"] > 0:
            print(f"File: {file['filePath']}")
            for msg in file["messages"]:
                print(f"  Line {msg['line']}: {msg['message']} ({msg['ruleId']})")


if __name__ == "__main__":
    process_eslint()
