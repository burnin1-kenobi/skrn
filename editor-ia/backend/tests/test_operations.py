import numpy as np
import pytest

from app.services.editing import pipeline
from app.services.editing.base import OperationError


def img(h=100, w=200, c=3, value=0.5):
    rng = np.random.default_rng(0)
    return np.clip(rng.normal(value, 0.1, (h, w, c)), 0, 1).astype(np.float32)


def run(image, steps):
    return pipeline.run(image, pipeline.parse_steps(steps))


def test_default_params_change_nothing():
    base = img()
    out = run(base, [{"op": "adjust"}, {"op": "rotate"}, {"op": "crop"}])
    assert np.allclose(out, base, atol=1e-6)


def test_exposure_brightens():
    base = img(value=0.3)
    out = run(base, [{"op": "adjust", "params": {"exposure": 1}}])
    assert out.mean() > base.mean() * 1.5
    assert out.max() <= 1 and out.min() >= 0


def test_saturation_minus_one_is_grayscale():
    out = run(img(), [{"op": "adjust", "params": {"saturation": -1}}])
    assert np.allclose(out[..., 0], out[..., 1], atol=1e-5)


def test_region_limits_effect():
    base = img(value=0.4)
    out = run(base, [{"op": "adjust", "params": {"exposure": 1.5},
                      "region": {"shape": "rect", "x": 0, "y": 0, "w": 0.5, "h": 1, "feather": 0}}])
    assert np.allclose(out[:, 150:], base[:, 150:])
    assert out[:, :50].mean() > base[:, :50].mean() + 0.1


def test_inverted_region():
    base = img(value=0.4)
    out = run(base, [{"op": "adjust", "params": {"exposure": 1.5},
                      "region": {"shape": "rect", "x": 0, "y": 0, "w": 0.5, "h": 1, "feather": 0, "invert": True}}])
    assert np.allclose(out[:, :50], base[:, :50])


def test_crop_is_resolution_independent():
    steps = [{"op": "crop", "params": {"x": 0.25, "y": 0.5, "w": 0.5, "h": 0.5}}]
    assert run(img(100, 200), steps).shape == (50, 100, 3)
    assert run(img(400, 800), steps).shape == (200, 400, 3)


def test_rotate_quarter_and_flip():
    base = img(100, 200)
    assert run(base, [{"op": "rotate", "params": {"quarter_turns": "1"}}]).shape == (200, 100, 3)
    flipped = run(base, [{"op": "rotate", "params": {"flip_h": True}}])
    assert np.allclose(flipped[:, 0], base[:, -1])


def test_straighten_keeps_aspect_and_has_no_empty_borders():
    base = np.ones((300, 400, 3), np.float32) * 0.8
    out = run(base, [{"op": "rotate", "params": {"straighten": 10}}])
    assert abs(out.shape[1] / out.shape[0] - 400 / 300) < 0.02
    assert out.min() > 0.79


def test_sharpen_and_smooth_preserve_alpha():
    base = img(c=4)
    for op in ("sharpen", "smooth"):
        out = run(base, [{"op": op}])
        assert out.shape == base.shape
        assert np.allclose(out[..., 3], base[..., 3])


def test_smooth_reduces_noise():
    base = img()
    out = run(base, [{"op": "smooth", "params": {"strength": 1, "preserve_edges": 0}}])
    assert out.std() < base.std()


@pytest.mark.parametrize("steps, msg", [
    ([{"op": "nao-existe"}], "não existe"),
    ([{"op": "adjust", "params": {"exposure": 9}}], "fora do intervalo"),
    ([{"op": "adjust", "params": {"foo": 1}}], "desconhecidos"),
    ([{"op": "crop", "params": {"x": 0.8, "w": 0.5}}], "dentro da imagem"),
    ([{"op": "rotate", "params": {"quarter_turns": "5"}}], "inválido"),
    ([{"op": "rotate", "region": {"x": 0, "y": 0, "w": 1, "h": 1}}], "região"),
    ([{"op": "adjust", "params": {"exposure": float("nan")}}], "inválido"),
    ([{"op": "adjust", "params": {"exposure": True}}], "inválido"),
])
def test_invalid_operations(steps, msg):
    with pytest.raises(OperationError, match=msg):
        pipeline.parse_steps(steps)


def test_original_array_is_never_modified():
    base = img()
    base.setflags(write=False)
    copy = base.copy()
    run(base, [{"op": "adjust", "params": {"exposure": 1, "contrast": 0.5}}, {"op": "sharpen"}, {"op": "smooth"}])
    assert np.array_equal(base, copy)
