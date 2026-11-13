"""Operações clássicas (sem IA) da Fase 1.

Todos os parâmetros independem da resolução: raios são porcentagens do
maior lado e recortes usam coordenadas normalizadas. Isso garante que a
prévia reduzida e a exportação em resolução total fiquem iguais.
"""
from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np

from .base import Operation, OperationError, ParamSpec

# Pesos de luminância (Rec. 709)
_LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def _rgb(img: np.ndarray) -> np.ndarray:
    return img[..., :3]


def _with_rgb(img: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    if img.shape[2] == 4:
        return np.concatenate([rgb, img[..., 3:4]], axis=2)
    return rgb


class Adjust(Operation):
    id = "adjust"
    name = "Luz e cor"
    category = "Ajustes"
    description = "Exposição, contraste, saturação e temperatura de cor."
    supports_region = True
    params = (
        ParamSpec("exposure", "Exposição", "float", 0.0, -2.0, 2.0, 0.05, help="Em pontos (EV)"),
        ParamSpec("brightness", "Brilho", "float", 0.0, -1.0, 1.0, 0.01),
        ParamSpec("contrast", "Contraste", "float", 0.0, -1.0, 1.0, 0.01),
        ParamSpec("highlights", "Altas luzes", "float", 0.0, -1.0, 1.0, 0.01),
        ParamSpec("shadows", "Sombras", "float", 0.0, -1.0, 1.0, 0.01),
        ParamSpec("saturation", "Saturação", "float", 0.0, -1.0, 1.0, 0.01),
        ParamSpec("vibrance", "Vibração", "float", 0.0, -1.0, 1.0, 0.01, help="Satura mais as cores apagadas"),
        ParamSpec("temperature", "Temperatura", "float", 0.0, -1.0, 1.0, 0.01, help="Frio ↔ quente"),
        ParamSpec("tint", "Matiz", "float", 0.0, -1.0, 1.0, 0.01, help="Verde ↔ magenta"),
    )

    def apply(self, image: np.ndarray, v: dict[str, Any]) -> np.ndarray:
        rgb = _rgb(image).copy()
        if v["exposure"]:
            rgb *= 2.0 ** v["exposure"]
        if v["temperature"] or v["tint"]:
            t, g = v["temperature"] * 0.15, v["tint"] * 0.12
            rgb *= np.array([1 + t, 1 - g, 1 - t], dtype=np.float32)
        if v["brightness"]:
            b = v["brightness"]
            # Curva suave: clareia/escurece sem estourar os brancos
            rgb = np.clip(rgb, 0, None)
            rgb = 1 - (1 - np.clip(rgb, 0, 1)) ** (1 + b) if b > 0 else rgb ** (1 - b)
        if v["highlights"] or v["shadows"]:
            lum = np.clip(rgb @ _LUMA, 0, 1)[..., None]
            hi_w = np.clip((lum - 0.5) * 2, 0, 1) ** 2
            sh_w = np.clip((0.5 - lum) * 2, 0, 1) ** 2
            rgb = rgb + hi_w * v["highlights"] * 0.35 + sh_w * v["shadows"] * 0.35
        if v["contrast"]:
            c = v["contrast"]
            factor = (1 + c) if c < 0 else 1 + c * 1.5
            rgb = (rgb - 0.5) * factor + 0.5
        if v["saturation"] or v["vibrance"]:
            lum = (rgb @ _LUMA)[..., None]
            sat = 1 + v["saturation"]
            if v["vibrance"]:
                chroma = np.max(rgb, axis=2, keepdims=True) - np.min(rgb, axis=2, keepdims=True)
                sat = sat + v["vibrance"] * (1 - np.clip(chroma * 1.5, 0, 1))
            rgb = lum + (rgb - lum) * sat
        return _with_rgb(image, np.clip(rgb, 0, 1).astype(np.float32))


class Sharpen(Operation):
    id = "sharpen"
    name = "Nitidez"
    category = "Detalhes"
    description = "Realça bordas e detalhes (máscara de nitidez)."
    supports_region = True
    params = (
        ParamSpec("amount", "Intensidade", "float", 0.6, 0.0, 3.0, 0.05),
        ParamSpec("radius", "Raio", "float", 0.15, 0.02, 1.0, 0.01, help="% do maior lado da imagem"),
        ParamSpec("threshold", "Limiar", "float", 0.02, 0.0, 0.2, 0.005, help="Ignora variações pequenas (evita realçar ruído)"),
    )

    def apply(self, image: np.ndarray, v: dict[str, Any]) -> np.ndarray:
        rgb = _rgb(image)
        sigma = max(0.3, v["radius"] / 100 * max(rgb.shape[:2]))
        blurred = cv2.GaussianBlur(rgb, (0, 0), sigmaX=sigma, sigmaY=sigma)
        detail = rgb - blurred
        if v["threshold"] > 0:
            mag = np.abs(detail).max(axis=2, keepdims=True)
            detail = detail * np.clip((mag - v["threshold"]) / max(v["threshold"], 1e-6), 0, 1)
        return _with_rgb(image, np.clip(rgb + detail * v["amount"], 0, 1).astype(np.float32))


class Smooth(Operation):
    id = "smooth"
    name = "Suavizar"
    category = "Detalhes"
    description = "Reduz ruído e textura preservando bordas (filtro bilateral)."
    supports_region = True
    params = (
        ParamSpec("strength", "Intensidade", "float", 0.4, 0.0, 1.0, 0.01),
        ParamSpec("radius", "Raio", "float", 0.3, 0.05, 2.0, 0.01, help="% do maior lado da imagem"),
        ParamSpec("preserve_edges", "Preservar bordas", "float", 0.5, 0.0, 1.0, 0.01),
    )

    def apply(self, image: np.ndarray, v: dict[str, Any]) -> np.ndarray:
        if v["strength"] <= 0:
            return image
        rgb = _rgb(image)
        long_side = max(rgb.shape[:2])
        sigma_space = max(1.0, v["radius"] / 100 * long_side)
        sigma_color = 0.02 + (1 - v["preserve_edges"]) * 0.25
        # Bilateral fica caro com raio grande; trabalha numa cópia reduzida quando precisa
        scale = min(1.0, 6.0 / sigma_space) if sigma_space > 6 else 1.0
        src = rgb
        if scale < 1.0:
            src = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        filtered = cv2.bilateralFilter(src, d=-1, sigmaColor=sigma_color, sigmaSpace=sigma_space * scale)
        if scale < 1.0:
            # Volta ao tamanho original (o filtro só atenua detalhes, então a perda é pequena)
            filtered = cv2.resize(filtered, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)
        out = rgb + (filtered - rgb) * v["strength"]
        return _with_rgb(image, np.clip(out, 0, 1).astype(np.float32))


class Crop(Operation):
    id = "crop"
    name = "Recortar"
    category = "Geometria"
    description = "Recorta uma área retangular da imagem."
    geometric = True
    ui = "crop"
    params = (
        ParamSpec("x", "Esquerda", "float", 0.0, 0.0, 1.0, 0.001),
        ParamSpec("y", "Topo", "float", 0.0, 0.0, 1.0, 0.001),
        ParamSpec("w", "Largura", "float", 1.0, 0.01, 1.0, 0.001),
        ParamSpec("h", "Altura", "float", 1.0, 0.01, 1.0, 0.001),
    )

    def check(self, v: dict[str, Any]) -> None:
        if v["x"] + v["w"] > 1.0001 or v["y"] + v["h"] > 1.0001:
            raise OperationError("O recorte precisa ficar dentro da imagem")

    def apply(self, image: np.ndarray, v: dict[str, Any]) -> np.ndarray:
        h, w = image.shape[:2]
        x0, y0 = round(v["x"] * w), round(v["y"] * h)
        x1 = min(w, max(x0 + 1, round((v["x"] + v["w"]) * w)))
        y1 = min(h, max(y0 + 1, round((v["y"] + v["h"]) * h)))
        return np.ascontiguousarray(image[y0:y1, x0:x1])


class Rotate(Operation):
    id = "rotate"
    name = "Girar e endireitar"
    category = "Geometria"
    description = "Gira em passos de 90°, espelha e endireita (corta as bordas vazias)."
    geometric = True
    params = (
        ParamSpec("quarter_turns", "Girar", "choice", "0",
                  options=(("0", "0°"), ("1", "90° ↻"), ("2", "180°"), ("3", "90° ↺"))),
        ParamSpec("straighten", "Endireitar", "float", 0.0, -45.0, 45.0, 0.1, help="Graus"),
        ParamSpec("flip_h", "Espelhar na horizontal", "bool", False),
        ParamSpec("flip_v", "Espelhar na vertical", "bool", False),
    )

    def apply(self, image: np.ndarray, v: dict[str, Any]) -> np.ndarray:
        out = image
        turns = int(v["quarter_turns"])
        if turns:
            out = np.rot90(out, k=-turns)  # positivo = sentido horário
        if v["flip_h"]:
            out = out[:, ::-1]
        if v["flip_v"]:
            out = out[::-1]
        out = np.ascontiguousarray(out)
        if v["straighten"]:
            out = _rotate_and_crop(out, v["straighten"])
        return out


def _rotate_and_crop(image: np.ndarray, degrees: float) -> np.ndarray:
    """Gira e corta o maior retângulo sem bordas vazias (mantém a proporção)."""
    h, w = image.shape[:2]
    angle = math.radians(abs(degrees))
    sin_a, cos_a = math.sin(angle), math.cos(angle)
    # Fator de escala para que o retângulo original caiba dentro da imagem girada
    scale = min(w / (w * cos_a + h * sin_a), h / (w * sin_a + h * cos_a))
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), -degrees, 1.0)
    rotated = cv2.warpAffine(image, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    cw, ch = max(1, int(w * scale)), max(1, int(h * scale))
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    return np.ascontiguousarray(np.clip(rotated[y0:y0 + ch, x0:x0 + cw], 0, 1))


ALL_OPERATIONS: tuple[Operation, ...] = (Adjust(), Sharpen(), Smooth(), Crop(), Rotate())
