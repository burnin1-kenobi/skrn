"""Contrato comum de todos os motores de edição.

Cada operação (clássica ou de IA) declara:
- identificação, versão e licença;
- requisitos de hardware;
- parâmetros com limites (o frontend monta os controles a partir disso);
- se aceita ser aplicada só numa região (máscara).

A interface nunca chama um modelo diretamente: ela envia uma lista de
operações para a API, que valida e executa por este contrato.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from typing import Any, Literal

import numpy as np

ParamType = Literal["float", "int", "bool", "choice"]


class OperationError(ValueError):
    """Parâmetros inválidos ou falha previsível de uma operação."""


@dataclass(frozen=True)
class ParamSpec:
    id: str
    label: str
    type: ParamType
    default: Any
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: tuple[tuple[str, str], ...] | None = None  # (valor, rótulo)
    help: str | None = None
    group: str | None = None  # agrupa controles em seções no painel

    def coerce(self, value: Any) -> Any:
        if value is None:
            return self.default
        try:
            if self.type == "bool":
                if isinstance(value, bool):
                    return value
                raise TypeError
            if self.type == "choice":
                value = str(value)
                if value not in {v for v, _ in (self.options or ())}:
                    raise ValueError
                return value
            num = float(value) if self.type == "float" else int(value)
        except (TypeError, ValueError):
            raise OperationError(f"Parâmetro '{self.id}' inválido") from None
        if isinstance(value, bool) or not np.isfinite(num):
            raise OperationError(f"Parâmetro '{self.id}' inválido")
        if (self.min is not None and num < self.min) or (self.max is not None and num > self.max):
            raise OperationError(f"Parâmetro '{self.id}' fora do intervalo {self.min}..{self.max}")
        return num

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if self.options is not None:
            d["options"] = [{"value": v, "label": lbl} for v, lbl in self.options]
        return {k: v for k, v in d.items() if v is not None}


@dataclass(frozen=True)
class EngineInfo:
    kind: Literal["classic", "ai"] = "classic"
    version: str = "1.0.0"
    license: str = "Código próprio do projeto"
    requires_gpu: bool = False
    min_vram_gb: float | None = None
    backend: str = "OpenCV + NumPy"


class Operation(ABC):
    id: str
    name: str
    category: str
    description: str
    params: tuple[ParamSpec, ...] = ()
    supports_region: bool = False
    #: Operações geométricas mudam o tamanho/posição dos pixels.
    geometric: bool = False
    #: Dica para o frontend escolher um controle especial (ex.: "crop").
    ui: str | None = None
    engine: EngineInfo = EngineInfo()

    def validate(self, raw: dict[str, Any] | None) -> dict[str, Any]:
        raw = raw or {}
        known = {p.id for p in self.params}
        unknown = set(raw) - known
        if unknown:
            raise OperationError(f"Parâmetros desconhecidos para '{self.id}': {', '.join(sorted(unknown))}")
        values = {p.id: p.coerce(raw.get(p.id)) for p in self.params}
        self.check(values)
        return values

    def check(self, values: dict[str, Any]) -> None:
        """Validações que envolvem mais de um parâmetro."""

    @abstractmethod
    def apply(self, image: np.ndarray, values: dict[str, Any]) -> np.ndarray:
        """Recebe e devolve float32 HxWxC (C=3 RGB ou 4 RGBA), valores 0..1."""

    def describe(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "supports_region": self.supports_region,
            "geometric": self.geometric,
            "ui": self.ui,
            "engine": asdict(self.engine),
            "params": [p.to_dict() for p in self.params],
        }
