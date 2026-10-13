from unittest.mock import patch

from intelligence.service import (
    AI_MAX_RETRIES,
    AI_REQUEST_TIMEOUT_SECONDS,
    OLLAMA_MAX_RETRIES,
    OLLAMA_REQUEST_TIMEOUT_SECONDS,
    get_ai_client,
    get_ollama_client,
)
from core.crawl_registry import STALE_NO_PROGRESS_SECONDS


def test_the_ai_client_has_a_timeout_and_bounded_retries():
    with patch("intelligence.service.OpenAI") as client:
        get_ai_client(api_key="key")
    kwargs = client.call_args.kwargs
    assert (kwargs["timeout"], kwargs["max_retries"]) == (AI_REQUEST_TIMEOUT_SECONDS, AI_MAX_RETRIES)


def test_one_analysis_call_cannot_outlast_the_stall_threshold():
    assert AI_REQUEST_TIMEOUT_SECONDS * (AI_MAX_RETRIES + 1) < STALE_NO_PROGRESS_SECONDS


def test_the_ollama_client_has_a_timeout_and_bounded_retries():
    with patch("intelligence.service.OpenAI") as client, \
         patch("intelligence.service.get_ollama_base_url", return_value="http://ollama:11434/v1"):
        get_ollama_client()
    kwargs = client.call_args.kwargs
    assert (kwargs["timeout"], kwargs["max_retries"]) == (OLLAMA_REQUEST_TIMEOUT_SECONDS, OLLAMA_MAX_RETRIES)


def test_one_local_call_cannot_outlast_the_stall_threshold():
    assert OLLAMA_REQUEST_TIMEOUT_SECONDS * (OLLAMA_MAX_RETRIES + 1) < STALE_NO_PROGRESS_SECONDS
