"""Renderização de prévias e versões, com cache do original decodificado."""
from __future__ import annotations

import threading
from collections import OrderedDict
from pathlib import Path

import numpy as np

from app.services.editing import pipeline
from app.services.image import io as imgio


class ArrayCache:
    """Guarda poucas imagens decodificadas na memória para a prévia ficar rápida."""

    def __init__(self, max_items: int = 6) -> None:
        self.max_items = max_items
        self._data: OrderedDict[tuple, np.ndarray] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, path: Path, max_side: int | None) -> np.ndarray:
        key = (str(path), max_side, path.stat().st_mtime_ns)
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                return self._data[key]
        array = imgio.load_array(path, max_side=max_side)
        array.setflags(write=False)  # as operações nunca alteram o original
        with self._lock:
            self._data[key] = array
            while len(self._data) > self.max_items:
                self._data.popitem(last=False)
        return array

    def forget(self, path: Path) -> None:
        with self._lock:
            for key in [k for k in self._data if k[0] == str(path)]:
                del self._data[key]


cache = ArrayCache()


def render(original: Path, steps: list[pipeline.ValidatedStep], *, max_side: int | None) -> np.ndarray:
    base = cache.get(original, max_side)
    return pipeline.run(base, steps)
