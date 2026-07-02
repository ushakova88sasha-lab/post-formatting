from app.database import Post, PostStatus, SessionLocal


def _create_post(client, auth_cookies, title: str, status: str = PostStatus.DRAFT.value):
    response = client.post(
        "/api/posts",
        json={"title": title, "content": f"Текст {title}"},
        cookies=auth_cookies,
    )
    post = response.json()
    if status != PostStatus.DRAFT.value:
        db = SessionLocal()
        try:
            row = db.get(Post, post["id"])
            row.status = status
            db.commit()
        finally:
            db.close()
    return post


def test_list_posts_filter_and_pagination(client, auth_cookies):
    before_drafts = client.get("/api/posts?filter=draft&limit=1", cookies=auth_cookies).json()["total"]
    before_published = client.get("/api/posts?filter=published&limit=1", cookies=auth_cookies).json()["total"]

    for index in range(12):
        _create_post(client, auth_cookies, f"FilterDraft {index}")

    for index in range(3):
        _create_post(client, auth_cookies, f"FilterPublished {index}", PostStatus.PUBLISHED.value)

    draft_page = client.get("/api/posts?filter=draft&offset=0&limit=10", cookies=auth_cookies)
    assert draft_page.status_code == 200
    draft_data = draft_page.json()
    assert draft_data["total"] == before_drafts + 12
    assert len(draft_data["posts"]) == 10
    assert draft_data["has_more"] is True
    assert all(post["status"] != PostStatus.PUBLISHED.value for post in draft_data["posts"])

    draft_page_2 = client.get(
        f"/api/posts?filter=draft&offset=10&limit=10",
        cookies=auth_cookies,
    )
    draft_data_2 = draft_page_2.json()
    assert len(draft_data_2["posts"]) == before_drafts + 12 - 10
    assert draft_data_2["has_more"] is False

    published_page = client.get("/api/posts?filter=published&offset=0&limit=10", cookies=auth_cookies)
    published_data = published_page.json()
    assert published_data["total"] == before_published + 3
    assert len(published_data["posts"]) >= 3
    assert all(post["status"] == PostStatus.PUBLISHED.value for post in published_data["posts"])


def test_list_items_are_lightweight(client, auth_cookies):
    post = client.post(
        "/api/posts",
        json={
            "title": "Лёгкий список",
            "content": "Контент",
            "buttons": [{"text": "Кнопка", "url": "https://example.com"}],
        },
        cookies=auth_cookies,
    ).json()

    listed = client.get("/api/posts?filter=draft&limit=10", cookies=auth_cookies).json()
    item = next(row for row in listed["posts"] if row["id"] == post["id"])
    assert "display_title" in item
    assert "content" not in item
    assert "buttons" not in item
