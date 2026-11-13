"""Arquivos privados em disco.

Os arquivos ficam em data/ com nomes aleatórios (UUID), nunca com o nome
original enviado. Não há pasta pública: tudo passa pela API.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import uuid
from pathlib import Path

from app.core.config import Settings


class Storage:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        settings.ensure_dirs()

    def new_temp_path(self) -> Path:
        return self.s.temporary_dir / f"{uuid.uuid4().hex}.upload"

    def original_path(self, image_id: str, ext: str) -> Path:
        return self.s.originals_dir / f"{image_id}.{ext}"

    def thumb_path(self, item_id: str) -> Path:
        return self.s.thumbs_dir / f"{item_id}.webp"

    def version_path(self, version_id: str) -> Path:
        return self.s.processed_dir / f"{version_id}.png"

    def resolve(self, relative: str) -> Path:
        """Converte o caminho salvo no banco em absoluto, sem permitir sair de data/."""
        path = (self.s.data_dir / relative).resolve()
        if self.s.data_dir not in path.parents:
            raise ValueError("Caminho fora da pasta de dados")
        return path

    def relative(self, path: Path) -> str:
        return path.resolve().relative_to(self.s.data_dir).as_posix()

    @staticmethod
    def sha256(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def move(src: Path, dest: Path) -> None:
        os.replace(src, dest) if src.anchor == dest.anchor else shutil.move(src, dest)

    def remove(self, *relative_paths: str | None) -> None:
        for rel in relative_paths:
            if not rel:
                continue
            try:
                self.resolve(rel).unlink(missing_ok=True)
            except (OSError, ValueError):
                pass

    def clean_temporary(self) -> None:
        for f in self.s.temporary_dir.glob("*"):
            try:
                f.unlink()
            except OSError:
                pass
