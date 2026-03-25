import json
from datetime import datetime
from typing import List, Dict, Any, Optional

def get_detect_url_pattern_messages(base_url: str, sample: list) -> List[Dict[str, str]]:
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
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Base URL: {base_url}\nURL list:\n{json.dumps(sample)}"},
    ]


def get_generate_platform_name_messages(url: str) -> List[Dict[str, str]]:
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
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"URL: {url}"},
    ]


def get_analyze_job_messages(job_title: str, job_description: str, profile_str: str, user_language: str = "de") -> List[Dict[str, str]]:
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

    tone_instruction = "Sprich den Kandidaten direkt mit 'du' an (Duzen). Verwende Formulierungen wie 'Da du Erfahrung in xyz hast...' oder 'Deine Stärken liegen in...'."

    system_prompt = (
        f"You are an experienced career advisor. Analyze the fit between the candidate profile and the job description.\n"
        f"IMPORTANT: All content must be written in {lang_name}. {force_msg}\n"
        f"TONE: {tone_instruction}\n\n"
        f"Respond exclusively with a raw JSON object. Do not use markdown code blocks (no ```json).\n"
        f'{{ "score": <integer 0-100>, "reasoning": "<markdown_text>" }}\n\n'
        f"The 'reasoning' field must be a valid JSON string containing these markdown sections in {lang_name}:\n"
        f"## {h_summary}\n"
        f"Short evaluation (2-3 sentences) addressing the candidate directly.\n\n"
        f"## {h_strengths}\n"
        f"Bullet points on matching skills.\n\n"
        f"## {h_gaps}\n"
        f"Bullet points on missing requirements.\n\n"
        f"## {h_rec}\n"
        f"Concrete recommendation for the candidate."
    )
    user_prompt = f"Job Title: {job_title}\n\nJob Description:\n{job_description}\n\nCandidate Profile:\n{profile_str}"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def get_generate_application_messages(job_title: str, job_company: str, job_description: str, profile_role: str, cv_text: str, user_language: str = "de", improvement_notes: Optional[str] = None) -> List[Dict[str, str]]:
    system_prompt = """
    Du bist ein erfahrener Karriereberater und Bewerbungsexperte. Schreibe ein hochwertiges, prägnantes Anschreiben in Markdown.

    WICHTIGE REGELN:
    1. Schreibe KEIN Anschreiben das den Lebenslauf wiederholt – keine Auflistung von Stationen oder Skills.
    2. Das Anschreiben soll kurz & überzeugend sein (max. 3-4 kurze Absätze).
    3. Zeige den konkreten Mehrwert für das Unternehmen auf – nicht was der Bewerber alles kann, sondern warum er GENAU für DIESE Stelle der Richtige ist.
    4. Origineller, professioneller Einstieg – keine Floskeln wie "mit großem Interesse" oder "hiermit bewerbe ich mich".
    5. Nutze relevante Keywords aus der Stellenanzeige natürlich eingebaut.
    6. Stil: professionell, klar, selbstbewusst, authentisch.
    7. Keine Sonderzeichen, Tabellen oder überflüssige Formatierung.
    8. Ergebnis: vollständiges Anschreiben in Markdown, keine Erklärungen drumherum.
    9. Nur belegbare Fakten aus dem Profil verwenden – nichts erfinden.
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

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def get_interview_prep_messages(job_title: str, company_name: str, language: str = "de") -> List[Dict[str, str]]:
    tone_instruction = (
        "CRITICAL LANGUAGE RULE:\n"
        "- You MUST address the user directly as 'du' in EVERY sentence\n"
        "- NEVER use third person (no 'der Kandidat', 'er/sie', 'man')\n"
        "- EVERY sentence must include 'du' or 'dein'\n"
        "- EXCEPTION: The elevator_pitch MUST be written in first person ('Ich') and does NOT need to include 'du'\n"
    )

    language_instruction = (
        "Respond ONLY in English and use 'you'."
        if language == "en"
        else "Antworte AUSSCHLIESSLICH auf Deutsch und verwende IMMER 'du'."
    )

    prompt = f"""
    You are an Elite Interview Preparation Coach and Psychologist.

    ====================
    CRITICAL RULES (MUST FOLLOW)
    ====================
    - Output MUST be valid JSON only
    - Do NOT use markdown
    - Do NOT wrap the JSON in ```json
    - Do NOT add any text before or after JSON
    - Output MUST start with {{ and end with }}
    - Follow the JSON structure EXACTLY
    - Do not add extra fields
    - Do not remove fields

    {tone_instruction}
    {language_instruction}

    ====================
    STYLE RULES
    ====================
    - Be highly specific and personalized
    - Avoid generic phrases
    - Always speak directly to the user
    - Give actionable, concrete advice

    ====================
    ELEVATOR PITCH RULES
    ====================
    - Write in first person ("Ich")
    - Make it sound natural and spoken
    - Avoid generic phrases like "ich bin ein erfahrener..."
    - Make it specific and impactful
    - The user should be able to copy & paste and use it directly

    ====================
    OUTPUT FORMAT
    ====================
    Return EXACTLY this structure:

    {{
    "report_output": {{
        "executive_summary": "Max. 3 sentences, direct and personalized, using 'du'.",
        "deep_dive_analysis": "Detailed Q&A guide and behavioral advice. Every sentence must address 'du'."
    }},
    "structured_prep": {{
        "gap_analysis": [
        {{
            "requirement": "Job requirement",
            "cv_status": "Status in deinem CV",
            "gap_severity": "Low/Medium/High",
            "interview_strategy": "Concrete strategy how YOU address this in the interview"
        }}
        ],
        "elevator_pitch": "First-person answer that the user can directly say in the interview"
    }}
    }}

    ====================
    TASK
    ====================
    Role: {job_title}
    Company: {company_name}

    Provide:
    - Personalized interview preparation
    - Tailored Q&A strategies
    - Communication and body language advice
    - Strategies for difficult questions

    Ensure ALL responses strictly follow the rules above.
    """
    return [{"role": "user", "content": prompt}]


def get_company_profile_summary_messages(domain: str, company_name: str, raw_info: str, language: str = "de") -> List[Dict[str, str]]:
    current_year = datetime.now().year
    year_range = f"{current_year - 2}-{current_year}"

    prompt = f"""Du bist ein Senior Research Methodology Expert, spezialisiert auf systematische Untersuchungen, Multi-Hop-Reasoning, Quellenauswertung, Evidenzsynthese, Bias-Erkennung und Konfidenzabschätzung. Du arbeitest als Team aus: erfahrenen Wirtschaftsjournalisten (Handelsblatt, WiWo), McKinsey-Berater, Organisationspsychologe und Employer-Branding-Spezialist mit Fokus auf Kununu/Glassdoor.

Erstelle eine umfassende Arbeitgeberanalyse für {company_name} aus der Perspektive eines potenziellen Arbeitnehmers in Deutschland/Europa.

**Unternehmen:** {company_name}
**Domain:** {domain}
**Zeitraum:** Aktuelle Daten {year_range}

**ROHDATEN (aus Online-Recherche):**
{raw_info[:30000]}

Anforderungen:
1. Vollständige, evidenzbasierte Analyse (min. 800-1000 Wörter im comprehensive_report)
2. Confidence Levels für alle Aussagen: High / Moderate / Low / Insufficient
3. Marktvergleich mit mindestens 2-3 Wettbewerbern
4. Mindestens 7 Deep-Dive Aktions-Buttons
5. 5-7 Key Insights klar als fact/interpretation/speculation kategorisiert
6. Kein Bezug auf konkrete Stellen oder Jobtitel

Erstelle EXAKT dieses JSON-Objekt:
{{
  "description": "Prägnante Zusammenfassung des Unternehmens (2-3 Sätze)",
  "culture_summary": "Authentische Kulturzusammenfassung basierend auf Mitarbeiterstimmen vs. Marketing-Aussagen",
  "tech_stack": ["Tech1", "Tech2"],
  "company_size": "startup|mittelstand|konzern",

  "executive_summary": {{
    "gesamtbewertung": "Gesamtbewertung als Arbeitgeber in 3-4 Sätzen mit konkreter Einschätzung",
    "gesamt_confidence": "High|Moderate|Low",
    "geeignet_fuer": ["Kandidatentyp der hier gut aufgehoben ist", "Weiterer Typ"],
    "weniger_geeignet": ["Kandidatentyp für den das weniger passt"]
  }},

  "structured_analysis": {{
    "geschaeftsmodell_marktposition": {{
      "assessment": "Faktische, evidenzbasierte Aussagen zum Geschäftsmodell und der Marktposition",
      "evidence_basis": "Quellentyp und Zuverlässigkeit (z.B. Unternehmenswebsite, Pressemitteilungen, Analysten)",
      "confidence_level": "High|Moderate|Low|Insufficient",
      "key_uncertainty": "Was ist unbekannt, fehlt oder ist widersprüchlich"
    }},
    "arbeitsbedingungen_kultur": {{
      "assessment": "Fakten zu Arbeitsbedingungen, Remote-Policy, Bürokultur, Teamstruktur",
      "evidence_basis": "Quellentyp (z.B. Kununu, Glassdoor, LinkedIn-Posts)",
      "confidence_level": "High|Moderate|Low|Insufficient",
      "key_uncertainty": "Was ist unklar oder widersprüchlich"
    }},
    "gehaelter_benefits": {{
      "assessment": "Einschätzung der Gehaltsstruktur und Benefits im Marktvergleich",
      "evidence_basis": "Quellentyp (z.B. Gehaltsreports, kununu, glassdoor)",
      "confidence_level": "High|Moderate|Low|Insufficient",
      "key_uncertainty": "Fehlende oder unklare Daten"
    }},
    "karriere_entwicklung": {{
      "assessment": "Karrieremöglichkeiten, interne Mobilität, Weiterbildungsangebote",
      "evidence_basis": "Quellentyp",
      "confidence_level": "High|Moderate|Low|Insufficient",
      "key_uncertainty": "Unbekannte Aspekte"
    }},
    "stabilitaet_zukunft": {{
      "assessment": "Wirtschaftliche Stabilität, Wachstumsperspektiven, strategische Zukunftsausrichtung",
      "evidence_basis": "Quellentyp (z.B. Geschäftsberichte, Pressemitteilungen, Analystenmeinungen)",
      "confidence_level": "High|Moderate|Low|Insufficient",
      "key_uncertainty": "Unsicherheitsfaktoren"
    }}
  }},

  "key_insights": [
    {{"insight": "Konkreter Insight 1", "type": "fact"}},
    {{"insight": "Interpretation oder Schlussfolgerung", "type": "interpretation"}},
    {{"insight": "Spekulative Einschätzung mit Begründung", "type": "speculation"}}
  ],

  "key_benefits": ["Konkreter Arbeitgebervorteil 1", "Vorteil 2"],

  "red_flags": [
    {{"flag": "Konkretes Warnsignal", "probability": "High|Moderate|Low", "impact": "High|Moderate|Low"}}
  ],

  "market_comparison": {{
    "competitors": [
      {{
        "name": "Wettbewerber 1",
        "salary_comparison": "Gehaltsvergleich: besser/schlechter/ähnlich und warum",
        "career_paths": "Karrieremöglichkeiten im Vergleich",
        "stability": "Stabilität und Zukunftsperspektive im Vergleich"
      }}
    ],
    "relative_strengths": ["Stärke von {company_name} vs. Markt 1", "Stärke 2"],
    "relative_weaknesses": ["Schwäche von {company_name} vs. Markt 1"]
  }},

  "deep_dive_buttons": [
    {{
      "title": "Kurzer beschreibender Aktionsname",
      "focus": "Spezifischer Aspekt der zu recherchieren ist",
      "why_it_matters": "Warum das für die Entscheidung eines Bewerbers wichtig ist",
      "how_to_proceed": "Konkrete nächste Rechercheschritte (z.B. welche Seiten, Fragen, Quellen)",
      "linked_findings": "Verweis auf relevante Analyseteile (z.B. 'Siehe Structured Analysis: Gehälter')"
    }}
  ],

  "key_artifacts": [
    {{
      "title": "Meilenstein/Produkt/Initiative",
      "description": "Strategische Bedeutung, Zeitraum und wirtschaftlicher Impact"
    }}
  ],

  "swot_analysis": {{
    "strengths": ["Unternehmensstärke 1", "Unternehmensstärke 2"],
    "weaknesses": ["Strukturelle Schwäche 1"],
    "opportunities": ["Marktchance 1"],
    "threats": ["Externer Risikofaktor 1"]
  }},

  "comprehensive_report": "Vollständiger RESEARCH REPORT (min. 800 Wörter) im Markdown-Format. Enthält: Executive Summary, Wirtschaftliche Verfassung & Kennzahlen, Strategische Ausrichtung & Zukunftspläne, Unternehmenskultur & Mitarbeiterzufriedenheit, Marktvergleich, SWOT-Fazit. KEIN Bezug auf konkrete Stellen.",

  "company_intelligence": {{
    "wirtschaftliche_lage": "Detaillierte Analyse: Strategie, Gewinnwarnungen oder Rekordgewinne, Umstrukturierungen, M&A-Aktivitäten, aktuelle Kennzahlen",
    "marktposition": {{
      "hauptwettbewerber": ["Wettbewerber 1", "Wettbewerber 2", "Wettbewerber 3"],
      "usp": "Was unterscheidet {company_name} wirklich von der Konkurrenz?"
    }},
    "kultur_vibe": {{
      "kununu_glassdoor_summary": "Was sagen Mitarbeiter auf Kununu/Glassdoor? Work-Life-Balance, Management, Fluktuation. Konkrete Zitate wenn möglich.",
      "work_life_balance": "positiv",
      "management_bewertung": "gemischt",
      "fluktuation": "normal"
    }},
    "kritische_themen": ["Strategisches Risiko oder negative Entwicklung die Bewerber kennen sollten"],
    "insider_fragen": [
      {{
        "question": "Substanzielle Interviewfrage die zeigt, dass man Hausaufgaben gemacht hat",
        "rationale": "Warum diese Frage strategisch klug ist und was sie dem Interviewer signalisiert"
      }}
    ],
    "online_referenzen": [
      {{
        "title": "Titel des Artikels oder der Quelle",
        "url": "https://...",
        "source_type": "news|review|ir|social"
      }}
    ]
  }}
}}

PFLICHTREGELN:
- kultur_vibe.work_life_balance: exakt "positiv", "gemischt" oder "negativ"
- kultur_vibe.management_bewertung: exakt "positiv", "gemischt" oder "negativ"
- kultur_vibe.fluktuation: exakt "niedrig", "normal" oder "hoch"
- insider_fragen: genau 3 substanzielle, nicht-generische Fragen
- online_referenzen.source_type: exakt "news", "review", "ir" oder "social"
- deep_dive_buttons: mindestens 7, maximal 10 Buttons
- key_insights: genau 5-7 Insights mit korrekter type-Kategorisierung (fact/interpretation/speculation)
- market_comparison.competitors: mindestens 2-3 Wettbewerber mit konkreten Vergleichen
- red_flags: Array von Objekten mit flag/probability/impact (NICHT einfache Strings)
- Antworte NUR mit dem JSON-Objekt ohne Markdown-Wrapper!
"""

    if language == "en":
        prompt += "\nWrite ALL text content in English (keys remain as-is)."
    else:
        prompt += "\nSchreibe ALLE Textinhalte auf Deutsch (Keys bleiben unverändert)."

    return [{"role": "user", "content": prompt}]


def get_extract_job_details_messages(text: str, language: str = "de") -> List[Dict[str, str]]:
    system_instruction = (
        "You are an expert at extracting job descriptions from noisy web content. "
        "Extract the full job description, including requirements, responsibilities, and benefits. "
        "Remove all irrelevant boilerplate (navigation, footer, similar jobs, cookie notices, etc.). "
        "Maintain the original structure using Markdown (headers, lists). "
    )

    if language == "en":
        system_instruction += "Output ONLY the extracted job description in English."
    else:
        system_instruction += "Gib NUR die extrahierte Stellenbeschreibung auf Deutsch aus."

    return [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": f"Extract the job description from this text:\n\n{text[:12000]}"},
    ]
