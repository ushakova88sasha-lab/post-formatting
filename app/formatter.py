import html
import re

import markdown


def markdown_to_telegram_html(text: str) -> str:
    """Конвертирует Markdown в HTML, совместимый с Telegram Bot API."""
    if not text.strip():
        return ""

    html_output = markdown.markdown(
        text,
        extensions=["fenced_code", "nl2br", "sane_lists"],
        output_format="html5",
    )

    html_output = re.sub(r"</?p>", "\n", html_output)
    html_output = re.sub(r"<br\s*/?>", "\n", html_output)
    html_output = re.sub(r"<strong>", "<b>", html_output)
    html_output = re.sub(r"</strong>", "</b>", html_output)
    html_output = re.sub(r"<em>", "<i>", html_output)
    html_output = re.sub(r"</em>", "</i>", html_output)
    html_output = re.sub(r"<del>", "<s>", html_output)
    html_output = re.sub(r"</del>", "</s>", html_output)

    html_output = html_output.strip()
    html_output = re.sub(r"\n{3,}", "\n\n", html_output)

    return html_output


def preview_html(text: str) -> str:
    """HTML для превью в браузере (экранированный контент внутри тегов)."""
    if not text.strip():
        return "<p class='empty'>Начните вводить текст…</p>"

    tg_html = markdown_to_telegram_html(text)
    allowed = re.compile(
        r"<(/?)(?:b|i|u|s|code|pre|a|tg-spoiler)(?:\s[^>]*)?>",
        re.IGNORECASE,
    )

    parts = []
    last = 0
    for match in allowed.finditer(tg_html):
        if match.start() > last:
            parts.append(html.escape(tg_html[last : match.start()]))
        parts.append(match.group(0))
        last = match.end()
    if last < len(tg_html):
        parts.append(html.escape(tg_html[last:]))

    result = "".join(parts).replace("\n", "<br>")
    return f'<div class="tg-message">{result}</div>'
