"""Rotas HTTP da API."""
from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.services import rendering
from app.services.editing import pipeline, registry
from app.services.editing.base import OperationError
from app.services.editing.pipeline import OperationStep
from app.services.image import io as imgio
from app.services.repository import now

from .deps import Services, current_owner, services

router = APIRouter(prefix="/api")
Svc = Annotated[Services, Depends(services)]
Owner = Annotated[str, Depends(current_owner)]

PRIVATE_CACHE = {"Cache-Control": "private, max-age=3600"}
NO_STORE = {"Cache-Control": "no-store"}


# Modelos de resposta -------------------------------------------------------
class ImageOut(BaseModel):
    id: str
    original_name: str
    format: str
    mime_type: str
    width: int
    height: int
    has_alpha: bool
    size_bytes: int
    created_at: str
    version_count: int = 0


class VersionOut(BaseModel):
    id: str
    image_id: str
    parent_id: str | None
    operations: list[dict[str, Any]]
    status: Literal["pending", "processing", "completed", "failed"]
    error: str | None
    width: int | None
    height: int | None
    created_at: str
    updated_at: str


class ImageDetail(ImageOut):
    versions: list[VersionOut]


class EditRequest(BaseModel):
    operations: list[OperationStep] = Field(default_factory=list, max_length=pipeline.MAX_OPERATIONS)


class PreviewRequest(EditRequest):
    max_side: int | None = Field(default=None, ge=64, le=4096)


class SaveRequest(EditRequest):
    parent_id: str | None = None


def _image_or_404(svc: Services, image_id: str, owner: str) -> dict[str, Any]:
    image = svc.repo.get_image(image_id, owner)
    if not image:
        raise HTTPException(404, "Imagem não encontrada")
    return image


def _version_or_404(svc: Services, version_id: str, owner: str) -> dict[str, Any]:
    version = svc.repo.get_version(version_id, owner)
    if not version:
        raise HTTPException(404, "Versão não encontrada")
    return version


def _steps(req: EditRequest) -> list[pipeline.ValidatedStep]:
    try:
        return pipeline.validate_steps(req.operations)
    except OperationError as exc:
        raise HTTPException(422, str(exc)) from None


# Saúde e catálogo ----------------------------------------------------------
@router.get("/health")
def health(svc: Svc) -> dict[str, Any]:
    return {"status": "ok", "preview_max_side": svc.settings.preview_max_side,
            "max_upload_mb": svc.settings.max_upload_bytes // (1024 * 1024)}


@router.get("/operations")
def list_operations() -> list[dict[str, Any]]:
    return [op.describe() for op in registry.all_operations()]


# Imagens -------------------------------------------------------------------
@router.post("/images", response_model=ImageOut, status_code=201)
async def upload_image(svc: Svc, owner: Owner, request: Request, file: UploadFile = File(...)) -> ImageOut:
    limit = svc.settings.max_upload_bytes
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit + 64 * 1024:
        raise HTTPException(413, f"Arquivo maior que {limit // (1024 * 1024)} MB")

    temp = svc.storage.new_temp_path()
    size = 0
    try:
        with temp.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"Arquivo maior que {limit // (1024 * 1024)} MB")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "Arquivo vazio")
        try:
            info = await run_in_threadpool(
                imgio.inspect, temp, max_pixels=svc.settings.max_pixels, min_side=svc.settings.min_side
            )
        except imgio.ImageValidationError as exc:
            raise HTTPException(415, str(exc)) from None

        image_id = uuid.uuid4().hex
        dest = svc.storage.original_path(image_id, info.extension)
        svc.storage.move(temp, dest)
        thumb = svc.storage.thumb_path(image_id)
        await run_in_threadpool(imgio.make_thumbnail, dest, thumb, svc.settings.thumb_max_side)
        name = (file.filename or "imagem").replace("\\", "/").rsplit("/", 1)[-1][:200] or "imagem"
        record = {
            "id": image_id,
            "owner_id": owner,
            "original_name": name,
            "format": info.format,
            "mime_type": info.mime_type,
            "width": info.width,
            "height": info.height,
            "has_alpha": int(info.has_alpha),
            "size_bytes": size,
            "sha256": svc.storage.sha256(dest),
            "storage_path": svc.storage.relative(dest),
            "thumb_path": svc.storage.relative(thumb),
            "created_at": now(),
        }
        svc.repo.insert_image(record)
        return ImageOut(**(record | {"has_alpha": info.has_alpha}))
    finally:
        temp.unlink(missing_ok=True)
        await file.close()


@router.get("/images", response_model=list[ImageOut])
def list_images(svc: Svc, owner: Owner) -> list[dict[str, Any]]:
    return svc.repo.list_images(owner)


@router.get("/images/{image_id}", response_model=ImageDetail)
def get_image(image_id: str, svc: Svc, owner: Owner) -> dict[str, Any]:
    image = _image_or_404(svc, image_id, owner)
    versions = svc.repo.list_versions(image_id)
    return image | {"versions": versions, "version_count": len(versions)}


@router.delete("/images/{image_id}", status_code=204)
def delete_image(image_id: str, svc: Svc, owner: Owner) -> Response:
    """Apaga o original e tudo que foi gerado a partir dele."""
    image = _image_or_404(svc, image_id, owner)
    versions = svc.repo.list_versions(image_id)
    svc.repo.delete_image(image_id)
    rendering.cache.forget(svc.storage.resolve(image["storage_path"]))
    svc.storage.remove(image["storage_path"], image["thumb_path"])
    for v in versions:
        svc.storage.remove(v["storage_path"], v["thumb_path"])
    return Response(status_code=204)


