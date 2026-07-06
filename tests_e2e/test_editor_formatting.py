"""Регрессионные проверки визуального редактора в реальном браузере.

Каждый тест здесь закрывает конкретный баг, который уже случался в проде:
- потеря разметки форматирования у текста без обёртки в <p> (SALE-1, 2026-07-06);
- дублирование тега при повторном форматировании всего выделения;
- вставка изображения через панель инструментов.

Если что-то из этого падает — не деплоить, пока не разберёшься, что случилось.
"""

import re
import struct
import zlib


def _visual_message(page):
    return page.locator("#editor-visual-content .tg-message")


def _preview_message(page):
    return page.locator("#preview-content .tg-message")


def _textarea(page):
    return page.locator("#post-content")


def _select_all_in_visual(page):
    page.locator("#editor-visual-content .tg-message").click()
    page.keyboard.press("Control+a")


def _make_png_bytes(width: int = 2, height: int = 2) -> bytes:
    """Минимальный валидный PNG без внешних зависимостей (без Pillow)."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + bytes((255, 0, 0)) * width for _ in range(height))
    idat = zlib.compress(raw)
    return signature + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


INLINE_FORMAT_CASES = [
    ("bold", "**Слово**"),
    ("italic", "*Слово*"),
    ("strike", "~~Слово~~"),
    ("underline", "<u>Слово</u>"),
    ("marker", "==Слово=="),
    ("spoiler", "||Слово||"),
    ("code", "`Слово`"),
    ("sub", "<sub>Слово</sub>"),
]


def test_inline_formatting_survives_on_loose_text(app_page):
    """Форматирование первой строки поста (без <p>-обёртки) должно попадать
    и в Markdown, и в превью Telegram — не только выглядеть применённым в
    самом визуальном редакторе."""
    page = app_page

    for action, expected_markdown in INLINE_FORMAT_CASES:
        page.click("#new-post-btn")
        page.wait_for_selector("#editor-view:not(.hidden)", timeout=10000)

        visual = _visual_message(page)
        visual.click()
        page.keyboard.type("Слово")
        page.wait_for_timeout(150)

        _select_all_in_visual(page)
        page.click(f'.fmt-btn[data-action="{action}"]')
        page.wait_for_timeout(350)

        markdown = _textarea(page).input_value().strip()
        assert markdown == expected_markdown, (
            f"{action}: ожидали {expected_markdown!r} в тексте поста, получили {markdown!r}"
        )


def test_multiline_loose_text_each_line_formatted_independently(app_page):
    """Две строки текста без явных абзацев, каждая со своим форматированием —
    именно так выглядел баг, из-за которого превью показывало голый текст."""
    page = app_page

    visual = _visual_message(page)
    visual.click()
    page.keyboard.type("строкамаркер")
    page.keyboard.press("Enter")
    page.keyboard.type("строказачеркнутая")
    page.wait_for_timeout(200)

    page.keyboard.press("Control+Home")
    page.keyboard.press("Shift+ArrowDown")
    page.click('.fmt-btn[data-action="marker"]')
    page.wait_for_timeout(300)

    page.keyboard.press("Control+End")
    page.keyboard.press("Shift+Home")
    page.click('.fmt-btn[data-action="strike"]')
    page.wait_for_timeout(300)

    markdown = _textarea(page).input_value()
    assert "==строкамаркер==" in markdown, markdown
    assert "~~строказачеркнутая~~" in markdown, markdown

    preview_html = _preview_message(page).inner_html()
    assert re.search(r'<mark class="tg-mark">\s*строкамаркер\s*</mark>', preview_html), preview_html
    assert "<s>строказачеркнутая</s>" in preview_html, preview_html


def test_whole_line_format_toggle_does_not_duplicate_tag(app_page):
    """Выделить весь текст строки и нажать кнопку форматирования два раза
    подряд должно включить и выключить формат, а не наложить его дважды."""
    page = app_page

    visual = _visual_message(page)
    visual.click()
    page.keyboard.type("Целая строка текста")
    page.wait_for_timeout(150)

    for _ in range(2):
        visual.click()
        page.keyboard.press("Control+a")
        page.wait_for_timeout(80)
        page.click('.fmt-btn[data-action="h1"]')
        page.wait_for_timeout(250)

    html = visual.inner_html()
    assert "<h1><h1>" not in html, f"тег продублировался: {html}"
    assert html.count("<h1") <= 1, f"тег продублировался: {html}"


def test_image_upload_inserts_into_post_and_preview(app_page, tmp_path):
    """Загрузка картинки через кнопку 📷 должна добавить её и в Markdown,
    и в превью Telegram."""
    page = app_page

    image_path = tmp_path / "test.png"
    image_path.write_bytes(_make_png_bytes())

    page.click('.editor-mode-btn[data-mode="markdown"]')
    page.wait_for_timeout(150)
    _textarea(page).fill("Пост с картинкой\n")

    with page.expect_file_chooser() as fc_info:
        page.click('.fmt-btn[data-action="image"]')
    file_chooser = fc_info.value
    file_chooser.set_files(str(image_path))

    page.wait_for_selector("#media-insert-modal.visible", timeout=10000)
    page.click("#media-insert-confirm")
    page.wait_for_timeout(600)

    markdown = _textarea(page).input_value()
    assert "![](" in markdown and "/uploads/" in markdown, markdown

    preview_html = _preview_message(page).inner_html()
    assert 'class="tg-image"' in preview_html, preview_html
