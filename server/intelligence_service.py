import os
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from openai import OpenAI, NotFoundError, AuthenticationError, RateLimitError, APIConnectionError, APIStatusError
import redis as _redis_sync

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
            from database import SystemSettings
            settings = db.query(SystemSettings).first()
            if settings and settings.openrouter_api_key:
                return settings.openrouter_api_key
    except Exception:
        pass
    return ""


def get_ai_client(api_key: str = None):
    key = api_key or ""
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=key,
    )


def get_model(db=None) -> str:
    """Get current AI model from DB settings or fallback."""
    try:
        if db:
            from database import SystemSettings

            settings = db.query(SystemSettings).first()
            if settings:
                return settings.openrouter_model
    except Exception:
        pass
    return os.getenv("DEFAULT_MODEL", "tngtech/deepseek-r1t2-chimera:free")


def generate_interview_prep(
    job_title: str,
    company_name: str,
    job_description: str,
    cv_summary: str,
    company_culture: Optional[str] = None,
    model: str = None,
    api_key: str = None,
) -> Dict[str, Any]:
    """
    Generate structured interview preparation material.
    Returns dict with: questions, talking_points, company_insights, preparation_tips
    """
    prompt = f"""Du handelst als erfahrener HR-Recruiter und Fachbereichsleiter mit 15+ Jahren Erfahrung in der Personalauswahl für {job_title}-Positionen. Zusätzlich agierst du als Elite-Karrierecoach und psychologischer Profiler. Deine Aufgabe ist eine präzise, CV-basierte Interview-Vorbereitung.

**Rolle:** {job_title}
**Unternehmen:** {company_name}

**STELLENBESCHREIBUNG:**
{job_description[:20000]}

**KANDIDATEN-PROFIL (CV):**
{cv_summary[:10000]}

ERSTELLE EIN JSON-OBJEKT MIT FOLGENDER STRUKTUR:
{{
  "context": {{
    "experts_used": ["HR-Recruiter & Fachbereichsleiter", "Elite-Karrierecoach", "Psychologischer Profiler"],
    "purpose": "Zusammenfassung des Zwecks",
    "potential_gaps": ["Problem 1, das zu lösen ist", "Engpass 2"]
  }},
  "core_research": {{
    "success_factors": ["Faktor 1", "Faktor 2", "Faktor 3", "Faktor 4", "Faktor 5"],
    "hypothesis_evaluation": "Analyse bezüglich Change-Management und Fachkompetenz",
    "counterfactuals": {{
      "risks": ["Was wäre das Risiko, mich einzustellen?"],
      "mitigation": ["Wie ich diese Bedenken proaktiv entkräfte"]
    }}
  }},
  "specifications": {{
    "time_period": "Aktuelle Marktsituation 2024-2026",
    "geographic_location": "Standort-Analyse",
    "industry_focus": "Relevantes Marktsegment",
    "demographic_focus": "Abteilung und Führungskultur",
    "ethical_considerations": "Authentizität und Transferleistung"
  }},
  "report_output": {{
    "executive_summary": "Executive Summary (max. 3 Sätze)",
    "deep_dive_analysis": "Detaillierter Q&A Leitfaden und Verhaltensanalyse im Markdown Format",
    "case_studies": [
      {{
        "title": "Titel der Case Study aus meiner Erfahrung",
        "description": "Meine beste Story passend zur Rolle"
      }}
    ],
    "expert_predictions": [
      "Expertentipp/Prediction 1"
    ],
    "questions_for_interviewer": [
      "Frage 1", "Frage 2", "Frage 3", "Frage 4", "Frage 5", "Frage 6", "Frage 7", "Frage 8", "Frage 9", "Frage 10"
    ],
    "comparative_analysis": [
      {{
        "requirement": "Anforderung der Stelle",
        "my_story": "Meine beste Story/Beispiel",
        "gap_evaluation": "Solution / Match"
      }}
    ]
  }},
  "critical_analysis": {{
    "psychological_questions": [
      {{
        "question": "Unvorhersehbare psychologische Interviewfrage",
        "suggested_answer": "Antwortstrategie (STAR-Methode, emotional intelligent)"
      }}
    ],
    "solution_selling_pitch": "Ich als Lösung für ein spezifisches Problem des Unternehmens",
    "interdisciplinary_connections": "Verbindung von technischem Skillset mit emotionaler Intelligenz"
  }},
  "structured_prep": {{
    "gap_analysis": [
      {{
        "requirement": "Konkrete Anforderung aus der Stellenbeschreibung",
        "cv_status": "Status im CV des Kandidaten (z.B. '3 Jahre Erfahrung' oder 'Nicht vorhanden')",
        "gap_severity": "kein Gap",
        "interview_strategy": "Konkrete Strategie, wie man diesen Punkt im Interview adressiert"
      }}
    ],
    "top5_questions": [
      {{
        "question": "Spezifische, verhaltensbasierte Interviewfrage zugeschnitten auf diese Stelle",
        "type": "behavioral",
        "focus_area": "Welche Kompetenz wird hier geprüft",
        "hint": "STAR-Methode empfohlen"
      }}
    ],
    "elevator_pitch": "Überzeugender, fließender Antworttext auf die Frage 'Erzählen Sie etwas über sich' – verknüpft direkt die Stärken des Kandidaten mit den Bedürfnissen von {company_name}. Ca. 3-4 Sätze.",
    "star_answers": [
      {{
        "requirement": "Die wichtigste Anforderung der Stelle",
        "situation": "Konkreter Kontext aus dem CV des Kandidaten",
        "task": "Was war die spezifische Aufgabe oder Herausforderung?",
        "action": "Was hat der Kandidat konkret getan? (3-5 Schritte)",
        "result": "Messbares Ergebnis mit Zahlen wenn möglich"
      }}
    ],
    "online_references": [
      {{
        "title": "Titel der Ressource",
        "url": "https://www.example.com/artikel",
        "relevance": "Warum ist diese Quelle für die Vorbereitung relevant?"
      }}
    ]
  }}
}}

WICHTIG für structured_prep:
- gap_severity muss exakt einer dieser Werte sein: "kein Gap", "leichter Gap", "kritischer Gap"
- type muss exakt einer dieser Werte sein: "behavioral", "case", "situational"
- Erstelle genau 5 Einträge in top5_questions
- Erstelle genau 2 Einträge in star_answers (die 2 wichtigsten Anforderungen)
- online_references: Suche nach echten, relevanten URLs (Unternehmenswebsite, LinkedIn, Branchenberichte, Fachmedien)
- elevator_pitch soll als gesprochener Text formuliert sein, nicht als Stichpunkte

Antworte NUR mit validem JSON ohne Markdown-Wrapper!"""

    client = get_ai_client(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=10000,
        )
        content = response.choices[0].message.content.strip()
        # Strip markdown if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        result = json.loads(content)
        clear_ai_404_error()
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse interview prep JSON: {e}")
        return {
            "error": str(e),
            "raw_response": content if "content" in locals() else "",
        }
    except AuthenticationError as e:
        logger.error(f"OpenRouter 401 in generate_interview_prep: {e}")
        store_ai_404_error("OpenRouter API-Schlüssel ungültig (401). Bitte in den Einstellungen prüfen.")
        raise
    except RateLimitError as e:
        logger.error(f"OpenRouter 429 in generate_interview_prep: {e}")
        store_ai_404_error("OpenRouter Rate Limit erreicht (429). Bitte kurz warten.")
        raise
    except NotFoundError as e:
        logger.error(f"OpenRouter 404 in generate_interview_prep: {e}")
        store_ai_404_error("KI-Modell auf OpenRouter nicht gefunden (404). Bitte Modell-Einstellung prüfen.")
        raise
    except APIConnectionError as e:
        logger.error(f"OpenRouter connection error in generate_interview_prep: {e}")
        store_ai_404_error("Verbindung zu OpenRouter fehlgeschlagen. Netzwerk oder Service prüfen.")
        raise
    except APIStatusError as e:
        logger.error(f"OpenRouter API error {e.status_code} in generate_interview_prep: {e}")
        store_ai_404_error(f"OpenRouter Serverfehler ({e.status_code}). Bitte später erneut versuchen.")
        raise
    except Exception as e:
        logger.error(f"Interview prep generation error: {e}")
        raise


