"""Leitura, validação, conversão e gravação de imagens (Pillow + NumPy)."""
from __future__ import annotations

import io
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

ALLOWED_FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}
EXPORT_FORMATS = {"jpeg": ("JPEG", "image/jpeg", "jpg"), "png": ("PNG", "image/png", "png"), "webp": ("WEBP", "image/webp", "webp")}


class ImageValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ImageInfo:
    format: str
    mime_type: str
    extension: str
    width: int
    height: int
    has_alpha: bool


def inspect(path: Path, *, max_pixels: int, min_side: int) -> ImageInfo:
    """Confere se o arquivo é uma imagem suportada, íntegra e dentro dos limites."""
    Image.MAX_IMAGE_PIXELS = max_pixels
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as im:
                fmt = im.format
                if fmt not in ALLOWED_FORMATS:
                    raise ImageValidationError("Formato não suportado. Use JPG, PNG ou WEBP.")
                im.verify()
            # verify() invalida o objeto; reabre para ler orientação e conteúdo
            with Image.open(path) as im:
                im.load()
                oriented = ImageOps.exif_transpose(im)
                width, height = oriented.size
                has_alpha = _has_alpha(oriented)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageValidationError(f"Imagem grande demais (limite de {max_pixels // 1_000_000} megapixels).") from None
    except ImageValidationError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ImageValidationError("Arquivo inválido ou corrompido.") from None
    if min(width, height) < min_side:
        raise ImageValidationError(f"Imagem pequena demais (mínimo de {min_side} px no menor lado).")
    mime, ext = ALLOWED_FORMATS[fmt]
    return ImageInfo(fmt, mime, ext, width, height, has_alpha)


def _has_alpha(im: Image.Image) -> bool:
    if im.mode in ("RGBA", "LA", "PA"):
        return im.getchannel("A").getextrema()[0] < 255
    return im.mode == "P" and "transparency" in im.info


def load_array(path: Path, *, max_side: int | None = None) -> np.ndarray:
    """Abre já com a orientação EXIF aplicada e devolve float32 0..1 (RGB ou RGBA)."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert("RGBA") if _has_alpha(im) else im.convert("RGB")
        if max_side and max(im.size) > max_side:
            im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        return np.asarray(im, dtype=np.float32) / 255.0


def to_pil(array: np.ndarray) -> Image.Image:
    data = (np.clip(array, 0, 1) * 255.0 + 0.5).astype(np.uint8)
    return Image.fromarray(data, mode="RGBA" if data.shape[2] == 4 else "RGB")


def encode(im: Image.Image, fmt: str, *, quality: int = 92) -> bytes:
    """fmt: 'jpeg' | 'png' | 'webp'. JPEG não tem transparência: aplica fundo branco."""
    pil_fmt = EXPORT_FORMATS[fmt][0]
    if pil_fmt == "JPEG" and im.mode == "RGBA":
        background = Image.new("RGB", im.size, (255, 255, 255))
        background.paste(im, mask=im.getchannel("A"))
        im = background
    buf = io.BytesIO()
    options: dict = {}
    if pil_fmt == "JPEG":
        options = {"quality": quality, "optimize": True, "subsampling": 0 if quality >= 90 else 2}
    elif pil_fmt == "WEBP":
        options = {"quality": quality, "method": 4}
    elif pil_fmt == "PNG":
        options = {"compress_level": 6}
    # Metadados (EXIF, GPS) não são copiados para os arquivos gerados
    im.save(buf, format=pil_fmt, **options)
    return buf.getvalue()


def make_thumbnail(array_or_path: np.ndarray | Path, dest: Path, max_side: int) -> None:
    if isinstance(array_or_path, Path):
        array = load_array(array_or_path, max_side=max_side)
    else:
        array = array_or_path
    im = to_pil(array)
    im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    dest.write_bytes(encode(im, "webp", quality=82))


def fit_within(array: np.ndarray, max_side: int) -> np.ndarray:
    h, w = array.shape[:2]
    if max(h, w) <= max_side:
        return array
    im = to_pil(array)
    im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0
