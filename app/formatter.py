import html
import re
from pathlib import Path

import markdown

from app.custom_emoji import CUSTOM_EMOJI_MD_RE

MEDIA_RE = re.compile(
    r'!\[([^\]]*)\]\((https?://[^)\s]+|/uploads/[^)\s]+)(?:\s+"([^"]*)")?\)',
    re.IGNORECASE,
)

_CENTER_BLOCK_RE = re.compile(
    r"<aside>(?P<content>[\s\S]*?)</aside>"
    r"|<pullquote>(?P<pullquote>[\s\S]*?)</pullquote>"
    r'|<p style="text-align:\s*center">(?P<legacy>[\s\S]*?)</p>',
    re.IGNORECASE,
)

_MARKDOWN_EXTENSIONS = ["fenced_code", "nl2br", "sane_lists", "tables"]

CHECKLIST_LINE = re.compile(r"^- \[([ xX])\]\s+(.*)$")

VIDEO_EXT = {".mp4", ".webm", ".mov"}
AUDIO_EXT = {".mp3", ".ogg", ".wav", ".m4a"}

_CYRILLIC_RE = re.compile(r"[\u0400-\u04FF]")


def _media_kind(url: str) -> str:
    ext = Path(url.split("?")[0]).suffix.lower()
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    return "image"


def _preprocess_media(text: str) -> str:
    def repl(match: re.Match) -> str:
        url = html.escape(match.group(2), quote=True)
        caption = match.group(3)
        cap_html = ""
        if caption:
            cap_html = f'<figcaption class="tg-media-caption">{html.escape(caption)}</figcaption>'

        kind = _media_kind(match.group(2))
        if kind == "video":
            return (
                f'<figure class="tg-video-block">'
                f'<video class="tg-video" src="{url}" controls preload="metadata"></video>'
                f"{cap_html}</figure>"
            )
        if kind == "audio":
            return (
                f'<figure class="tg-audio-block">'
                f'<audio class="tg-audio" src="{url}" controls preload="metadata"></audio>'
                f"{cap_html}</figure>"
            )
        return (
            f'<figure class="tg-image-block">'
            f'<img class="tg-image" src="{url}" alt="">'
            f"{cap_html}</figure>"
        )

    return MEDIA_RE.sub(repl, text)


def _preprocess_custom_emoji(text: str, known_ids: set[str] | None = None) -> str:
    """Кастомные (премиум) эмодзи ![alt](tg://emoji?id=...) — браузер не умеет
    загружать tg:// как обычную картинку, поэтому без этой обработки
    markdown-библиотека рисует битую картинку. Если набор с этим эмодзи
    импортирован в Настройках — показываем реальный превью-стикер через
    /api/emoji/preview/<id>, иначе — просто fallback-символ (alt)."""
    known_ids = known_ids or set()

    def repl(match: re.Match) -> str:
        alt = match.group(1) or "✨"
        emoji_id = match.group(2)
        safe_alt = html.escape(alt)
        if emoji_id in known_ids:
            return (
                f'<img class="tg-custom-emoji" src="/api/emoji/preview/{emoji_id}" '
                f'alt="{safe_alt}" title="Кастомный эмодзи">'
            )
        return f'<span class="tg-custom-emoji-fallback" title="Кастомный эмодзи (нет превью)">{safe_alt}</span>'

    return CUSTOM_EMOJI_MD_RE.sub(repl, text)


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


def _preprocess_underscore_italic(text: str) -> str:
    """Python-Markdown does not treat _word_ as emphasis when word contains Cyrillic."""

    def repl(match: re.Match) -> str:
        inner = match.group(1)
        if _CYRILLIC_RE.search(inner):
            return f"*{inner}*"
        return match.group(0)

    return re.sub(r"_([^_\n]+?)_", repl, text)


def _preprocess_rich_inline(text: str) -> str:
    text = _preprocess_underscore_italic(text)
    text = re.sub(r"\$\$(.+?)\$\$", r'<div class="tg-math-block">\1</div>', text, flags=re.DOTALL)
    text = re.sub(r"(?<!\$)\$([^$\n]+?)\$(?!\$)", r'<span class="tg-math">\1</span>', text)
    text = re.sub(r"\|\|([^|\n]+?)\|\|", r'<span class="tg-spoiler">\1</span>', text)
    text = re.sub(r"==([^=\n]+?)==", r'<mark class="tg-mark">\1</mark>', text)
    text = re.sub(r"~~([^~\n]+?)~~", r"<s>\1</s>", text)
    return text


def _render_markdown_chunk(text: str) -> str:
    text = _preprocess_rich_inline(text)
    if not text.strip():
        return ""
    return markdown.markdown(
        text,
        extensions=_MARKDOWN_EXTENSIONS,
        output_format="html5",
    )


def _render_center_block(content: str) -> str:
    inner_html = _render_markdown_chunk(content.strip())
    if not inner_html:
        return "<aside></aside>"
    if (
        inner_html.startswith("<p>")
        and inner_html.endswith("</p>")
        and inner_html.count("<p>") == 1
        and inner_html.count("</p>") == 1
    ):
        inner_html = inner_html[3:-4]
    return f"<aside>{inner_html}</aside>"


def _markdown_to_html(text: str, known_emoji_ids: set[str] | None = None) -> str:
    text = _preprocess_custom_emoji(text, known_emoji_ids)
    text = _preprocess_media(text)
    text = _preprocess_checklists(text)

    parts: list[str] = []
    last = 0
    for match in _CENTER_BLOCK_RE.finditer(text):
        if match.start() > last:
            parts.append(_render_markdown_chunk(text[last : match.start()]))
        content = match.group("content")
        if content is None:
            content = match.group("pullquote") or match.group("legacy") or ""
        parts.append(_render_center_block(content))
        last = match.end()

    if last < len(text):
        parts.append(_render_markdown_chunk(text[last:]))

    return "".join(parts)


ALLOWED_TAG_RE = re.compile(
    r"<(/?)(?:figure|figcaption|img|video|audio|details|summary|blockquote|aside|cite|div|mark|span|br|"
    r"table|thead|tbody|tr|th|td|ul|ol|li|p|h[1-3]|b|strong|i|em|u|s|sub|sup|code|pre|a)(?:\s[^>]*)?>",
    re.IGNORECASE,
)


def _sanitize_html(raw_html: str) -> str:
    parts: list[str] = []
    last = 0
    for match in ALLOWED_TAG_RE.finditer(raw_html):
        if match.start() > last:
            parts.append(html.escape(raw_html[last : match.start()]))
        tag = match.group(0)
        if tag.lower().startswith(("<img", "<video", "<audio")):
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


def preview_html(text: str, known_emoji_ids: set[str] | None = None) -> str:
    """HTML для превью в браузере."""
    if not text.strip():
        return "<p class='empty'>Начните вводить текст…</p>"

    raw_html = _markdown_to_html(text, known_emoji_ids)
    result = _sanitize_html(raw_html)
    return f'<div class="tg-message tg-rich">{result}</div>'
