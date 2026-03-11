"""
Review API Client - Gehaltsdaten via AI-Schätzung.
Die Bundesagentur Entgeltatlas API erfordert OAuth2-Credentials (nicht öffentlich zugänglich).
Alle Gehaltsdaten werden daher als KI-Schätzung mit is_estimate=True zurückgegeben.
"""
import logging
import json
from typing import Dict, Any

logger = logging.getLogger(__name__)


def get_salary_data(job_title: str, location: str = "Deutschland") -> Dict[str, Any]:
    """
    Gibt eine KI-basierte Gehaltsschätzung zurück.
    is_estimate=True wird immer gesetzt – UI zeigt entsprechenden Warnhinweis.
    """
    import sys
    import os
    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if server_dir not in sys.path:
        sys.path.insert(0, server_dir)

    from intelligence_service import get_ai_client, get_model

    client = get_ai_client()
    model = get_model()

    prompt = f"""Schätze das Jahresgehalt (brutto) für folgende Position in {location}.

Position: {job_title}

Antworte NUR mit diesem JSON-Objekt:
{{
  "min": 55000,
  "max": 85000,
  "median": 70000,
  "currency": "EUR",
  "period": "annual",
  "confidence": "medium"
}}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        result = json.loads(content)
        result["is_estimate"] = True
        result["source"] = "ai_estimate"
        return result
    except Exception as e:
        logger.error(f"Salary estimate error for '{job_title}': {e}")
        return {
            "min": None,
            "max": None,
            "median": None,
            "currency": "EUR",
            "period": "annual",
            "is_estimate": True,
            "source": "ai_estimate",
        }
