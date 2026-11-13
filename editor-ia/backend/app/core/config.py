"""Configurações do backend.

Tudo pode ser sobrescrito por variáveis de ambiente com prefixo EDITOR_.
Os caminhos padrão ficam em editor-ia/data/, fora do código.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    return int(value) if value else default


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("EDITOR_DATA_DIR", PROJECT_ROOT / "data")).resolve()
    )
    # Limites de upload
    max_upload_bytes: int = field(default_factory=lambda: _env_int("EDITOR_MAX_UPLOAD_MB", 30) * 1024 * 1024)
    max_pixels: int = field(default_factory=lambda: _env_int("EDITOR_MAX_MEGAPIXELS", 60) * 1_000_000)
    min_side: int = 64
    # Prévia ao vivo é renderizada em resolução reduzida para ficar rápida
    preview_max_side: int = field(default_factory=lambda: _env_int("EDITOR_PREVIEW_MAX_SIDE", 1600))
    thumb_max_side: int = 480
    # Origens que podem chamar a API (o frontend local)
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip()
            for o in os.environ.get(
                "EDITOR_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
            ).split(",")
            if o.strip()
        )
    )
    worker_threads: int = field(default_factory=lambda: _env_int("EDITOR_WORKERS", 2))

    @property
    def originals_dir(self) -> Path:
        return self.data_dir / "originals"

    @property
    def processed_dir(self) -> Path:
        return self.data_dir / "processed"

    @property
    def thumbs_dir(self) -> Path:
        return self.data_dir / "processed" / "thumbs"

    @property
    def temporary_dir(self) -> Path:
        return self.data_dir / "temporary"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "database" / "editor.sqlite3"

    def ensure_dirs(self) -> None:
        for d in (
            self.originals_dir,
            self.processed_dir,
            self.thumbs_dir,
            self.temporary_dir,
            self.database_path.parent,
        ):
            d.mkdir(parents=True, exist_ok=True)
