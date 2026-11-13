"""Fila simples de processamento em segundo plano (threads).

Suficiente para um computador local. Se um dia houver muitos usuários,
dá para trocar por uma fila dedicada sem mudar a API: o estado de cada
trabalho já fica no banco (pending → processing → completed/failed).
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from app.core.config import Settings
from app.services import rendering
from app.services.editing import pipeline
from app.services.editing.base import OperationError
from app.services.image import io as imgio
from app.services.repository import Repository
from app.services.storage import Storage

log = logging.getLogger("editor.jobs")


class JobRunner:
    def __init__(self, settings: Settings, repo: Repository, storage: Storage) -> None:
        self.settings, self.repo, self.storage = settings, repo, storage
        self.pool = ThreadPoolExecutor(max_workers=settings.worker_threads, thread_name_prefix="render")

    def submit(self, version_id: str, original_rel: str, operations: list[dict]) -> None:
        self.pool.submit(self._run, version_id, original_rel, operations)

    def _run(self, version_id: str, original_rel: str, operations: list[dict]) -> None:
        if not self.repo.update_version(version_id, status="processing"):
            return  # imagem apagada antes de começar
        out_path = self.storage.version_path(version_id)
        thumb = self.storage.thumb_path(version_id)
        try:
            steps = pipeline.parse_steps(operations)
            result = rendering.render(self.storage.resolve(original_rel), steps, max_side=None)
            out_path.write_bytes(imgio.encode(imgio.to_pil(result), "png"))
            imgio.make_thumbnail(imgio.fit_within(result, self.settings.thumb_max_side), thumb, self.settings.thumb_max_side)
            ok = self.repo.update_version(
                version_id,
                status="completed",
                error=None,
                width=int(result.shape[1]),
                height=int(result.shape[0]),
                storage_path=self.storage.relative(out_path),
                thumb_path=self.storage.relative(thumb),
            )
            if not ok:  # a imagem foi apagada durante o processamento
                out_path.unlink(missing_ok=True)
                thumb.unlink(missing_ok=True)
        except OperationError as exc:
            self.repo.update_version(version_id, status="failed", error=str(exc))
        except Exception:  # noqa: BLE001 - registra e marca como falha, sem derrubar o servidor
            log.exception("Falha ao processar versão %s", version_id)
            out_path.unlink(missing_ok=True)
            thumb.unlink(missing_ok=True)
            self.repo.update_version(version_id, status="failed", error="Erro inesperado no processamento.")

    def shutdown(self) -> None:
        self.pool.shutdown(wait=True, cancel_futures=True)
