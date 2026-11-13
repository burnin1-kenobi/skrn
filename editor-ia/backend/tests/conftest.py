from __future__ import annotations

import io
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import Settings
from app.main import create_app


def synthetic_image(width=320, height=240, fmt="JPEG", mode="RGB") -> bytes:
    """Imagem sintética (gradiente + formas) usada em todos os testes."""
    y, x = np.mgrid[0:height, 0:width]
    r = (x / width * 255).astype(np.uint8)
    g = (y / height * 255).astype(np.uint8)
    b = ((np.sin(x / 9) * np.cos(y / 7) * 0.5 + 0.5) * 255).astype(np.uint8)
    arr = np.stack([r, g, b], axis=2)
    if mode == "RGBA":
        a = np.full((height, width, 1), 255, np.uint8)
        a[: height // 2] = 120
        arr = np.concatenate([arr, a], axis=2)
    buf = io.BytesIO()
    Image.fromarray(arr, mode).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture()
def client(tmp_path):
    settings = Settings(data_dir=tmp_path / "data", max_upload_bytes=2 * 1024 * 1024, max_pixels=4_000_000)
    with TestClient(create_app(settings)) as c:
        c.settings = settings
        yield c


@pytest.fixture()
def uploaded(client):
    r = client.post("/api/images", files={"file": ("foto.jpg", synthetic_image(), "image/jpeg")})
    assert r.status_code == 201, r.text
    return r.json()


def wait_version(client, version_id, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        v = client.get(f"/api/versions/{version_id}").json()
        if v["status"] in ("completed", "failed"):
            return v
        time.sleep(0.05)
    raise AssertionError("versão não terminou a tempo")
