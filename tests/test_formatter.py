from app.formatter import preview_html


def test_marker_highlight_in_preview():
    html = preview_html("Текст с ==маркером== внутри")
    assert '<mark class="tg-mark">маркером</mark>' in html


def test_center_align_in_preview():
    html = preview_html('<p style="text-align: center">По центру</p>')
    assert 'style="text-align: center"' in html
    assert "По центру" in html


def test_marker_and_center_together():
    html = preview_html('<p style="text-align: center">==Важно==</p>')
    assert "text-align: center" in html
    assert '<mark class="tg-mark">Важно</mark>' in html
