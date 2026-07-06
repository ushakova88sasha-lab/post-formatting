from app.formatter import preview_html
from app.markdown_telegram import prepare_markdown_for_telegram


def test_marker_highlight_in_preview():
    html = preview_html("Текст с ==маркером== внутри")
    assert '<mark class="tg-mark">маркером</mark>' in html


def test_bold_in_preview():
    html = preview_html("Текст **жирный** внутри")
    assert "<strong>жирный</strong>" in html
    assert "&lt;strong&gt;" not in html


def test_center_align_in_preview():
    html = preview_html("<aside>По центру</aside>")
    assert "<aside>По центру</aside>" in html
    assert "&lt;aside&gt;" not in html


def test_center_legacy_pullquote_in_preview():
    html = preview_html("<pullquote>Старый формат</pullquote>")
    assert "<aside>Старый формат</aside>" in html


def test_center_legacy_paragraph_in_preview():
    html = preview_html('<p style="text-align: center">Старый формат</p>')
    assert "<aside>Старый формат</aside>" in html


def test_center_with_surrounding_text():
    html = preview_html("Слева\n\n<aside>Центр</aside>\n\nСправа")
    assert "<aside>Центр</aside>" in html
    assert "Слева" in html
    assert "Справа" in html


def test_marker_and_center_together():
    html = preview_html("<aside>==Важно==</aside>")
    assert "<aside>" in html
    assert '<mark class="tg-mark">Важно</mark>' in html


def test_center_prepared_for_telegram():
    prepared = prepare_markdown_for_telegram("<aside>Строка 1\nСтрока 2</aside>")
    assert "<aside>" in prepared
    assert "<br>" in prepared


def test_uploaded_image_in_preview():
    html = preview_html("![](/uploads/photo.png)\n\nТекст под фото")
    assert 'class="tg-image"' in html
    assert "/uploads/photo.png" in html
    assert "Текст под фото" in html


def test_cyrillic_italic_in_preview():
    html = preview_html("Обычный *курсив* текст")
    assert "<em>курсив</em>" in html


def test_cyrillic_underscore_italic_in_preview():
    html = preview_html("Обычный _курсив_ текст")
    assert "<em>курсив</em>" in html
