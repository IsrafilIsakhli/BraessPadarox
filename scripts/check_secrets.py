"""Check tracked files or branch/tag history without printing secret values."""

import argparse
import re
import subprocess
import sys


PATTERNS = {
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "GitHub token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})"),
    "OpenAI key": re.compile(rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}"),
    "AWS access key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "Google API key": re.compile(rb"\bAIza[A-Za-z0-9_-]{30,}"),
    "assigned secret": re.compile(
        rb"(?i)[\"']?\b(?:[a-z0-9]+[_-])*(?:api[_-]?key|secret|access[_-]?token|password)"
        rb"[\"']?\s*[:=]\s*[\"']?([a-z0-9_+/=\-]{20,})"
    ),
}


def git(*args):
    return subprocess.check_output(["git", *args])


def scan(path, data, revision="working tree"):
    findings = []
    for kind, pattern in PATTERNS.items():
        for match in pattern.finditer(data):
            line = data.count(b"\n", 0, match.start()) + 1
            findings.append(f"{revision} {path}:{line}: {kind} (value hidden)")
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all-history", action="store_true")
    args = parser.parse_args()
    findings = []
    checked = 0
    if args.all_history:
        # Only publishable branches and tags; tooling/backup refs are not pushed.
        rows = git("rev-list", "--objects", "--branches", "--tags").splitlines()
        for row in rows:
            oid, sep, path = row.partition(b" ")
            if not sep or git("cat-file", "-t", oid.decode()).strip() != b"blob":
                continue
            data = git("cat-file", "blob", oid.decode())
            findings.extend(scan(path.decode(errors="replace"), data, oid[:12].decode()))
            checked += 1
    else:
        from pathlib import Path

        for raw in git("ls-files", "-z").split(b"\0"):
            if not raw:
                continue
            path = Path(raw.decode("utf-8"))
            if path.is_file():
                findings.extend(scan(str(path), path.read_bytes()))
                checked += 1
    for finding in findings:
        print(finding)
    print(f"Checked {checked} files/versions; {len(findings)} potential secrets.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
