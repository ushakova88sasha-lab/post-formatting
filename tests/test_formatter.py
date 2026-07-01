from app.formatter import preview_html
from app.markdown_telegram import prepare_markdown_for_telegram


def test_marker_highlight_in_preview():
    html = preview_html("Текст с ==маркером== внутри")
    assert '<mark class="tg-mark">маркером</mark>' in html


def test_center_align_in_preview():
    html = preview_html("<pullquote>По центру</pullquote>")
    assert "<pullquote>По центру</pullquote>" in html
    assert "&lt;pullquote&gt;" not in html


def test_center_legacy_paragraph_in_preview():
    html = preview_html('<p style="text-align: center">Старый формат</p>')
    assert "<pullquote>Старый формат</pullquote>" in html


def test_center_with_surrounding_text():
    html = preview_html("Слева\n\n<pullquote>Центр</pullquote>\n\nСправа")
    assert "<pullquote>Центр</pullquote>" in html
    assert "Слева" in html
    assert "Справа" in html


def test_marker_and_center_together():
    html = preview_html("<pullquote>==Важно==</pullquote>")
    assert "<pullquote>" in html
    assert '<mark class="tg-mark">Важно</mark>' in html


def test_center_prepared_for_telegram():
    prepared = prepare_markdown_for_telegram("<pullquote>Строка 1\nСтрока 2</pullquote>")
    assert "<pullquote>" in prepared
    assert "<br>" in prepared
