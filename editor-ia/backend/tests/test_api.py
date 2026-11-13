import io
import os

import numpy as np
from PIL import Image

from .conftest import synthetic_image, wait_version


def test_health_and_catalog(client):
    assert client.get("/api/health").json()["status"] == "ok"
    ops = {o["id"]: o for o in client.get("/api/operations").json()}
    assert {"adjust", "sharpen", "smooth", "crop", "rotate"} <= set(ops)
    assert ops["adjust"]["supports_region"] is True
    assert ops["crop"]["ui"] == "crop"
    assert all("default" in p for o in ops.values() for p in o["params"])


def test_upload_list_and_files(client, uploaded):
    assert uploaded["width"] == 320 and uploaded["height"] == 240
    assert uploaded["format"] == "JPEG"
    listed = client.get("/api/images").json()
    assert [i["id"] for i in listed] == [uploaded["id"]]
    r = client.get(f"/api/images/{uploaded['id']}/thumbnail")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    r = client.get(f"/api/images/{uploaded['id']}/original")
    assert r.status_code == 200 and r.headers["cache-control"].startswith("private")


def test_stored_file_uses_random_name(client, uploaded):
    originals = os.listdir(client.settings.originals_dir)
    assert originals == [f"{uploaded['id']}.jpg"]
    assert "foto" not in originals[0]


def test_upload_rejects_non_images(client):
    r = client.post("/api/images", files={"file": ("x.jpg", b"isto nao e imagem", "image/jpeg")})
    assert r.status_code == 415
    r = client.post("/api/images", files={"file": ("x.gif", synthetic_image(fmt="GIF"), "image/gif")})
    assert r.status_code == 415
    r = client.post("/api/images", files={"file": ("x.jpg", b"", "image/jpeg")})
    assert r.status_code == 400
    assert os.listdir(client.settings.temporary_dir) == []


def test_upload_rejects_tiny_and_huge(client):
    r = client.post("/api/images", files={"file": ("p.png", synthetic_image(32, 32, "PNG"), "image/png")})
    assert r.status_code == 415 and "pequena" in r.json()["detail"]
    big = synthetic_image(2100, 2100, "PNG")  # 4,4 MP > limite de teste de 4 MP
    if len(big) <= client.settings.max_upload_bytes:
        r = client.post("/api/images", files={"file": ("g.png", big, "image/png")})
        assert r.status_code == 415
    r = client.post("/api/images", files={"file": ("g.bin", os.urandom(3 * 1024 * 1024), "image/png")})
    assert r.status_code == 413


