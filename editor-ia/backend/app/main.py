"""Ponto de entrada do backend: `uvicorn app.main:app`."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import Services
from app.api.routes import router
from app.core.config import Settings
from app.core.db import Database
from app.services.jobs import JobRunner
from app.services.repository import Repository
from app.services.storage import Storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        storage = Storage(settings)
        storage.clean_temporary()
        repo = Repository(Database(settings.database_path))
        interrupted = repo.fail_interrupted_versions()
        if interrupted:
            logging.getLogger("editor").warning("%d processamento(s) interrompido(s) marcados como falha", interrupted)
        jobs = JobRunner(settings, repo, storage)
        app.state.services = Services(settings, repo, storage, jobs)
        try:
            yield
        finally:
            jobs.shutdown()

    app = FastAPI(title="Editor IA — API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
        expose_headers=["X-Image-Width", "X-Image-Height", "Content-Disposition"],
    )
    app.include_router(router)
    return app


app = create_app()
