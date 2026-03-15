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
    system_prompt = """You are a URL analysis expert for job platforms.
    Analyze the URL list and identify the URL path prefix that exclusively identifies job detail pages (individual job postings), not listing, category, or overview pages.

    Reply ONLY with valid JSON (no markdown):
    {
      "pattern": "/jobs/",
      "job_urls": ["https://...", "https://..."]
    }

    - "pattern": URL path prefix of job detail pages (e.g. "/jobs/", "/stellenangebote/", "/career/detail/")
    - "job_urls": All URLs from the given list that match this pattern
    """
    sample = urls_list[:150]
    try:
        response = get_ai_client(api_key).chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Base URL: {base_url}\nURL list:\n{json.dumps(sample)}",
                },
            ],
            temperature=0.0,
        )
    except AuthenticationError as e:
        store_ai_404_error(
            "OpenRouter API key invalid (401). Please check your settings."
        )
        logger.error(f"OpenRouter error in detect_url_pattern_with_ai: {e}")
        raise
    except RateLimitError as e:
        store_ai_404_error("OpenRouter rate limit reached (429). Please wait a moment.")
        logger.error(f"OpenRouter error in detect_url_pattern_with_ai: {e}")
        raise
    except NotFoundError as e:
        store_ai_404_error(
            "AI model not found on OpenRouter (404). Please check your model setting."
        )
        logger.error(f"OpenRouter error in detect_url_pattern_with_ai: {e}")
        raise
    except APIConnectionError as e:
        store_ai_404_error(
            "Connection to OpenRouter failed. Check your network or service status."
        )
        logger.error(f"OpenRouter error in detect_url_pattern_with_ai: {e}")
        raise
    except APIStatusError as e:
        store_ai_404_error(
            f"OpenRouter server error ({e.status_code}). Please try again later."
        )
        logger.error(f"OpenRouter error in detect_url_pattern_with_ai: {e}")
        raise
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

    system_prompt = """
        Act as a branding expert. Your task is to generate a unique, context-aware identifier based on a job platform URL.
        Instructions:
        Core Domain: Extract the primary brand from the domain (e.g., 'dbjobs').
        Contextual Fingerprint: Scan the path and all URL parameters for the most descriptive values. You MUST include:
        Locations (e.g., 'hamburg')
        Unique IDs (e.g., '5441588')
        Language/Region codes if relevant (e.g., 'dede').
        Synthesis: Combine these elements using hyphens (-) as separators to ensure uniqueness and readability.
        Formatting: Use lowercase only. Strictly NO CamelCase. Remove all technical noise (https, www, .de, .jobs, /, ?, =, &).
        Strict Output: Output ONLY the generated string. No markdown, no quotes, no explanation.
    """

    try:
        model_to_use = model or get_model(db=db)
        logger.info(f"Generating platform name for {url} using model {model_to_use}")
        response = get_ai_client(api_key, db=db).chat.completions.create(
            model=model_to_use,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"URL: {url}"},
            ],
            temperature=0.0,
        )
        print(response)
        name = response.choices[0].message.content.strip()
        name = name.replace('"', "").replace("'", "").replace("`", "")
        return name
    except AuthenticationError:
        logger.error(
            "AI Authentication Error (401): Missing or invalid OpenRouter API key."
        )
        return domain
    except Exception as e:
        logger.error(f"Error generating platform name: {e}")
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

    if user_language == "de":
        lang_name = "Deutsch"
        h_summary = "Zusammenfassung"
        h_strengths = "Stärken & Übereinstimmung"
        h_gaps = "Lücken & Herausforderungen"
        h_rec = "Empfehlung"
        force_msg = "Antworte ausschließlich auf Deutsch!"
    else:
        lang_name = "English"
        h_summary = "Summary"
        h_strengths = "Strengths & Match"
        h_gaps = "Gaps & Challenges"
        h_rec = "Recommendation"
        force_msg = "Respond exclusively in English!"

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are an experienced career advisor. Analyze the fit between the candidate profile and the job description.\n"
                        f"IMPORTANT: All content must be written in {lang_name}. {force_msg}\n\n"
                        f"Respond exclusively with a raw JSON object. Do not use markdown code blocks (no ```json).\n"
                        f'{{ "score": <integer 0-100>, "reasoning": "<markdown_text>" }}\n\n'
                        f"The 'reasoning' field must be a valid JSON string containing these markdown sections in {lang_name}:\n"
                        f"## {h_summary}\n"
                        f"Short evaluation (2-3 sentences).\n\n"
                        f"## {h_strengths}\n"
                        f"Bullet points on matching skills.\n\n"
                        f"## {h_gaps}\n"
                        f"Bullet points on missing requirements.\n\n"
                        f"## {h_rec}\n"
                        f"Concrete recommendation."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Job Title: {job_title}\n\nJob Description:\n{job_description}\n\nCandidate Profile:\n{profile_str}",
                },
            ],
            temperature=0.3,
        )
        content = response.choices[0].message.content.strip()
        data = extract_json(content)
        clear_ai_404_error()
        return data
    except AuthenticationError as e:
        logger.error(f"OpenRouter 401 in analyze_job: {e}")
        store_ai_404_error(
            "OpenRouter API-Schlüssel ungültig (401). Bitte in den Einstellungen prüfen."
        )
        raise
    except RateLimitError as e:
        logger.error(f"OpenRouter 429 in analyze_job: {e}")
        store_ai_404_error("OpenRouter Rate Limit erreicht (429). Bitte kurz warten.")
        raise
    except NotFoundError as e:
        logger.error(f"OpenRouter 404 in analyze_job: {e}")
        store_ai_404_error(
            "KI-Modell auf OpenRouter nicht gefunden (404). Bitte Modell-Einstellung prüfen."
        )
        raise
    except APIConnectionError as e:
        logger.error(f"OpenRouter connection error in analyze_job: {e}")
        store_ai_404_error(
            "Verbindung zu OpenRouter fehlgeschlagen. Netzwerk oder Service prüfen."
        )
        raise
    except APIStatusError as e:
        logger.error(f"OpenRouter API error {e.status_code} in analyze_job: {e}")
        store_ai_404_error(
            f"OpenRouter Serverfehler ({e.status_code}). Bitte später erneut versuchen."
        )
        raise


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
) -> str:
    """
    Calls AI to generate a cover letter draft. Returns the raw string content.
    """
    system_prompt = """
    You are a professional career coach and application expert with deep knowledge of ATS (Applicant Tracking System) systems.
    Write a compelling, ATS-optimized cover letter in Markdown that is clearly structured, easy to read, and free of clichés.
    Follow these guidelines strictly:
    1. The introduction must be original and attention-grabbing, without clichés like "with great enthusiasm" or "I am very pleased".
    2. Use only realistic information provided by the applicant. No fabricated projects, numbers, or companies.
    3. Clearly show what added value the applicant brings to the company.
    4. Precisely highlight professional competencies, work experience, education, and motivation.
    5. Use relevant keywords from the job posting meaningfully, without keyword stuffing.
    6. The style should be professional, clear, confident, and authentic.
    7. Avoid special characters, graphics, tables, or unnecessary formatting that could disrupt ATS systems.
    8. The result should be a complete cover letter in Markdown, with no additional information or explanations.
    9. If the applicant provides concrete numbers or results, integrate them meaningfully to demonstrate measurable achievements.
    """ + (
        "WICHTIG: Antworte ausschließlich auf Englisch!!!"
        if user_language == "en"
        else "WICHTIG: Antworte ausschließlich auf Deutsch!!!"
    )

    user_prompt = f"""
        STELLENANZEIGE: {job_title} bei {job_company}
        {job_description}

        BEWERBER: {profile_role}
        {cv_text}
        """

    if improvement_notes:
        user_prompt += f"\n\nVERBESSERUNGSHINWEIS (Bitte überarbeite das Bewerbungsschreiben basierend auf folgendem Feedback): {improvement_notes}"

    client = get_ai_client(api_key)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )
        clear_ai_404_error()
        return response.choices[0].message.content
    except AuthenticationError as e:
        logger.error(f"OpenRouter 401 in generate_application: {e}")
        store_ai_404_error(
            "OpenRouter API-Schlüssel ungültig (401). Bitte in den Einstellungen prüfen."
        )
        raise
    except RateLimitError as e:
        logger.error(f"OpenRouter 429 in generate_application: {e}")
        store_ai_404_error("OpenRouter Rate Limit erreicht (429). Bitte kurz warten.")
        raise
    except NotFoundError as e:
        logger.error(f"OpenRouter 404 in generate_application: {e}")
        store_ai_404_error(
            "KI-Modell auf OpenRouter nicht gefunden (404). Bitte Modell-Einstellung prüfen."
        )
        raise
    except APIConnectionError as e:
        logger.error(f"OpenRouter connection error in generate_application: {e}")
        store_ai_404_error(
            "Verbindung zu OpenRouter fehlgeschlagen. Netzwerk oder Service prüfen."
        )
        raise
    except APIStatusError as e:
        logger.error(
            f"OpenRouter API error {e.status_code} in generate_application: {e}"
        )
        store_ai_404_error(
            f"OpenRouter Serverfehler ({e.status_code}). Bitte später erneut versuchen."
        )
        raise


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
    prompt = f"""
    
      Act as an Interview Preparation Coach, Elite-Karrierecoach and Psychologist. 
      You are an expert in preparing candidates for various types of job interviews. 
      Your task is to guide users through effective interview preparation strategies.

      You will:
      - Provide personalized advice based on the job role and industry
      - Help users practice common interview questions
      - Offer tips on improving communication skills and body language
      - Suggest strategies for handling difficult questions and scenarios

      Rules:
      - Customize advice based on the user's input
      - Maintain a professional and supportive tone

      **Role:** {job_title}
      **Company:** {company_name}

      **Job Description:**
      {job_description[:20000]}

      **CV Summary:**
      {cv_summary[:10000]}

      **Company Culture:**
      {(company_culture or '')[:10000]}

      **Language:** {language}

      Generate a JSON object with the following structure:
      {{
        "context": {{
          "experts_used": ["Interview Preparation Coach", "Elite-Karrierecoach", "Psychologist"],
          "purpose": "Interview preparation",
          "potential_gaps": ["Gap 1", "Gap 2"]
        }},
        "core_research": {{
          "success_factors": ["Factor 1", "Factor 2", "Factor 3", "Factor 4", "Factor 5"],
          "hypothesis_evaluation": "Analyse regarding Change-Management and Fachkompetenz",
          "counterfactuals": {{
            "risks": ["Risk 1", "Risk 2"],
            "mitigation": ["Mitigation 1", "Mitigation 2"]
          }}
        }},
        "specifications": {{
          "time_period": "Current market situation 2024-2026",
          "geographic_location": "Geographic location",
          "industry_focus": "Relevant market segment",
          "demographic_focus": "Department and corporate culture",
          "ethical_considerations": "Authenticity and transfer performance"
        }},
        "report_output": {{
          "executive_summary": "Executive Summary (max. 3 sentences)",
          "deep_dive_analysis": "Detaillierter Q&A Leitfaden and behavioral analysis in Markdown format",
          "case_studies": [
            {{
              "title": "Title of Case Study from my experience",
              "description": "My best story relevant to the role"
            }}
          ],
          "expert_predictions": [
            "Expert tip/prediction 1"
          ],
          "questions_for_interviewer": [
            "Question 1", "Question 2", "Question 3", "Question 4", "Question 5", "Question 6", "Question 7", "Question 8", "Question 9", "Question 10"
          ],
          "comparative_analysis": [
            {{
              "requirement": "Job requirement",
              "my_story": "My best story relevant to the role",
              "gap_evaluation": "Solution / Match"
            }}
          ]
        }},
        "critical_analysis": {{
          "psychological_questions": [
            {{
              "question": "Unpredictable psychological interview question",
              "suggested_answer": "Answer strategy (STAR method, emotional intelligence)"
            }}
          ],
          "solution_selling_pitch": "I as a solution for a specific problem of the company",
          "interdisciplinary_connections": "Connection of technical skillset with emotional intelligence"
        }},
        "structured_prep": {{
          "gap_analysis": [
            {{
              "requirement": "Job requirement",
              "cv_status": "Status im CV des Kandidaten (z.B. '3 Jahre Erfahrung' or 'Nicht vorhanden')",
              "gap_severity": "Gap severity",
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
              "requirement": "Job requirement",
              "situation": "Konkreter Kontext aus dem CV des Kandidaten",
              "task": "What was the specific task or challenge?",
              "action": "What did the candidate do? (3-5 steps)",
              "result": "Measurable result with numbers if possible"
            }}
          ],
          "online_references": [
            {{
              "title": "Title of the resource",
              "url": "https://www.example.com/artikel",
              "relevance": "Why is this source relevant for the preparation?"
            }}
          ]
        }}
      }}

      WICHTIG für structured_prep:
      - gap_severity must be one of these values: "no gap", "minor gap", "critical gap"
      - type must be one of these values: "behavioral", "case", "situational"
      - Create exactly 5 entries in top5_questions
      - Create exactly 2 entries in star_answers (the 2 most important requirements)
      - online_references: Search for real, relevant URLs (company website, LinkedIn, industry reports, professional media)
      - elevator_pitch should be formulated as a spoken text, not as bullet points

      Answer only with valid JSON without Markdown wrapper!

      """ + (
        "WICHTIG: Antworte ausschließlich auf Englisch!!!"
        if language == "en"
        else "WICHTIG: Antworte ausschließlich auf Deutsch!!!"
    )

    client = get_ai_client(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=10000,
        )
        if not response.choices:
            raise ValueError("AI response returned no choices")
        content = response.choices[0].message.content
        if content is None:
            raise ValueError("AI response content is None")
        content = content.strip()
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
        store_ai_404_error(
            "OpenRouter API-Schlüssel ungültig (401). Bitte in den Einstellungen prüfen."
        )
        raise
    except RateLimitError as e:
        logger.error(f"OpenRouter 429 in generate_interview_prep: {e}")
        store_ai_404_error("OpenRouter Rate Limit erreicht (429). Bitte kurz warten.")
        raise
    except NotFoundError as e:
        logger.error(f"OpenRouter 404 in generate_interview_prep: {e}")
        store_ai_404_error(
            "KI-Modell auf OpenRouter nicht gefunden (404). Bitte Modell-Einstellung prüfen."
        )
        raise
    except APIConnectionError as e:
        logger.error(f"OpenRouter connection error in generate_interview_prep: {e}")
        store_ai_404_error(
            "Verbindung zu OpenRouter fehlgeschlagen. Netzwerk oder Service prüfen."
        )
        raise
    except APIStatusError as e:
        logger.error(
            f"OpenRouter API error {e.status_code} in generate_interview_prep: {e}"
        )
        store_ai_404_error(
            f"OpenRouter Serverfehler ({e.status_code}). Bitte später erneut versuchen."
        )
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
    language: str = "de",
) -> Dict[str, Any]:
    """
    Generate a structured company profile summary from raw web data.
    """
    if not model:
        model = get_model()

    current_year = datetime.now().year
    year_range = f"{current_year - 2}-{current_year}"

    prompt = f"""
      Du handelst als ein Team aus: erfahrenen Wirtschaftsjournalisten (Handelsblatt, WiWo), einem Top-Unternehmensberater (McKinsey-Niveau), einem Experten für Organisationspsychologie und einem Employer-Branding-Spezialisten mit Fokus auf Kununu/Glassdoor-Analyse.

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

      Antworte NUR mit dem JSON-Objekt ohne Markdown-Wrapper!

      """ + (
        "Write all text content in English."
        if language == "en"
        else "Schreibe alle Textinhalte auf Deutsch."
    )

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
        store_ai_404_error(
            "OpenRouter API-Schlüssel ungültig (401). Bitte in den Einstellungen prüfen."
        )
        raise
    except RateLimitError as e:
        logger.error(f"OpenRouter 429 in generate_company_profile_summary: {e}")
        store_ai_404_error("OpenRouter Rate Limit erreicht (429). Bitte kurz warten.")
        raise
    except NotFoundError as e:
        logger.error(f"OpenRouter 404 in generate_company_profile_summary: {e}")
        store_ai_404_error(
            "KI-Modell auf OpenRouter nicht gefunden (404). Bitte Modell-Einstellung prüfen."
        )
        raise
    except APIConnectionError as e:
        logger.error(
            f"OpenRouter connection error in generate_company_profile_summary: {e}"
        )
        store_ai_404_error(
            "Verbindung zu OpenRouter fehlgeschlagen. Netzwerk oder Service prüfen."
        )
        raise
    except APIStatusError as e:
        logger.error(
            f"OpenRouter API error {e.status_code} in generate_company_profile_summary: {e}"
        )
        store_ai_404_error(
            f"OpenRouter Serverfehler ({e.status_code}). Bitte später erneut versuchen."
        )
        raise
    except Exception as e:
        logger.error(f"Company profile generation error: {e}")
        raise


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
    system_instruction = (
        "You are an expert at extracting job descriptions from noisy web content. "
        "Extract the full job description, including requirements, responsibilities, and benefits. "
        "Remove all irrelevant boilerplate (navigation, footer, similar jobs, cookie notices, etc.). "
        "Maintain the original structure using Markdown (headers, lists). "
    )

    if language == "en":
        system_instruction += "Output ONLY the extracted job description in English."
    else:
        system_instruction += (
            "Gib NUR die extrahierte Stellenbeschreibung auf Deutsch aus."
        )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_instruction},
                {
                    "role": "user",
                    "content": f"Extract the job description from this text:\n\n{text[:12000]}",
                },
            ],
            temperature=0.0,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Error in extract_job_details: {e}")
        return text[:4000]  # Fallback to original behavior
