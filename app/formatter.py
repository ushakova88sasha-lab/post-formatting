import html
import re

import markdown


def _preprocess_strikethrough(text: str) -> str:
    return re.sub(r"~~([^~\n]+?)~~", r"<del>\1</del>", text)


def _markdown_to_html(text: str) -> str:
    text = _preprocess_strikethrough(text)
    return markdown.markdown(
        text,
        extensions=["fenced_code", "nl2br", "sane_lists"],
        output_format="html5",
    )


def _normalize_inline_tags(html_output: str) -> str:
    html_output = re.sub(r"</?p>", "\n", html_output)
    html_output = re.sub(r"<br\s*/?>", "\n", html_output)
    html_output = re.sub(r"<strong>", "<b>", html_output)
    html_output = re.sub(r"</strong>", "</b>", html_output)
    html_output = re.sub(r"<em>", "<i>", html_output)
    html_output = re.sub(r"</em>", "</i>", html_output)
    html_output = re.sub(r"<del>", "<s>", html_output)
    html_output = re.sub(r"</del>", "</s>", html_output)
    return html_output


def preview_html(text: str) -> str:
    """HTML для превью в браузере (экранированный контент внутри тегов)."""
    if not text.strip():
        return "<p class='empty'>Начните вводить текст…</p>"

    raw_html = _normalize_inline_tags(_markdown_to_html(text))
    allowed = re.compile(
        r"<(/?)(?:h[1-3]|b|i|u|s|code|pre|a|tg-spoiler)(?:\s[^>]*)?>",
        re.IGNORECASE,
    )

    parts = []
    last = 0
    for match in allowed.finditer(raw_html):
        if match.start() > last:
            parts.append(html.escape(raw_html[last : match.start()]))
        parts.append(match.group(0))
        last = match.end()
    if last < len(raw_html):
        parts.append(html.escape(raw_html[last:]))

    result = "".join(parts)
    result = re.sub(r"</h([1-3])>\s*", r"</h\1>", result)
    result = result.replace("\n", "<br>")
    return f'<div class="tg-message">{result}</div>'
