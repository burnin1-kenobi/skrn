"""Executa uma lista de operações sobre a imagem original.

O pipeline é sempre recalculado a partir do original: nada é sobrescrito,
e a mesma lista gera a prévia (reduzida) e a versão final (resolução total).
"""
from __future__ import annotations

from typing import Any

import numpy as np
from pydantic import BaseModel, Field, ValidationError

from . import registry
from .base import OperationError
from .region import Region, build_mask

MAX_OPERATIONS = 100


class OperationStep(BaseModel):
    op: str = Field(min_length=1, max_length=64)
    params: dict[str, Any] = Field(default_factory=dict)
    region: Region | None = None


class ValidatedStep:
    __slots__ = ("op", "values", "region")

    def __init__(self, op, values, region):
        self.op, self.values, self.region = op, values, region


def validate_steps(steps: list[OperationStep]) -> list[ValidatedStep]:
    if len(steps) > MAX_OPERATIONS:
        raise OperationError(f"No máximo {MAX_OPERATIONS} operações por edição")
    out = []
    for i, step in enumerate(steps, start=1):
        op = registry.get(step.op)
        if op is None:
            raise OperationError(f"Operação {i}: '{step.op}' não existe")
        if step.region is not None and not op.supports_region:
            raise OperationError(f"Operação {i}: '{op.name}' não pode ser aplicada numa região")
        try:
            values = op.validate(step.params)
        except OperationError as exc:
            raise OperationError(f"Operação {i} ({op.name}): {exc}") from None
        out.append(ValidatedStep(op, values, step.region))
    return out


def parse_steps(raw: list[dict[str, Any]]) -> list[ValidatedStep]:
    try:
        steps = [OperationStep.model_validate(s) for s in raw]
    except ValidationError as exc:
        raise OperationError(f"Lista de operações inválida: {exc.errors()[0].get('msg')}") from None
    return validate_steps(steps)


def run(image: np.ndarray, steps: list[ValidatedStep]) -> np.ndarray:
    """`image`: float32 HxWxC em 0..1. Devolve uma nova matriz."""
    out = image
    for step in steps:
        result = step.op.apply(out, step.values)
        if step.region is not None:
            mask = build_mask(step.region, out.shape[0], out.shape[1])
            if out.shape[2] == 4:
                mask = np.concatenate([np.repeat(mask, 3, axis=2), np.zeros_like(mask)], axis=2)
            result = out + (result - out) * mask
        out = result.astype(np.float32, copy=False)
    return out