def test_exif_orientation_is_applied(client):
    im = Image.new("RGB", (200, 100), (200, 50, 50))
    exif = Image.Exif()
    exif[0x0112] = 6  # girar 90°
    buf = io.BytesIO()
    im.save(buf, format="JPEG", exif=exif)
    r = client.post("/api/images", files={"file": ("e.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 201
    assert (r.json()["width"], r.json()["height"]) == (100, 200)


def test_preview(client, uploaded):
    r = client.post(f"/api/images/{uploaded['id']}/preview",
                    json={"operations": [{"op": "crop", "params": {"w": 0.5, "h": 0.5}}], "max_side": 160})
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.headers["x-image-width"] == "80" and r.headers["x-image-height"] == "60"
    assert r.headers["cache-control"] == "no-store"


def test_preview_validation_error(client, uploaded):
    r = client.post(f"/api/images/{uploaded['id']}/preview", json={"operations": [{"op": "adjust", "params": {"exposure": 50}}]})
    assert r.status_code == 422 and "intervalo" in r.json()["detail"]


def test_save_version_keeps_original_and_exports(client, uploaded):
    original_before = client.get(f"/api/images/{uploaded['id']}/original").content
    ops = [{"op": "adjust", "params": {"exposure": 0.5}, "region": {"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.5}},
           {"op": "rotate", "params": {"quarter_turns": "1"}}]
    r = client.post(f"/api/images/{uploaded['id']}/versions", json={"operations": ops})
    assert r.status_code == 202 and r.json()["status"] == "pending"
    v = wait_version(client, r.json()["id"])
    assert v["status"] == "completed", v
    assert (v["width"], v["height"]) == (240, 320)
    assert v["operations"][0]["region"]["shape"] == "ellipse"

    assert client.get(f"/api/images/{uploaded['id']}/original").content == original_before

    for fmt, mime in (("jpeg", "image/jpeg"), ("png", "image/png"), ("webp", "image/webp")):
        r = client.get(f"/api/versions/{v['id']}/export", params={"format": fmt})
        assert r.status_code == 200 and r.headers["content-type"] == mime
        assert "attachment" in r.headers["content-disposition"]
    r = client.get(f"/api/versions/{v['id']}/export", params={"format": "png", "max_side": 100})
    assert Image.open(io.BytesIO(r.content)).size == (75, 100)

    detail = client.get(f"/api/images/{uploaded['id']}").json()
    assert detail["version_count"] == 1 and detail["versions"][0]["id"] == v["id"]


def test_save_rejects_empty_and_bad_parent(client, uploaded):
    url = f"/api/images/{uploaded['id']}/versions"
    assert client.post(url, json={"operations": []}).status_code == 422
    r = client.post(url, json={"operations": [{"op": "adjust"}], "parent_id": "x"})
    assert r.status_code == 422


def test_rgba_png_keeps_transparency(client):
    r = client.post("/api/images", files={"file": ("t.png", synthetic_image(fmt="PNG", mode="RGBA"), "image/png")})
    image = r.json()
    assert image["has_alpha"] is True
    v = client.post(f"/api/images/{image['id']}/versions", json={"operations": [{"op": "adjust", "params": {"contrast": 0.3}}]}).json()
    v = wait_version(client, v["id"])
    png = Image.open(io.BytesIO(client.get(f"/api/versions/{v['id']}/export", params={"format": "png"}).content))
    assert png.mode == "RGBA" and np.asarray(png)[0, 0, 3] == 120
    jpg = Image.open(io.BytesIO(client.get(f"/api/versions/{v['id']}/export", params={"format": "jpeg"}).content))
    assert jpg.mode == "RGB"


def test_delete_removes_everything(client, uploaded):
    v = client.post(f"/api/images/{uploaded['id']}/versions", json={"operations": [{"op": "sharpen"}]}).json()
    wait_version(client, v["id"])
    assert client.delete(f"/api/images/{uploaded['id']}").status_code == 204
    assert client.get(f"/api/images/{uploaded['id']}").status_code == 404
    assert client.get(f"/api/versions/{v['id']}").status_code == 404
    assert os.listdir(client.settings.originals_dir) == []
    assert [p for p in client.settings.processed_dir.rglob("*") if p.is_file()] == []


def test_delete_single_version(client, uploaded):
    v = client.post(f"/api/images/{uploaded['id']}/versions", json={"operations": [{"op": "sharpen"}]}).json()
    wait_version(client, v["id"])
    assert client.delete(f"/api/versions/{v['id']}").status_code == 204
    assert client.get(f"/api/images/{uploaded['id']}").json()["version_count"] == 0


def test_unknown_ids_are_404(client):
    assert client.get("/api/images/nada").status_code == 404
    assert client.get("/api/versions/nada/export").status_code == 404
    assert client.post("/api/images/nada/preview", json={"operations": []}).status_code == 404


def test_metadata_is_not_copied_to_exports(client):
    im = Image.new("RGB", (200, 200), (10, 120, 200))
    exif = Image.Exif()
    exif[0x010F] = "CameraMarca"
    buf = io.BytesIO()
    im.save(buf, format="JPEG", exif=exif)
    image = client.post("/api/images", files={"file": ("m.jpg", buf.getvalue(), "image/jpeg")}).json()
    v = client.post(f"/api/images/{image['id']}/versions", json={"operations": [{"op": "adjust", "params": {"brightness": 0.1}}]}).json()
    v = wait_version(client, v["id"])
    out = client.get(f"/api/versions/{v['id']}/export", params={"format": "jpeg"}).content
    assert b"CameraMarca" not in out
