import re

DEFAULT_POST_TITLE = "Новый пост"
_TITLE_MAX_LEN = 60

_IMAGE_RE = re.compile(r'!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)')

_PAIR_MARKERS = (
    (r"\*\*", r"\*\*"),
    (r"__", r"__"),
    (r"~~", r"~~"),
    (r"==", r"=="),
    (r"\|\|", r"\|\|"),
    (r"\^\^", r"\^\^"),
    (r"`", r"`"),
)

_SINGLE_LINE_MARKERS = (
    (r"\*\*", r"\*\*"),
    (r"__", r"__"),
    (r"~~", r"~~"),
    (r"==", r"=="),
    (r"\|\|", r"\|\|"),
    (r"\^\^", r"\^\^"),
    (r"`", r"`"),
    (r"_", r"_"),
)


def is_generic_title(title: str) -> bool:
    normalized = strip_markdown((title or "").strip()).casefold()
    return not normalized or normalized in {DEFAULT_POST_TITLE.casefold(), "без названия"}


def strip_markdown(text: str) -> str:
    """Убирает разметку редактора — для отображения в списке постов."""
    if not text:
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"~~~[\s\S]*?~~~", " ", text)
    text = re.sub(
        r"<details>\s*<summary>([\s\S]*?)</summary>[\s\S]*?</details>",
        r"\1",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<pullquote>([\s\S]*?)</pullquote>", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r'<p style="text-align:\s*center">([\s\S]*?)</p>', r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = _IMAGE_RE.sub(lambda match: (match.group(3) or match.group(1) or " "), text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-+*]\s+\[[ xX]\]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-+*]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\|.*\|$", " ", text, flags=re.MULTILINE)
    text = re.sub(r":?-{3,}:?", " ", text)

    for before, after in _PAIR_MARKERS:
        text = re.sub(rf"{before}(.+?){after}", r"\1", text, flags=re.DOTALL)

    for before, after in _SINGLE_LINE_MARKERS:
        text = re.sub(rf"{before}([^\\n]+?){after}", r"\1", text)

    text = re.sub(r"[*_~`|\\[\\](){}#>+\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _truncate_title(text: str, *, max_len: int = _TITLE_MAX_LEN) -> str:
    if len(text) <= max_len:
        return text

    truncated = text[:max_len]
    last_space = truncated.rfind(" ")
    if last_space > 20:
        return truncated[:last_space] + "…"
    return truncated + "…"


def _content_snippets(content: str) -> list[str]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    snippets: list[str] = []
    seen: set[str] = set()

    def add(snippet: str) -> None:
        snippet = snippet.strip()
        if snippet and snippet not in seen:
            seen.add(snippet)
            snippets.append(snippet)

    for paragraph in normalized.split("\n\n"):
        for line in paragraph.split("\n"):
            add(line)

    add(normalized)
    return snippets


def title_from_content(content: str, *, max_len: int = _TITLE_MAX_LEN) -> str:
    """Первые слова поста без markdown — для списка постов."""
    if not content or not content.strip():
        return ""

    for snippet in _content_snippets(content):
        text = strip_markdown(snippet)
        if text and not is_generic_title(text):
            return _truncate_title(text, max_len=max_len)

    text = strip_markdown(content)
    if text and not is_generic_title(text):
        return _truncate_title(text, max_len=max_len)
    return ""


def display_post_title(title: str, content: str) -> str:
    from_content = title_from_content(content)
    if is_generic_title(title) and from_content:
        return from_content

    normalized = strip_markdown((title or "").strip())
    if normalized and not is_generic_title(normalized):
        return _truncate_title(normalized)

    return from_content or "Без названия"


def maybe_fix_generic_title(title: str, content: str) -> str | None:
    """Новый заголовок для БД, если сейчас стоит шаблонный."""
    if not is_generic_title(title):
        return None
    derived = title_from_content(content)
    return derived or None
