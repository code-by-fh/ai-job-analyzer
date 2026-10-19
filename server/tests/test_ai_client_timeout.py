import logging
import socket
from unittest.mock import MagicMock, patch

import httpx
from openai import APIConnectionError
import pytest

from intelligence.service import (
    AI_MAX_RETRIES,
    AI_REQUEST_TIMEOUT_SECONDS,
    _call_openrouter,
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


LOCAL_AI_URL = "http://host.docker.internal:11434/v1/"
DNS_FAILURE = socket.gaierror(-2, "Name or service not known")


def _client_without_connection(base_url=LOCAL_AI_URL):
    """AI client stand-in (the system boundary) whose request fails like the SDK's on a DNS error."""
    error = APIConnectionError(request=httpx.Request("POST", f"{LOCAL_AI_URL}chat/completions"))
    error.__cause__ = DNS_FAILURE
    client = MagicMock(base_url=base_url)
    client.chat.completions.create.side_effect = error
    return client


def test_a_connection_error_logs_the_target_and_the_underlying_cause(caplog, fake_redis):
    with patch("intelligence.service._get_redis", return_value=fake_redis), \
         caplog.at_level(logging.ERROR, logger="intelligence.service"), \
         pytest.raises(APIConnectionError):
        _call_openrouter(_client_without_connection(), "model", [], func_name="identify_company_domain")
    assert "host.docker.internal" in caplog.text and "Name or service not known" in caplog.text


def test_a_connection_error_never_logs_the_userinfo_of_the_url(caplog, fake_redis):
    client = _client_without_connection("http://user:pass@host.docker.internal:11434/v1/")
    with patch("intelligence.service._get_redis", return_value=fake_redis), \
         caplog.at_level(logging.ERROR, logger="intelligence.service"), \
         pytest.raises(APIConnectionError):
        _call_openrouter(client, "model", [], func_name="identify_company_domain")
    assert "host.docker.internal" in caplog.text
    assert "user:pass" not in caplog.text
