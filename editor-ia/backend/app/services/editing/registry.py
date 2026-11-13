"""Registro de operações disponíveis.

Para adicionar um motor novo (por exemplo um modelo de IA em
app/services/ai/), basta implementar `Operation` e chamar `register`.
"""
from __future__ import annotations

from .base import Operation
from .operations import ALL_OPERATIONS

_REGISTRY: dict[str, Operation] = {}


def register(op: Operation) -> None:
    if op.id in _REGISTRY:
        raise ValueError(f"Operação duplicada: {op.id}")
    _REGISTRY[op.id] = op


def get(op_id: str) -> Operation | None:
    return _REGISTRY.get(op_id)


def all_operations() -> list[Operation]:
    return list(_REGISTRY.values())


for _op in ALL_OPERATIONS:
    register(_op)
