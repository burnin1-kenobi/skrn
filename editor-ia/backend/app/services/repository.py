"""Acesso ao banco: todas as consultas SQL ficam aqui."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.db import Database


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _image(row) -> dict[str, Any]:
    return dict(row) | {"has_alpha": bool(row["has_alpha"])}


def _version(row) -> dict[str, Any]:
    return dict(row) | {"operations": json.loads(row["operations"])}


class Repository:
    def __init__(self, db: Database) -> None:
        self.db = db

    # Imagens -------------------------------------------------------------
    def insert_image(self, data: dict[str, Any]) -> None:
        cols = ", ".join(data)
        marks = ", ".join(f":{k}" for k in data)
        with self.db.connect() as c:
            c.execute(f"INSERT INTO images ({cols}) VALUES ({marks})", data)

    def get_image(self, image_id: str, owner_id: str) -> dict[str, Any] | None:
        with self.db.connect() as c:
            row = c.execute("SELECT * FROM images WHERE id = ? AND owner_id = ?", (image_id, owner_id)).fetchone()
        return _image(row) if row else None

    def list_images(self, owner_id: str) -> list[dict[str, Any]]:
        with self.db.connect() as c:
            rows = c.execute(
                """SELECT i.*, (SELECT COUNT(*) FROM versions v WHERE v.image_id = i.id) AS version_count
                   FROM images i WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC""",
                (owner_id,),
            ).fetchall()
        return [_image(r) for r in rows]

    def delete_image(self, image_id: str) -> None:
        with self.db.connect() as c:
            c.execute("DELETE FROM versions WHERE image_id = ?", (image_id,))
            c.execute("DELETE FROM images WHERE id = ?", (image_id,))

    # Versões -------------------------------------------------------------
    def insert_version(self, data: dict[str, Any]) -> None:
        data = data | {"operations": json.dumps(data["operations"], ensure_ascii=False)}
        cols = ", ".join(data)
        marks = ", ".join(f":{k}" for k in data)
        with self.db.connect() as c:
            c.execute(f"INSERT INTO versions ({cols}) VALUES ({marks})", data)

    def update_version(self, version_id: str, **fields: Any) -> bool:
        fields["updated_at"] = now()
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        with self.db.connect() as c:
            cur = c.execute(f"UPDATE versions SET {sets} WHERE id = :id", fields | {"id": version_id})
        return cur.rowcount > 0

    def get_version(self, version_id: str, owner_id: str) -> dict[str, Any] | None:
        with self.db.connect() as c:
            row = c.execute(
                """SELECT v.* FROM versions v JOIN images i ON i.id = v.image_id
                   WHERE v.id = ? AND i.owner_id = ?""",
                (version_id, owner_id),
            ).fetchone()
        return _version(row) if row else None

    def list_versions(self, image_id: str) -> list[dict[str, Any]]:
        with self.db.connect() as c:
            rows = c.execute(
                "SELECT * FROM versions WHERE image_id = ? ORDER BY created_at DESC, rowid DESC", (image_id,)
            ).fetchall()
        return [_version(r) for r in rows]

    def fail_interrupted_versions(self) -> int:
        """Ao iniciar, trabalhos que ficaram pela metade (app fechado) viram 'failed'."""
        with self.db.connect() as c:
            cur = c.execute(
                "UPDATE versions SET status = 'failed', error = ?, updated_at = ? WHERE status IN ('pending','processing')",
                ("Processamento interrompido (o servidor foi fechado). Salve de novo.", now()),
            )
        return cur.rowcount
