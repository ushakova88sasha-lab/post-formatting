import re

_FENCE_RE = re.compile(r"(```[\s\S]*?```|~~~[\s\S]*?~~~)")
_CENTER_BLOCK_RE = re.compile(
    r"<aside>[\s\S]*?</aside>"
    r"|<pullquote>[\s\S]*?</pullquote>"
    r'|<p style="text-align:\s*center">[\s\S]*?</p>',
    re.IGNORECASE,
)
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
        # Пустая строка — разделитель абзацев (двойной перенос), не <br>
        if not line.strip() or not nxt.strip():
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
    parts: list[str] = []
    for chunk in chunks:
        if chunk.startswith("```") or chunk.startswith("~~~"):
            parts.append(chunk)
            continue
        parts.append(_preserve_with_center_blocks(chunk))
    return "".join(parts)


def _preserve_with_center_blocks(segment: str) -> str:
    if not segment:
        return segment

    parts: list[str] = []
    last = 0
    for match in _CENTER_BLOCK_RE.finditer(segment):
        if match.start() > last:
            parts.append(_preserve_line_breaks(segment[last : match.start()]))
        parts.append(_preserve_line_breaks(match.group(0)))
        last = match.end()

    if last < len(segment):
        parts.append(_preserve_line_breaks(segment[last:]))
    return "".join(parts)
