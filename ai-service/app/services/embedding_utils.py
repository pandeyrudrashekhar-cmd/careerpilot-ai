import math
from typing import Any

from app.core.config import EMBEDDING_DIMENSIONS
from app.core.errors import ProviderError


def validate_embedding(
    value: Any, dimensions: int = EMBEDDING_DIMENSIONS
) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != dimensions:
        raise ProviderError(f"Embedding provider must return {dimensions} dimensions")
    if any(
        isinstance(component, bool) or not isinstance(component, (int, float))
        for component in value
    ):
        raise ProviderError("Embedding provider returned an invalid vector")
    try:
        vector = [float(component) for component in value]
    except (TypeError, ValueError, OverflowError) as exc:
        raise ProviderError("Embedding provider returned an invalid vector") from exc
    if not all(math.isfinite(component) for component in vector):
        raise ProviderError("Embedding provider returned a non-finite vector")
    return vector
