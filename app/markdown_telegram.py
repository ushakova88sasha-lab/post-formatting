import re

_FENCE_RE = re.compile(r"(```[\s\S]*?```|~~~[\s\S]*?~~~)")
_LIST_MARKER_RE = re.compile(r"^(\s*)([-+*]|\d+\.)\s")
_CHECKLIST_RE = re.compile(r"^(\s*)- \[[ xX]\]\s")


def _is_table_row(line: str) -> bool:
    return line.strip().startswith("|")


def _is_list_line(line: str) -> bool:
    return bool(_LIST_MARKER_RE.match(line)) or bool(_CHECKLIST_RE.match(line))


def _preserve_line_breaks(segment: str) -> str:
    if not segment:
        return segment

    lines = segment.split("\n")
    parts: list[str] = []

    for i, line in enumerate(lines):
        parts.append(line)
        if i + 1 >= len(lines):
            break

        nxt = lines[i + 1]
        if not nxt.strip():
            parts.append("\n")
        elif _is_table_row(line) and _is_table_row(nxt):
            parts.append("\n")
        elif _is_list_line(line) and _is_list_line(nxt):
            parts.append("\n")
        else:
            parts.append("<br>\n")

    return "".join(parts)


def prepare_markdown_for_telegram(markdown: str) -> str:
    """Telegram Rich Markdown схлопывает одиночные переносы — сохраняем их через <br>."""
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    chunks = _FENCE_RE.split(text)
    return "".join(
        chunk if chunk.startswith("```") or chunk.startswith("~~~") else _preserve_line_breaks(chunk)
        for chunk in chunks
    )
