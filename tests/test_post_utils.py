from app.post_utils import DEFAULT_POST_TITLE, display_post_title, title_from_content


def test_title_from_content_strips_markdown():
    content = "# Заголовок\n\n**Важный** пост про [ссылку](https://example.com)"
    assert title_from_content(content).startswith("Заголовок")


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
