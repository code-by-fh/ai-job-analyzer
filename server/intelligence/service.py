import os
import json
import re
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from openai import (
    OpenAI,
    NotFoundError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
)
from urllib.parse import urlparse
import redis as _redis_sync

from intelligence.prompts import (
    get_detect_url_pattern_messages,
    get_generate_platform_name_messages,
    get_analyze_job_messages,
    get_generate_application_messages,
    get_interview_prep_messages,
    get_company_profile_summary_messages,
    get_extract_job_details_messages,
    get_deep_dive_messages,
)

logger = logging.getLogger(__name__)

AI_404_REDIS_KEY = "system:ai_404_error"


def _get_redis():
    return _redis_sync.from_url(
        os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"),
        decode_responses=True,
    )


def store_ai_404_error(message: str) -> None:
    try:
        r = _get_redis()
        r.set(AI_404_REDIS_KEY, message)
        r.publish("job_updates", json.dumps({"type": "ai_error", "message": message}))
    except Exception as e:
        logger.error(f"Failed to store AI 404 error: {e}")


def clear_ai_404_error() -> None:
    try:
        r = _get_redis()
        r.delete(AI_404_REDIS_KEY)
        r.publish("job_updates", json.dumps({"type": "ai_error_cleared"}))
    except Exception as e:
        logger.error(f"Failed to clear AI 404 error: {e}")


def get_api_key(db=None) -> str:
    try:
        if db:
            from database.core import SystemSettings

            settings = db.query(SystemSettings).first()
            if settings and settings.openrouter_api_key:
                return settings.openrouter_api_key.strip()
    except Exception as e:
        logger.error(f"Error fetching API key from DB: {e}")
    return ""


def get_ai_client(api_key: str = None, db: Any = None):
    key = (api_key or get_api_key(db)).strip()
    if not key:
        logger.warning(
            "AI Client initialized WITHOUT API key! OpenRouter calls will likely fail."
        )

    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=key,
        default_headers={
            "HTTP-Referer": "https://github.com/ai-job-analyzer",
            "X-Title": "Job Agent MVP",
        },
    )


def _call_openrouter(
    client,
    model: str,
    messages: list,
    temperature: float = 0.7,
    max_tokens: Optional[int] = None,
    func_name: str = "unknown",
):
    """
    Core wrapper for OpenRouter calls to centralize error handling and logging.
    """
    try:
        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens

        response = client.chat.completions.create(**kwargs)
        clear_ai_404_error()
        return response
    except AuthenticationError as e:
        logger.error(f"OpenRouter 401 in {func_name}: {e}")
        store_ai_404_error(
            "OpenRouter API-Schlüssel ungültig (401). Bitte in den Einstellungen prüfen."
        )
        raise
    except RateLimitError as e:
        logger.error(f"OpenRouter 429 in {func_name}: {e}")
        store_ai_404_error("OpenRouter Rate Limit erreicht (429). Bitte kurz warten.")
        raise
    except NotFoundError as e:
        logger.error(f"OpenRouter 404 in {func_name}: {e}")
        store_ai_404_error(
            "KI-Modell auf OpenRouter nicht gefunden (404). Bitte Modell-Einstellung prüfen."
        )
        raise
    except APIConnectionError as e:
        logger.error(f"OpenRouter connection error in {func_name}: {e}")
        store_ai_404_error(
            "Verbindung zu OpenRouter fehlgeschlagen. Netzwerk oder Service prüfen."
        )
        raise
    except APIStatusError as e:
        logger.error(f"OpenRouter API error {getattr(e, 'status_code', 'unknown')} in {func_name}: {e}")
        store_ai_404_error(
            f"OpenRouter Serverfehler ({getattr(e, 'status_code', 'unknown')}). Bitte später erneut versuchen."
        )
        raise
    except Exception as e:
        logger.error(f"Unexpected error in {func_name}: {e}")
        raise


