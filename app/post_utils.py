import re

DEFAULT_POST_TITLE = "Новый пост"
_TITLE_MAX_LEN = 60


def title_from_content(content: str, *, max_len: int = _TITLE_MAX_LEN) -> str:
    """Первые слова поста без markdown — для списка постов."""
    if not content or not content.strip():
        return ""

    text = content
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"#{1,6}\s+", "", text)
    text = re.sub(r"[*_~`>|\\[\\](){}-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""

    if len(text) <= max_len:
        return text

    truncated = text[:max_len]
    last_space = truncated.rfind(" ")
    if last_space > 20:
        return truncated[:last_space] + "…"
    return truncated + "…"


def display_post_title(title: str, content: str) -> str:
    normalized = (title or "").strip()
    if normalized and normalized != DEFAULT_POST_TITLE:
        return normalized

    from_content = title_from_content(content)
    if from_content:
        return from_content

    return normalized or "Без названия"
