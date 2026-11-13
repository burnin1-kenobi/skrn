"""Banco SQLite local (biblioteca padrão do Python, sem ORM).

No protótipo um arquivo SQLite basta. As consultas ficam concentradas
em app/services/repository.py para facilitar a troca por PostgreSQL depois.
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS images (
    id            TEXT PRIMARY KEY,
    owner_id      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    format        TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    has_alpha     INTEGER NOT NULL,
    size_bytes    INTEGER NOT NULL,
    sha256        TEXT NOT NULL,
    storage_path  TEXT NOT NULL,
    thumb_path    TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS versions (
    id            TEXT PRIMARY KEY,
    image_id      TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    parent_id     TEXT REFERENCES versions(id) ON DELETE SET NULL,
    operations    TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
    error         TEXT,
    width         INTEGER,
    height        INTEGER,
    storage_path  TEXT,
    thumb_path    TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_versions_image ON versions(image_id, created_at);
"""


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.Lock()
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        try:
            with self._lock:
                yield conn
                conn.commit()
        finally:
            conn.close()