def get_model(db=None) -> str:
    """Get current AI model from DB settings or fallback."""
    try:
        if db:
            from database.core import SystemSettings

            settings = db.query(SystemSettings).first()
            if settings:
                return settings.openrouter_model
    except Exception:
        pass
    return os.getenv("DEFAULT_MODEL", "tngtech/deepseek-r1t2-chimera:free")


def extract_json(text: str):
    """
    Extracts JSON from a string that might contain markdown code blocks or other text.
    Uses json.loads(..., strict=False) to handle raw control characters.
    """
    # 1. Try to find content within markdown code blocks
    json_match = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE
    )
    if json_match:
        text = json_match.group(1)
    else:
        # 2. Try to find the first '{' and last '}'
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start : end + 1]

    # 3. Load with strict=False to allow control characters (like raw \n)
    try:
        return json.loads(text, strict=False)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON even with robust extraction: {e}")
        logger.debug(f"Raw content: {text}")
        raise


def format_cv_for_prompt(cv_json) -> str:
    if not cv_json:
        return "No detailed experience provided."

    text = "PROFESSIONAL EXPERIENCE:\n"
    for exp in cv_json.get("experience", []):
        if not exp:
            continue
        text += f"- {exp.get('role', '')} bei {exp.get('company', '')} ({exp.get('duration', '')}): {exp.get('description', '')}\n"

    text += "\nPROJECTS:\n"
    for proj in cv_json.get("projects", []):
        if not proj:
            continue
        text += f"- {proj.get('name', '')} (Tech: {proj.get('tech_stack', '')}): {proj.get('description', '')}\n"

    text += f"\nEDUCATION:\n{cv_json.get('education', '')}"
    return text


def detect_url_pattern_with_ai(
    base_url: str, urls_list: list, model: str, api_key: str
) -> tuple:
    """
    Uses AI to detect the job-detail URL path pattern for a domain.
    Returns (pattern: str, job_urls: list[str]).
    Only URLs present in urls_list are returned (anti-hallucination).
    """
    sample = urls_list[:150]
    client = get_ai_client(api_key)
    messages = get_detect_url_pattern_messages(base_url, sample)
    
    response = _call_openrouter(
        client=client,
        model=model,
        messages=messages,
        temperature=0.0,
        func_name="detect_url_pattern_with_ai",
    )
    content = response.choices[0].message.content.strip()
    data = extract_json(content)
    pattern = data.get("pattern", "")
    urls_set = set(urls_list)
    job_urls = [url for url in data.get("job_urls", []) if url in urls_set]
    return pattern, job_urls


def generate_platform_name(
    url: str, db: Any = None, model: str = None, api_key: str = None
) -> str:
    """
    Uses AI to generate a clean, recognizable name for a job platform based on its URL.
    """
    domain = urlparse(url).netloc.replace("www.", "")

    client = get_ai_client(api_key, db=db)
    model_to_use = model or get_model(db=db)
    logger.info(f"Generating platform name for {url} using model {model_to_use}")

    messages = get_generate_platform_name_messages(url)

    try:
        response = _call_openrouter(
            client=client,
            model=model_to_use,
            messages=messages,
            temperature=0.0,
            func_name="generate_platform_name",
        )
        name = response.choices[0].message.content.strip()
        name = name.replace('"', "").replace("'", "").replace("`", "")
        return name
    except Exception as e:
        # For this function, we fallback to domain on ANY error
        logger.debug(f"generate_platform_name fallback triggered for {url}: {e}")
        return domain


def analyze_job(
    job_title: str,
    job_description: str,
    profile_str: str,
    user_language: str = "de",
    model: str = None,
    api_key: str = None,
) -> dict:
    """
    Calls AI to analyze job fit. Returns dict with 'score' and 'reasoning'.
    """
    client = get_ai_client(api_key)

    messages = get_analyze_job_messages(
        job_title=job_title,
        job_description=job_description,
        profile_str=profile_str,
        user_language=user_language,
    )

    response = _call_openrouter(
        client=client,
        model=model,
        messages=messages,
        temperature=0.3,
        func_name="analyze_job",
    )
    content = response.choices[0].message.content.strip()
    data = extract_json(content)
    return data


