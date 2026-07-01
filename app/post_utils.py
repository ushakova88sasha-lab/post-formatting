import re

DEFAULT_POST_TITLE = "Новый пост"
_TITLE_MAX_LEN = 60

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


def strip_markdown(text: str) -> str:
    """Убирает разметку редактора — для отображения в списке постов."""
    if not text:
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"~~~[\s\S]*?~~~", " ", text)
    text = re.sub(r"<details>[\s\S]*?</details>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
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


def title_from_content(content: str, *, max_len: int = _TITLE_MAX_LEN) -> str:
    """Первые слова поста без markdown — для списка постов."""
    if not content or not content.strip():
        return ""

    snippet = content.strip().split("\n\n")[0].split("\n")[0]
    text = strip_markdown(snippet)
    if not text:
        return ""

    return _truncate_title(text, max_len=max_len)


def display_post_title(title: str, content: str) -> str:
    normalized = strip_markdown((title or "").strip())
    if normalized and normalized != DEFAULT_POST_TITLE:
        return _truncate_title(normalized)

    from_content = title_from_content(content)
    if from_content:
        return from_content

    return normalized or "Без названия"
