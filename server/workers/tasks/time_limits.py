"""Celery time limits and fixed error texts for tasks that render user-supplied templates.

A user template can loop for a very long time; the limits stop it from pinning a worker.
Generation tasks include the AI calls. The on-demand PDF render has its own limits
(services/document_renderer.py).
"""

from intelligence.service import (
    AI_MAX_RETRIES,
    AI_REQUEST_TIMEOUT_SECONDS,
    OLLAMA_MAX_RETRIES,
    OLLAMA_REQUEST_TIMEOUT_SECONDS,
)

# The OpenAI SDK catches SoftTimeLimitExceeded like any error inside its retry loop and retries the
# request (AI_MAX_RETRIES = 1). So after the soft limit one more cloud AI request plus its backoff
# (at most 8 s in the SDK) can run before the task sees the error; a hard limit closer than that
# would kill the worker before it records the failure.
AI_RETRY_BACKOFF_MARGIN_SECONDS = 30
SOFT_LIMIT_AI_GRACE_SECONDS = AI_REQUEST_TIMEOUT_SECONDS + AI_RETRY_BACKOFF_MARGIN_SECONDS

GENERATION_SOFT_TIME_LIMIT_SECONDS = 240
GENERATION_HARD_TIME_LIMIT_SECONDS = GENERATION_SOFT_TIME_LIMIT_SECONDS + SOFT_LIMIT_AI_GRACE_SECONDS  # 390
# A job still GENERATING this long after the hard limit lost its worker (hard kill, restart).
GENERATION_SWEEP_MARGIN_SECONDS = 120
GENERATION_SWEEP_INTERVAL_SECONDS = 60.0
# The CV template fill is one AI call, which may take up to OLLAMA_REQUEST_TIMEOUT_SECONDS (600 s).
FILL_SOFT_TIME_LIMIT_SECONDS = 660
FILL_HARD_TIME_LIMIT_SECONDS = FILL_SOFT_TIME_LIMIT_SECONDS + SOFT_LIMIT_AI_GRACE_SECONDS  # 810
# The interview prep asks for up to 10000 tokens in one non-streamed call, and OpenRouter answers
# 200 OK before the model writes a token: without a limit a slow model keeps the task silent forever.
PREP_SOFT_TIME_LIMIT_SECONDS = 600
PREP_HARD_TIME_LIMIT_SECONDS = PREP_SOFT_TIME_LIMIT_SECONDS + SOFT_LIMIT_AI_GRACE_SECONDS  # 750

GENERATION_TIMEOUT_ERROR = "Die Erstellung hat zu lange gedauert und wurde abgebrochen."
GENERATION_FAILED_ERROR = "Die Erstellung ist fehlgeschlagen. Bitte versuche es erneut."
# A job's company research: one short call that identifies an unknown domain, then the profile call,
# which asks for as many tokens as the interview prep.
RESEARCH_SOFT_TIME_LIMIT_SECONDS = PREP_SOFT_TIME_LIMIT_SECONDS + AI_REQUEST_TIMEOUT_SECONDS  # 720
RESEARCH_HARD_TIME_LIMIT_SECONDS = RESEARCH_SOFT_TIME_LIMIT_SECONDS + SOFT_LIMIT_AI_GRACE_SECONDS  # 870

# The posting details extraction is one short AI call over the posting text.
POSTING_DETAILS_SOFT_TIME_LIMIT_SECONDS = 120
POSTING_DETAILS_HARD_TIME_LIMIT_SECONDS = POSTING_DETAILS_SOFT_TIME_LIMIT_SECONDS + SOFT_LIMIT_AI_GRACE_SECONDS  # 270
# The endpoint stamps the run when it queues the task, and the worker re-stamps it on start. The sweep
# cannot tell the two apart (the stamp is also what the UI reads as "running"), so it grants a queue wait
# on top of the hard limit before it declares the run lost.
POSTING_DETAILS_QUEUE_WAIT_SECONDS = 600

# The CV import and the deep dive run their one AI call inside the request, so no Celery limit ends them:
# the client timeout does. The longest run is the slower provider with all its attempts plus the SDK backoff.
SYNC_AI_RUN_LIMIT_SECONDS = max(
    AI_REQUEST_TIMEOUT_SECONDS * (AI_MAX_RETRIES + 1),
    OLLAMA_REQUEST_TIMEOUT_SECONDS * (OLLAMA_MAX_RETRIES + 1),
) + AI_RETRY_BACKOFF_MARGIN_SECONDS  # 630

# Fixed codes in jobs.company_research_error; the web client maps each to its own text.
RESEARCH_DOMAIN_NOT_FOUND = "DOMAIN_NOT_FOUND"
RESEARCH_FAILED = "RESEARCH_FAILED"
# Fixed codes in jobs.posting_details_error; the web client maps each to its own text.
POSTING_DETAILS_FAILED = "EXTRACTION_FAILED"
# The run succeeded, but the posting states nothing new: no detail found, or every field is already filled.
POSTING_DETAILS_NOTHING_NEW = "NOTHING_NEW"
# The AI provider could not be reached (connection refused or dropped, DNS, timeout), even after the retry.
RESEARCH_AI_UNREACHABLE = "AI_UNREACHABLE"