def generate_application(
    job_title: str,
    job_company: str,
    job_description: str,
    profile_role: str,
    cv_text: str,
    user_language: str = "de",
    model: str = None,
    api_key: str = None,
    improvement_notes: str = None,
    existing_draft: str = None,
) -> str:
    """
    Calls AI to generate a cover letter draft. Returns the raw string content.
    If improvement_notes and existing_draft are provided, only the requested
    changes are applied to the existing draft instead of regenerating from scratch.
    """
    client = get_ai_client(api_key)

    messages = get_generate_application_messages(
        job_title=job_title,
        job_company=job_company,
        job_description=job_description,
        profile_role=profile_role,
        cv_text=cv_text,
        user_language=user_language,
        improvement_notes=improvement_notes,
        existing_draft=existing_draft,
    )
    
    response = _call_openrouter(
        client=client,
        model=model,
        messages=messages,
        temperature=0.7,
        func_name="generate_application",
    )
    return response.choices[0].message.content


def generate_interview_prep(
    job_title: str,
    company_name: str,
    job_description: str,
    cv_summary: str,
    company_culture: Optional[str] = None,
    model: str = None,
    api_key: str = None,
    language: str = "de",
) -> Dict[str, Any]:
    """
    Generate structured interview preparation material.
    Returns dict with: questions, talking_points, company_insights, preparation_tips
    """
    client = get_ai_client(api_key=api_key)
    messages = get_interview_prep_messages(
        job_title=job_title,
        company_name=company_name,
        job_description=job_description,
        user_profile=cv_summary,
        language=language,
    )
    
    try:
        response = _call_openrouter(
            client=client,
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=10000,
            func_name="generate_interview_prep",
        )
        if not response.choices:
            raise ValueError("AI response returned no choices")

        content = response.choices[0].message.content.strip()
        result = extract_json(content)
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse interview prep JSON: {e}")
        return {
            "error": str(e),
            "raw_response": content if "content" in locals() else "",
        }
    except Exception as e:
        logger.error(f"Interview prep generation error: {e}")
        raise


def generate_company_profile_summary(
    company_name: str,
    job_title: str = "",
    industry: str = "",
    key_requirements: str = "",
    user_profile: str = "",
    model: str = None,
    api_key: str = None,
) -> Dict[str, Any]:
    """
    Generate a structured interview preparation guide for a company.
    """
    if not model:
        model = get_model()

    client = get_ai_client(api_key=api_key)
    messages = get_company_profile_summary_messages(
        company_name=company_name,
        job_title=job_title,
        industry=industry,
        key_requirements=key_requirements,
        user_profile=user_profile,
    )
    
    response = _call_openrouter(
        client=client,
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=10000,
        func_name="generate_company_profile_summary",
    )
    content = response.choices[0].message.content.strip()
    result = extract_json(content)
    return result


def generate_deep_dive(
    domain: str,
    company_name: str,
    focus: str,
    how_to_proceed: str,
    model: str = None,
    api_key: str = None,
    language: str = "de",
) -> str:
    """Returns a focused Markdown research report for the given deep dive focus."""
    if not model:
        model = get_model()

    client = get_ai_client(api_key=api_key)
    messages = get_deep_dive_messages(
        domain=domain,
        company_name=company_name,
        focus=focus,
        how_to_proceed=how_to_proceed,
        language=language,
    )

    response = _call_openrouter(
        client=client,
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=2000,
        func_name="generate_deep_dive",
    )
    return response.choices[0].message.content.strip()


def extract_job_details(
    text: str, model: str = None, api_key: str = None, language: str = "de"
) -> str:
    """
    Extracts the core job description from noisy web content.
    Returns only the relevant job description in Markdown.
    """
    if not text:
        return ""

    client = get_ai_client(api_key)
    messages = get_extract_job_details_messages(text=text, language=language)

    try:
        response = _call_openrouter(
            client=client,
            model=model,
            messages=messages,
            temperature=0.0,
            func_name="extract_job_details",
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.debug(f"Error in extract_job_details: {e}")
        return text[:4000]  # Fallback to original behavior
