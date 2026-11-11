import asyncio
import math
import os

import cpuinfo
import pytest

from app.core.config import EMBEDDING_DIMENSIONS, Settings
from app.services.local_embedding_provider import LocalEmbeddingProvider, get_local_model


pytestmark = pytest.mark.skipif(
    os.environ.get("CAREERPILOT_RUN_ONNX_SMOKE") != "1",
    reason="Set CAREERPILOT_RUN_ONNX_SMOKE=1 to download and validate the ONNX model",
)


def test_pinned_onnx_model_download_and_cpu_embedding(tmp_path):
    import resource

    cpu_flags = set(cpuinfo.get_cpu_info().get("flags", []))
    assert "avx2" in cpu_flags, "The pinned quantized model requires an AVX2-capable CPU"

    settings = Settings(_env_file=None, local_embedding_cache_dir=tmp_path)
    model = get_local_model(tmp_path)
    vectors = asyncio.run(
        LocalEmbeddingProvider(settings).embed_texts(
            ["Linux CPU embedding smoke test", "CareerPilot model validation"]
        )
    )

    assert model.session.get_providers() == ["CPUExecutionProvider"]
    assert len(vectors) == 2
    for vector in vectors:
        assert len(vector) == EMBEDDING_DIMENSIONS
        assert all(math.isfinite(value) for value in vector)
        assert math.isclose(
            math.sqrt(sum(value * value for value in vector)),
            1.0,
            rel_tol=0.0,
            abs_tol=1e-4,
        )

    peak_rss_mib = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"ONNX smoke peak RSS: {peak_rss_mib:.1f} MiB")
    assert peak_rss_mib < 2048, "ONNX model smoke exceeded the 2 GiB memory budget"