def generate_company_profile_summary(
    domain: str,
    company_name: str,
    raw_info: str,
    model: str = None,
    api_key: str = None,
) -> Dict[str, Any]:
    """
    Generate a structured company profile summary from raw web data.
    """
    if not model:
        model = get_model()

    current_year = datetime.now().year
    year_range = f"{current_year - 2}-{current_year}"

    prompt = f"""Du handelst als ein Team aus: erfahrenen Wirtschaftsjournalisten (Handelsblatt, WiWo), einem Top-Unternehmensberater (McKinsey-Niveau), einem Experten für Organisationspsychologie und einem Employer-Branding-Spezialisten mit Fokus auf Kununu/Glassdoor-Analyse.

Deine Aufgabe ist die Erstellung einer detaillierten Business-Analyse des UNTERNEHMENS SELBST — unabhängig von einer konkreten Stellenausschreibung.
Fokus: wirtschaftliche Stabilität, strategische Ausrichtung, Marktposition, Meilensteine und Unternehmenskultur.
Erwähne KEINE spezifischen Stellen, Jobtitel oder Stellenbeschreibungen.

**Unternehmen:** {company_name}
**Domain:** {domain}
**Zeitraum:** Aktuelle Daten {year_range}

**ROHDATEN (aus Online-Recherche):**
{raw_info[:30000]}

ERSTELLE EIN JSON-OBJEKT MIT FOLGENDER STRUKTUR:
{{
  "description": "Prägnante Zusammenfassung (2-3 Sätze)",
  "culture_summary": "Authentische Zusammenfassung der Kultur basierend auf Mitarbeiterstimmen vs. Marketing",
  "tech_stack": ["Tech1", "Tech2"],
  "company_size": "startup/mittelstand/konzern",
  "key_benefits": ["Vorteil 1", "Vorteil 2"],
  "red_flags": ["Warnsignal 1"],
  "key_artifacts": [
    {{
      "title": "Meilenstein/Produkt/Initiative",
      "description": "Strategische Bedeutung, Zeitraum und wirtschaftlicher Impact für das Unternehmen"
    }}
  ],
  "swot_analysis": {{
    "strengths": ["Unternehmensstärke 1", "Unternehmensstärke 2"],
    "weaknesses": ["Strukturelle Schwäche 1"],
    "opportunities": ["Marktchance 1"],
    "threats": ["Externer Risikofaktor 1"]
  }},
  "comprehensive_report": "Vollständiger RESEARCH REPORT (ca. 1500 Wörter) im White Paper Format (Markdown). Muss enthalten: Executive Summary, Wirtschaftliche Verfassung & Kennzahlen, Strategische Ausrichtung & Zukunftspläne, Unternehmenskultur & Mitarbeiterzufriedenheit, SWOT-Fazit und Quellenangaben. KEIN Bezug auf konkrete Stellen oder Jobtitel.",
  "company_intelligence": {{
    "wirtschaftliche_lage": "Detaillierte Analyse: aktuelle Strategie, Gewinnwarnungen oder Rekordgewinne, größere Umstrukturierungen, M&A-Aktivitäten, Quartalszahlen der letzten 12 Monate",
    "marktposition": {{
      "hauptwettbewerber": ["Wettbewerber 1", "Wettbewerber 2", "Wettbewerber 3"],
      "usp": "Was unterscheidet {company_name} wirklich von der Konkurrenz? Konkreter Unique Selling Point"
    }},
    "kultur_vibe": {{
      "kununu_glassdoor_summary": "Was sagen Mitarbeiter auf Kununu/Glassdoor wirklich? Anonyme Bewertungen zu Work-Life-Balance, Management-Stil und Fluktuation. Konkrete Zitate wenn möglich.",
      "work_life_balance": "positiv",
      "management_bewertung": "gemischt",
      "fluktuation": "normal"
    }},
    "kritische_themen": [
      "Negative Schlagzeile oder strategisches Risiko das ein informierter Bewerber kennen sollte"
    ],
    "insider_fragen": [
      {{
        "question": "Intelligente Frage die zeigt, dass man Hausaufgaben gemacht hat und die ein gutes Gespräch öffnet",
        "rationale": "Warum ist diese Frage strategisch klug und was signalisiert sie dem Interviewer?"
      }}
    ],
    "online_referenzen": [
      {{
        "title": "Titel des Artikels oder der Quelle",
        "url": "https://www.handelsblatt.com/...",
        "source_type": "news"
      }}
    ]
  }}
}}

WICHTIG für company_intelligence:
- kultur_vibe.work_life_balance muss exakt einer dieser Werte sein: "positiv", "gemischt", "negativ"
- kultur_vibe.management_bewertung muss exakt einer dieser Werte sein: "positiv", "gemischt", "negativ"
- kultur_vibe.fluktuation muss exakt einer dieser Werte sein: "niedrig", "normal", "hoch"
- insider_fragen: Erstelle genau 3 Fragen, die wirklich Substanz haben und nicht generisch sind
- online_referenzen.source_type muss einer dieser Werte sein: "news", "review", "ir", "social"
- online_referenzen: Versuche echte, verifizierbare URLs zu nennen (Unternehmenswebsite /investor-relations, Handelsblatt, Kununu, Glassdoor, LinkedIn)

Antworte NUR mit dem JSON-Objekt ohne Markdown-Wrapper!"""

    client = get_ai_client(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=10000,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        result = json.loads(content)
        clear_ai_404_error()
        return result
    except AuthenticationError as e:
        logger.error(f"OpenRouter 401 in generate_company_profile_summary: {e}")
        store_ai_404_error("OpenRouter API-Schlüssel ungültig (401). Bitte in den Einstellungen prüfen.")
        raise
    except RateLimitError as e:
        logger.error(f"OpenRouter 429 in generate_company_profile_summary: {e}")
        store_ai_404_error("OpenRouter Rate Limit erreicht (429). Bitte kurz warten.")
        raise
    except NotFoundError as e:
        logger.error(f"OpenRouter 404 in generate_company_profile_summary: {e}")
        store_ai_404_error("KI-Modell auf OpenRouter nicht gefunden (404). Bitte Modell-Einstellung prüfen.")
        raise
    except APIConnectionError as e:
        logger.error(f"OpenRouter connection error in generate_company_profile_summary: {e}")
        store_ai_404_error("Verbindung zu OpenRouter fehlgeschlagen. Netzwerk oder Service prüfen.")
        raise
    except APIStatusError as e:
        logger.error(f"OpenRouter API error {e.status_code} in generate_company_profile_summary: {e}")
        store_ai_404_error(f"OpenRouter Serverfehler ({e.status_code}). Bitte später erneut versuchen.")
        raise
    except Exception as e:
        logger.error(f"Company profile generation error: {e}")
        raise
