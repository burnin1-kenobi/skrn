from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request

from app.core.config import Settings
from app.services.jobs import JobRunner
from app.services.repository import Repository
from app.services.storage import Storage

# Fase 1: uso local por uma pessoa só. O login entra na Fase 5;
# até lá todas as imagens pertencem a este dono fixo. As consultas já
# filtram por dono, então a troca não exige mudar as rotas.
LOCAL_OWNER = "local"


@dataclass
class Services:
    settings: Settings
    repo: Repository
    storage: Storage
    jobs: JobRunner


def services(request: Request) -> Services:
    return request.app.state.services


def current_owner() -> str:
    return LOCAL_OWNER
