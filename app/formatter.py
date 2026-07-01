import html
import re

import markdown

IMAGE_RE = re.compile(
    r'!\[([^\]]*)\]\((https?://[^)\s]+)(?:\s+"([^"]*)")?\)',
    re.IGNORECASE,
)

CHECKLIST_LINE = re.compile(r"^- \[([ xX])\]\s+(.*)$")
LIST_LINE = re.compile(r"^(\s*)([-*+]|\d+\.)\s+(.*)$")


def _preprocess_images(text: str) -> str:
    def repl(match: re.Match) -> str:
        url = html.escape(match.group(2), quote=True)
        caption = match.group(3)
        if caption:
            cap = html.escape(caption)
            return (
                f'<figure class="tg-image-block">'
                f'<img class="tg-image" src="{url}" alt="">'
                f'<figcaption class="tg-image-caption">{cap}</figcaption>'
                f"</figure>"
            )
        return f'<figure class="tg-image-block"><img class="tg-image" src="{url}" alt=""></figure>'

    return IMAGE_RE.sub(repl, text)


def _preprocess_checklists(text: str) -> str:
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        m = CHECKLIST_LINE.match(lines[i])
        if m:
            items: list[str] = []
            while i < len(lines):
                m = CHECKLIST_LINE.match(lines[i])
                if not m:
                    break
                checked = m.group(1).lower() == "x"
                cls = "tg-check checked" if checked else "tg-check"
                items.append(f'<li class="{cls}">{html.escape(m.group(2))}</li>')
                i += 1
            out.append('<ul class="tg-checklist">' + "".join(items) + "</ul>")
        else:
            out.append(lines[i])
            i += 1
    return "\n".join(out)


def _preprocess_rich_inline(text: str) -> str:
    text = re.sub(r"\$\$(.+?)\$\$", r'<div class="tg-math-block">\1</div>', text, flags=re.DOTALL)
    text = re.sub(r"(?<!\$)\$([^$\n]+?)\$(?!\$)", r'<span class="tg-math">\1</span>', text)
    text = re.sub(r"\|\|([^|\n]+?)\|\|", r'<span class="tg-spoiler">\1</span>', text)
    text = re.sub(r"==([^=\n]+?)==", r'<mark class="tg-mark">\1</mark>', text)
    text = re.sub(r"~~([^~\n]+?)~~", r"<s>\1</s>", text)
    return text


def _markdown_to_html(text: str) -> str:
    text = _preprocess_images(text)
    text = _preprocess_checklists(text)
    text = _preprocess_rich_inline(text)
    return markdown.markdown(
        text,
        extensions=["fenced_code", "nl2br", "sane_lists", "tables"],
        output_format="html5",
    )


ALLOWED_TAG_RE = re.compile(
    r"<(/?)(?:figure|figcaption|img|div|mark|span|table|thead|tbody|tr|th|td|"
    r"ul|ol|li|p|h[1-3]|b|i|u|s|sub|sup|code|pre|a)(?:\s[^>]*)?>",
    re.IGNORECASE,
)


def _sanitize_html(raw_html: str) -> str:
    parts: list[str] = []
    last = 0
    for match in ALLOWED_TAG_RE.finditer(raw_html):
        if match.start() > last:
            parts.append(html.escape(raw_html[last : match.start()]))
        tag = match.group(0)
        if tag.lower().startswith("<img"):
            tag = re.sub(
                r'src="([^"]*)"',
                lambda m: f'src="{html.escape(m.group(1), quote=True)}"',
                tag,
                flags=re.IGNORECASE,
            )
        elif tag.lower().startswith("<a "):
            tag = re.sub(
                r'href="([^"]*)"',
                lambda m: f'href="{html.escape(m.group(1), quote=True)}"',
                tag,
                flags=re.IGNORECASE,
            )
        parts.append(tag)
        last = match.end()
    if last < len(raw_html):
        parts.append(html.escape(raw_html[last:]))
    return "".join(parts)


def preview_html(text: str) -> str:
    """HTML для превью в браузере."""
    if not text.strip():
        return "<p class='empty'>Начните вводить текст…</p>"

    raw_html = _markdown_to_html(text)
    result = _sanitize_html(raw_html)
    return f'<div class="tg-message tg-rich">{result}</div>'