@router.get("/images/{image_id}/original")
def image_original(image_id: str, svc: Svc, owner: Owner) -> FileResponse:
    image = _image_or_404(svc, image_id, owner)
    return FileResponse(svc.storage.resolve(image["storage_path"]), media_type=image["mime_type"], headers=PRIVATE_CACHE)


@router.get("/images/{image_id}/thumbnail")
def image_thumbnail(image_id: str, svc: Svc, owner: Owner) -> FileResponse:
    image = _image_or_404(svc, image_id, owner)
    return FileResponse(svc.storage.resolve(image["thumb_path"]), media_type="image/webp", headers=PRIVATE_CACHE)


@router.post("/images/{image_id}/preview")
async def preview(image_id: str, req: PreviewRequest, svc: Svc, owner: Owner) -> Response:
    """Renderiza a lista de operações numa cópia reduzida, sem salvar nada."""
    image = _image_or_404(svc, image_id, owner)
    steps = _steps(req)
    max_side = req.max_side or svc.settings.preview_max_side
    path = svc.storage.resolve(image["storage_path"])

    def work() -> tuple[bytes, str, int, int]:
        result = rendering.render(path, steps, max_side=max_side)
        im = imgio.to_pil(result)
        if im.mode == "RGBA":
            return imgio.encode(im, "webp", quality=88), "image/webp", im.width, im.height
        return imgio.encode(im, "jpeg", quality=88), "image/jpeg", im.width, im.height

    try:
        data, mime, w, h = await run_in_threadpool(work)
    except OperationError as exc:
        raise HTTPException(422, str(exc)) from None
    return Response(data, media_type=mime, headers=NO_STORE | {"X-Image-Width": str(w), "X-Image-Height": str(h)})


# Versões -------------------------------------------------------------------
@router.post("/images/{image_id}/versions", response_model=VersionOut, status_code=202)
def save_version(image_id: str, req: SaveRequest, svc: Svc, owner: Owner) -> dict[str, Any]:
    """Cria uma versão nova em resolução total. O processamento roda em segundo plano."""
    image = _image_or_404(svc, image_id, owner)
    _steps(req)
    if not req.operations:
        raise HTTPException(422, "Nenhuma edição para salvar")
    if req.parent_id:
        parent = svc.repo.get_version(req.parent_id, owner)
        if not parent or parent["image_id"] != image_id:
            raise HTTPException(422, "Versão de origem inválida")
    ops = [s.model_dump(exclude_none=True) for s in req.operations]
    version = {
        "id": uuid.uuid4().hex,
        "image_id": image_id,
        "parent_id": req.parent_id,
        "operations": ops,
        "status": "pending",
        "created_at": now(),
        "updated_at": now(),
    }
    svc.repo.insert_version(version)
    svc.jobs.submit(version["id"], image["storage_path"], ops)
    return version | {"error": None, "width": None, "height": None}


@router.get("/versions/{version_id}", response_model=VersionOut)
def get_version(version_id: str, svc: Svc, owner: Owner) -> dict[str, Any]:
    return _version_or_404(svc, version_id, owner)


@router.delete("/versions/{version_id}", status_code=204)
def delete_version(version_id: str, svc: Svc, owner: Owner) -> Response:
    version = _version_or_404(svc, version_id, owner)
    if version["status"] in ("pending", "processing"):
        raise HTTPException(409, "Aguarde o processamento terminar para apagar esta versão")
    with svc.repo.db.connect() as c:
        c.execute("DELETE FROM versions WHERE id = ?", (version_id,))
    svc.storage.remove(version["storage_path"], version["thumb_path"])
    return Response(status_code=204)


def _completed_file(svc: Services, version: dict[str, Any], key: str):
    if version["status"] != "completed" or not version[key]:
        raise HTTPException(409, "Esta versão ainda não está pronta")
    return svc.storage.resolve(version[key])


@router.get("/versions/{version_id}/thumbnail")
def version_thumbnail(version_id: str, svc: Svc, owner: Owner) -> FileResponse:
    version = _version_or_404(svc, version_id, owner)
    return FileResponse(_completed_file(svc, version, "thumb_path"), media_type="image/webp", headers=PRIVATE_CACHE)


@router.get("/versions/{version_id}/export")
async def export_version(
    version_id: str,
    svc: Svc,
    owner: Owner,
    format: Literal["jpeg", "png", "webp"] = "jpeg",
    quality: int = Query(92, ge=40, le=100),
    max_side: int | None = Query(None, ge=64, le=16384),
) -> Response:
    version = _version_or_404(svc, version_id, owner)
    path = _completed_file(svc, version, "storage_path")

    def work() -> bytes:
        array = imgio.load_array(path, max_side=max_side)
        return imgio.encode(imgio.to_pil(array), format, quality=quality)

    data = await run_in_threadpool(work)
    _, mime, ext = imgio.EXPORT_FORMATS[format]
    filename = f"editada-{version_id[:8]}.{ext}"
    return Response(data, media_type=mime, headers=NO_STORE | {"Content-Disposition": f'attachment; filename="{filename}"'})
