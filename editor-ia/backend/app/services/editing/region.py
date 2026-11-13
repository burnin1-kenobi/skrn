"""Máscaras de região para aplicar uma operação só numa parte da imagem.

As coordenadas são normalizadas (0..1) em relação à imagem naquele ponto
do pipeline. Assim a mesma região vale para a prévia reduzida e para a
imagem em resolução total.
"""
from __future__ import annotations

from typing import Literal

import cv2
import numpy as np
from pydantic import BaseModel, Field, model_validator


class Region(BaseModel):
    shape: Literal["rect", "ellipse"] = "ellipse"
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    w: float = Field(gt=0, le=1)
    h: float = Field(gt=0, le=1)
    feather: float = Field(default=0.15, ge=0, le=1, description="Suavização da borda (0 = borda dura)")
    invert: bool = False

    @model_validator(mode="after")
    def _inside(self) -> "Region":
        if self.x + self.w > 1.0001 or self.y + self.h > 1.0001:
            raise ValueError("A região precisa ficar dentro da imagem")
        return self


def build_mask(region: Region, height: int, width: int) -> np.ndarray:
    """Máscara float32 HxWx1 com 1 onde a operação deve agir."""
    mask = np.zeros((height, width), dtype=np.float32)
    x0, y0 = round(region.x * width), round(region.y * height)
    x1, y1 = round((region.x + region.w) * width), round((region.y + region.h) * height)
    x1, y1 = max(x1, x0 + 1), max(y1, y0 + 1)
    if region.shape == "rect":
        mask[y0:y1, x0:x1] = 1.0
    else:
        center = ((x0 + x1) / 2, (y0 + y1) / 2)
        axes = (max((x1 - x0) / 2, 0.5), max((y1 - y0) / 2, 0.5))
        cv2.ellipse(mask, (center, (axes[0] * 2, axes[1] * 2), 0), 1.0, thickness=-1, lineType=cv2.LINE_AA)
    if region.feather > 0:
        # Raio de suavização proporcional ao tamanho da região
        sigma = region.feather * 0.25 * min(x1 - x0, y1 - y0)
        if sigma >= 0.5:
            mask = _blur(mask, sigma)
    if region.invert:
        mask = 1.0 - mask
    return np.clip(mask, 0, 1)[..., None]


def _blur(mask: np.ndarray, sigma: float) -> np.ndarray:
    """Desfoque gaussiano; para raios grandes, desfoca em resolução menor (bem mais rápido)."""
    if sigma <= 8:
        return cv2.GaussianBlur(mask, (0, 0), sigmaX=sigma, sigmaY=sigma)
    factor = sigma / 4
    h, w = mask.shape
    small = cv2.resize(mask, (max(1, round(w / factor)), max(1, round(h / factor))), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), sigmaX=4, sigmaY=4)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
