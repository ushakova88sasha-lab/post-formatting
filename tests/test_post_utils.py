from app.post_utils import DEFAULT_POST_TITLE, display_post_title, strip_markdown, title_from_content


def test_title_from_content_strips_markdown():
    content = "# Заголовок\n\n**Важный** пост про [ссылку](https://example.com)"
    assert title_from_content(content) == "Заголовок"


def test_title_from_content_strips_telegram_formatting():
    content = "==Выделение== и ||спойлер|| с ~~зачёркиванием~~"
    assert title_from_content(content) == "Выделение и спойлер с зачёркиванием"


def test_title_from_content_strips_html_and_math():
    content = "<u>Подчёркнутый</u> и ^^E=mc^2^^ с `кодом`"
    assert title_from_content(content) == "Подчёркнутый и E=mc^2 с кодом"


def test_title_from_content_truncates_long_text():
    content = " ".join(["слово"] * 30)
    result = title_from_content(content, max_len=20)
    assert len(result) <= 21
    assert result.endswith("…")


def test_display_post_title_uses_content_for_default_title():
    title = display_post_title(DEFAULT_POST_TITLE, "Первый абзац публикации")
    assert title == "Первый абзац публикации"


def test_display_post_title_keeps_custom_title():
    assert display_post_title("Мой заголовок", "Текст поста") == "Мой заголовок"


def test_display_post_title_strips_markdown_from_saved_title():
    title = display_post_title("**Опубликованный** пост", "Текст")
    assert title == "Опубликованный пост"


def test_strip_markdown_removes_image_and_link():
    text = strip_markdown("![картинка](/uploads/a.png) и [текст](https://t.me)")
    assert text == "и текст"
