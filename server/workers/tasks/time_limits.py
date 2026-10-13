"""Celery time limits and fixed error texts for tasks that render user-supplied templates.

A user template can loop for a very long time; the limits stop it from pinning a worker.
Generation tasks include the AI calls, so their limits are far larger than the pure PDF render.
"""

from intelligence.service import AI_REQUEST_TIMEOUT_SECONDS

# The OpenAI SDK catches SoftTimeLimitExceeded like any error inside its retry loop and retries the
# request (AI_MAX_RETRIES = 1). So after the soft limit one more cloud AI request plus its backoff
# (at most 8 s in the SDK) can run before the task sees the error; a hard limit closer than that
# would kill the worker before it records the failure.
AI_RETRY_BACKOFF_MARGIN_SECONDS = 30
SOFT_LIMIT_AI_GRACE_SECONDS = AI_REQUEST_TIMEOUT_SECONDS + AI_RETRY_BACKOFF_MARGIN_SECONDS

RENDER_SOFT_TIME_LIMIT_SECONDS = 60
RENDER_HARD_TIME_LIMIT_SECONDS = 90
GENERATION_SOFT_TIME_LIMIT_SECONDS = 240
GENERATION_HARD_TIME_LIMIT_SECONDS = GENERATION_SOFT_TIME_LIMIT_SECONDS + SOFT_LIMIT_AI_GRACE_SECONDS  # 390
# A job still GENERATING this long after the hard limit lost its worker (hard kill, restart).
GENERATION_SWEEP_MARGIN_SECONDS = 120
GENERATION_SWEEP_INTERVAL_SECONDS = 60.0
# The CV template fill is one AI call, which may take up to OLLAMA_REQUEST_TIMEOUT_SECONDS (600 s).
FILL_SOFT_TIME_LIMIT_SECONDS = 660
FILL_HARD_TIME_LIMIT_SECONDS = FILL_SOFT_TIME_LIMIT_SECONDS + SOFT_LIMIT_AI_GRACE_SECONDS  # 810

GENERATION_TIMEOUT_ERROR = "Die Erstellung hat zu lange gedauert und wurde abgebrochen."
GENERATION_FAILED_ERROR = "Die Erstellung ist fehlgeschlagen. Bitte versuche es erneut."
