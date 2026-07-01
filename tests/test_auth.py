def test_me_requires_auth(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401


def test_login_sets_session_cookie_with_root_path(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-password"},
    )
    assert response.status_code == 200
    cookie = response.cookies.get("session")
    assert cookie

    set_cookie = response.headers.get("set-cookie", "")
    assert "Path=/" in set_cookie or "path=/" in set_cookie.lower()

    me = client.get("/api/auth/me", cookies={"session": cookie})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_wrong_password_does_not_set_cookie(client):
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "wrong"},
    )
    assert response.status_code == 401
    assert not response.cookies.get("session")
