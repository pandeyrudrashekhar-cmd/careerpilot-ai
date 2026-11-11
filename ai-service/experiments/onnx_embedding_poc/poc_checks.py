from __future__ import annotations

import json

import numpy as np
import pytest

from benchmark import DIMENSIONS, MAX_TOKENS, run_benchmark


@pytest.fixture(scope="session")
def report() -> dict[str, object]:
    result = run_benchmark()
    print("\nONNX embedding POC benchmark:")
    print(json.dumps(result, indent=2))
    return result


def test_model_loads_once_and_runs_on_cpu(report: dict[str, object]) -> None:
    host = report["host"]
    assert "CPUExecutionProvider" in host["execution_providers"]
    assert "avx2" in host["cpu_flags"]
    assert host["avx512_available"] is False
    assert host["onnxruntime_version"]


def test_embeddings_have_expected_shape_and_normalization(
    report: dict[str, object],
) -> None:
    inputs = report["inputs"]
    assert inputs["embedding_shape"] == [3, DIMENSIONS]
    assert inputs["all_values_finite"] is True
    assert np.allclose(inputs["embedding_norms"], 1.0, atol=1e-4)


def test_long_input_is_truncated_at_model_limit(report: dict[str, object]) -> None:
    inputs = report["inputs"]
    assert inputs["raw_token_counts_including_special_tokens"][-1] > MAX_TOKENS
    assert inputs["actual_token_counts_after_truncation"][-1] == MAX_TOKENS


def test_latency_and_memory_measurements_are_positive(
    report: dict[str, object],
) -> None:
    load = report["load"]
    inputs = report["inputs"]
    assert load["cold_model_loading_ms"] > 0
    assert load["peak_rss_mib"] > 0
    assert inputs["single_text_latency"]["median_ms"] > 0
    assert inputs["small_batch_latency"]["median_ms"] > 0


def test_download_artifacts_are_present_in_report(report: dict[str, object]) -> None:
    download = report["download"]
    assert download["model_bytes"] > 0
    assert download["tokenizer_bytes"] > 0
