"""The file gate and the bookkeeping for problems found in an upload.

A file the app can never read is refused outright with an HTTP error. A file it
can read but that holds something wrong is not an HTTP error: the problem is
recorded as an issue with the file, the place in it and a plain sentence, so a
teacher can fix the spreadsheet and try again.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Literal

from backend import config

TEXT_EXTENSIONS = (".csv", ".json", ".txt", ".md")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_KIND_BY_EXTENSION = {
    ".pdf": "PDF", ".doc": "Word", ".docx": "Word", ".odt": "Word", ".rtf": "Word",
    ".xls": "Excel", ".xlsx": "Excel", ".ods": "spreadsheet", ".numbers": "Numbers",
    ".ppt": "PowerPoint", ".pptx": "PowerPoint", ".pages": "Pages", ".zip": "zip",
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".heic": "image",
    ".bmp": "image", ".tif": "image", ".tiff": "image", ".webp": "image",
}
# What a binary file looks like once a browser has read it as text. A bare 0x89
# or 0xff byte becomes U+FFFD, so the signatures are listed both ways.
_SIGNATURES = (
    ("%PDF", "PDF"), ("PK\x03\x04", "Word or Excel"), ("\xd0\xcf\x11\xe0", "Word or Excel"),
    ("\ufffdPNG", "image"), ("\ufffd\ufffd\ufffd", "image"), ("GIF8", "image"),
)

Slot = Literal["paper", "sheets"]
_WHAT: dict[str, str] = {"paper": "test", "sheets": "answer sheets"}


class UploadRejected(Exception):
    """A file the app will not read at all. Mapped to an HTTP error by the router."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass
class Issues:
    errors: list[dict[str, str]] = field(default_factory=list)
    warnings: list[dict[str, str]] = field(default_factory=list)

    def error(self, file: str, where: str, message: str) -> None:
        self.errors.append({"file": file, "where": where, "message": message})

    def warn(self, file: str, where: str, message: str) -> None:
        self.warnings.append({"file": file, "where": where, "message": message})


def display_name(name: str) -> str:
    """The file name only, for messages. Whatever the client sent is never a path."""
    base = PurePosixPath(name.replace("\\", "/")).name.strip()
    return (base or "file")[:80]


def _unsupported(kind: str, slot: Slot) -> UploadRejected:
    return UploadRejected(
        400, "UNSUPPORTED_FILE",
        f"We can't read {kind} files yet. Save your {_WHAT[slot]} as CSV, or use our template.")


def _sniffed_kind(content: str) -> str | None:
    for signature, kind in _SIGNATURES:
        if content.startswith(signature):
            return kind
    return "binary" if "\x00" in content else None


def check_file(slot: Slot, name: str, content: str, issues: Issues) -> str | None:
    """Gate one file. Returns its cleaned text, or None when the content is unusable.

    Raises UploadRejected for a file type we cannot read (400) or a file over the
    size limit (413). Order matters: the extension is judged first, then the size,
    then the bytes, so a huge PDF is refused for being a PDF and nothing is parsed
    before it has passed all three.
    """
    shown = display_name(name)
    extension = PurePosixPath(shown.lower()).suffix
    if extension not in TEXT_EXTENSIONS:
        raise _unsupported(_KIND_BY_EXTENSION.get(extension, extension or "these"), slot)
    if len(content.encode("utf-8", "replace")) > config.UPLOAD_MAX_BYTES:
        raise UploadRejected(
            413, "FILE_TOO_LARGE",
            f"{shown} is larger than {config.UPLOAD_MAX_BYTES // 1_000_000} MB. "
            f"Split it into smaller files.")
    kind = _sniffed_kind(content)
    if kind:
        raise _unsupported(kind, slot)
    text = content.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    if "\ufffd" in text:
        issues.error(shown, "whole file", "This file has characters we can't read. Save it "
                     "again as UTF-8 (in a spreadsheet: Save as, CSV UTF-8).")
        return None
    if not text.strip():
        issues.error(shown, "whole file", "This file is empty.")
        return None
    return text


def clean_email(value: str) -> str:
    """The address if it looks like one, otherwise an empty string."""
    value = value.strip()
    return value if EMAIL_PATTERN.match(value) else ""


def join_numbers(numbers: list[int], noun: str = "question") -> str:
    """'question 3', 'questions 3 and 5', 'questions 1, 2 and 4'."""
    shown = [str(n) for n in numbers]
    if len(shown) == 1:
        return f"{noun} {shown[0]}"
    return f"{noun}s {', '.join(shown[:-1])} and {shown[-1]}"
