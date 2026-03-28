import json
from typing import List, Dict, Any, Optional


def get_detect_url_pattern_messages(
    base_url: str, sample: list
) -> List[Dict[str, str]]:
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
        {
            "role": "user",
            "content": f"Base URL: {base_url}\nURL list:\n{json.dumps(sample)}",
        },
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


def get_analyze_job_messages(
    job_title: str, job_description: str, profile_str: str, user_language: str = "de"
) -> List[Dict[str, str]]:
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


def get_generate_application_messages(
    job_title: str,
    job_company: str,
    job_description: str,
    profile_role: str,
    cv_text: str,
    user_language: str = "de",
    improvement_notes: Optional[str] = None,
    existing_draft: Optional[str] = None,
) -> List[Dict[str, str]]:

    lang = "English" if user_language == "en" else "German"

    # --- IMPROVE MODE: only apply specific changes to the existing draft ---
    if improvement_notes and existing_draft:
        system_prompt = f"""You are a professional cover letter editor. Your task is to apply targeted improvements to an existing cover letter.

RULES:
- Apply ONLY the requested changes. Do not rewrite or restructure sections that are not mentioned.
- Keep the overall tone, style, and structure of the original.
- Preserve all facts, names, and specific examples already present unless directly contradicted by the feedback.
- Do not add new sections or change the length significantly.
- FORMATTING: Pure Markdown. No meta-commentary before or after the letter.

IMPORTANT: Respond EXCLUSIVELY in {lang}!!!""".strip()

        user_prompt = f"""### EXISTING COVER LETTER
{existing_draft}

### REQUESTED IMPROVEMENTS
{improvement_notes}

### CONTEXT (for reference only — do not rewrite unless relevant to the improvements)
Position: {job_title} at {job_company}"""

    # --- FRESH GENERATION MODE ---
    else:
        system_prompt = f"""You are a professional cover letter writing expert with extensive experience in crafting compelling, high-conversion cover letters.

Your role is to create a personalized cover letter that effectively showcases the applicant's qualifications and the potential value they bring to the employer.

STRUCTURE:
1. OPENING PARAGRAPH: Show genuine enthusiasm and demonstrate knowledge of the company. NO clichés like "I am writing to apply..." or "With great interest...".
2. EXPERIENCE ALIGNMENT: Clear and concise paragraphs that connect the applicant's experience directly to the job requirements.
3. PROOF OF VALUE: Highlight achievements and skills using specific examples and metrics where available. Position the applicant as the SOLUTION to the company's problems.
4. VALUE PROPOSITION: Always focus on the value the applicant can offer to the company — not just what they want from the role.
5. CLOSING: A confident call-to-action requesting an interview, with a professional sign-off.

STRICT RULES:
- LENGTH: Approximately 300–500 words. Must fit on a single A4 page.
- TONE: Professional, engaging, confident — yet balanced with humility. Avoid AI-sounding buzzwords and flowery adjectives.
- KEYWORDS: Incorporate industry-specific and job-description keywords naturally.
- FACTUAL INTEGRITY: Use ONLY facts from the provided profile. Do not invent degrees, certifications, or employers.
- NO CV REPETITION: Do not list career stations. Focus on Skill → Benefit for the employer.
- TAILORING: The letter must be specifically tailored to this role and this company — no generic phrases.
- FORMATTING: Pure Markdown. No tables, no meta-commentary before or after the letter.

IMPORTANT: Respond EXCLUSIVELY in {lang}!!!""".strip()

        user_prompt = f"""### JOB POSTING
Position: {job_title}
Company: {job_company}
Description:
{job_description}

### APPLICANT PROFILE
Current Role: {profile_role}
CV Data:
{cv_text}"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def get_interview_prep_messages(
    job_title: str,
    company_name: str,
    job_description: str = "",
    cv_summary: str = "",
) -> List[Dict[str, str]]:
    prompt = f"""Agiere als Elite Interview Preparation Coach und Psychologe. Deine Aufgabe ist es, eine hochgradig personalisierte Vorbereitung für mein nächstes Interview zu erstellen.

        ====================
        KONTEXT & DATEN
        ====================
        - Rolle: {job_title}
        - Unternehmen: {company_name}
        - Kernanforderungen: {job_description}
        - Mein Profil: {cv_summary}

        ====================
        KRITISCHE REGELN (STRENG BEFOLGEN)
        ====================
        1. OUTPUT: Gib AUSSCHLIESSLICH valides JSON zurück. Kein Markdown, kein einleitender Text.
        2. ANSPRACHE: Du MUSST mich in JEDEM Satz direkt mit "du" oder "dein" ansprechen. Vermeide die dritte Person komplett.
        3. SPRACHE: Antworte AUSSCHLIESSLICH auf Deutsch.
        4. PITCH: Der "elevator_pitch" muss in der Ich-Form verfasst sein (authentisch und direkt sprechbar).
        5. QUELLE: Die "online_resources" MÜSSEN echte, klickbare URLs zu Artikeln, Tools oder Firmenprofilen sein, die für {company_name} oder die Rolle relevant sind.

        ====================
        JSON STRUKTUR
        ====================
        {{
          "executive_summary": "Max. 3 Sätze. Direkt, motivierend und auf deine Situation zugeschnitten (nutze 'du').",
          "social_intelligence": {{
            "ansprechpartner_recherche": "Ergebnisse deiner Websuche zu Personen bei {company_name} (z.B. LinkedIn Profile, aktuelle Themen des Managements).",
            "networking_hacks": "Wie du dieses Wissen im Gespräch dezent für dich nutzt."
          }},
          "structured_prep": {{
            "gap_analysis": [
              {{
                "anforderung": "Job-Anforderung",
                "dein_status": "Dein Match/Status laut CV",
                "gap_severity": "Low/Medium/High",
                "interview_strategie": "Konkrete Strategie, wie DU das im Gespräch adressierst."
              }}
            ],
            "elevator_pitch": "Dein 60-Sekunden-Auftritt in der Ich-Perspektive."
          }},
          "deep_dive_buttons": [
            {{
              "title": "Titel des Buttons",
              "focus": "Worauf konzentriert sich dieser Deep-Dive?",
              "why_it_matters": "Warum ist dieser Punkt für deinen Erfolg entscheidend?",
              "how_to_proceed": "Schritt-für-Schritt Anleitung für dich.",
              "linked_findings": "Welche Erkenntnis aus der Analyse wird hier vertieft?"
            }}
          ],
          "deep_dive_analysis": {{
            "qa_guide": "5 spezifische Fachfragen und wie du sie meisterst.",
            "behavioral_advice": "3 Fragen nach der STAR-Methode inklusive deiner empfohlenen Story.",
            "difficult_scenarios": "Strategien für deine individuellen Schwachstellen oder schwierige Fragen."
          }},
          "online_resources": [
            "Link zu aktuellen Nachrichten über {company_name}",
            "Link zu einem relevanten Fachartikel oder Branchen-Report",
            "Link zu Kununu/Glassdoor oder LinkedIn-Insights von {company_name}"
          ]
        }}

        ====================
        ANFORDERUNG: DEEP-DIVE BUTTONS
        ====================
        Erstelle MINDESTENS 10 dieser Buttons. Jeder Button muss eine spezifische Taktik oder ein psychologisches Manöver darstellen, das auf deine Situation zugeschnitten ist (z.B. 'Die Gehaltsverhandlung-Matrix', 'Umgang mit kritischen Stakeholdern', 'Die Culture-Fit Falle' etc.). Jedes Feld innerhalb der Buttons muss dich direkt mit 'du' ansprechen.

        ====================
        STIL & INHALT
        ====================
        - Sei hochspezifisch. Analysiere die 'Schmerzpunkte' des Arbeitgebers.
        - Gib konkrete Tipps zu Kommunikation und Psychologie.
        - WICHTIG: Die online_resources dürfen KEINE Platzhalter wie 'URL 1' sein. Führe eine Websuche durch und gib echte Links zu {company_name} (z.B. Newsroom, LinkedIn-Karriereseite, Branchennews).
      """

    return [{"role": "user", "content": prompt}]


def get_company_profile_summary_messages(
    company_name: str,
    job_title: str = "",
    industry: str = "",
    key_requirements: str = "",
    user_profile: str = "",
) -> List[Dict[str, str]]:
    prompt = f"""Agiere als Elite Interview Preparation Coach und Psychologe. Deine Aufgabe ist es, eine hochgradig personalisierte Vorbereitung für mein nächstes Interview zu erstellen.

====================
KONTEXT & DATEN
====================
- Rolle: {job_title}
- Unternehmen: {company_name}
- Branche: {industry}
- Kernanforderungen: {key_requirements}
- Mein Profil: {user_profile}

====================
KRITISCHE REGELN (STRENG BEFOLGEN)
====================
1. OUTPUT: Gib AUSSCHLIESSLICH valides JSON zurück. Kein Markdown, kein einleitender Text.
2. ANSPRACHE: Du MUSST mich in JEDEM Satz direkt mit "du" oder "dein" ansprechen. Vermeide die dritte Person komplett.
3. SPRACHE: Antworte AUSSCHLIESSLICH auf Deutsch.
4. PITCH: Der "elevator_pitch" muss in der Ich-Form verfasst sein (authentisch und direkt sprechbar).
5. RECHERCHE-PFLICHT: Nutze deine Browsing-Funktion, um spezifische Informationen über {company_name} zu finden.
6. LINKS: Das Feld "online_resources" darf KEINE Platzhalter (wie 'URL 1') enthalten. Führe eine Websuche durch und gib echte, klickbare und aktuelle URLs zu Presseportalen, LinkedIn-Firmenprofilen, Kununu-Bewertungen oder relevanten Branchennews an.

====================
JSON STRUKTUR
====================
{{
  "executive_summary": "Max. 3 Sätze. Direkt, motivierend und auf deine Situation zugeschnitten (nutze 'du').",
  "social_intelligence": {{
    "ansprechpartner_recherche": "Ergebnisse deiner Websuche zu Personen bei {company_name} (z.B. LinkedIn Profile, Themen).",
    "networking_hacks": "Wie du dieses Wissen im Gespräch dezent für dich nutzt."
  }},
  "structured_prep": {{
    "gap_analysis": [
      {{
        "anforderung": "Job-Anforderung",
        "dein_status": "Dein Match/Status laut CV",
        "gap_severity": "Low/Medium/High",
        "interview_strategie": "Konkrete Strategie, wie DU das im Gespräch adressierst."
      }}
    ],
    "elevator_pitch": "Dein 60-Sekunden-Auftritt in der Ich-Perspektive."
  }},
  "deep_dive_buttons": [
    {{
      "title": "Titel des Buttons",
      "focus": "Worauf konzentriert sich dieser Deep-Dive?",
      "why_it_matters": "Warum ist dieser Punkt für deinen Erfolg entscheidend?",
      "how_to_proceed": "Schritt-für-Schritt Anleitung für dich.",
      "linked_findings": "Welche Erkenntnis aus der Analyse wird hier vertieft?"
    }}
  ],
  "deep_dive_analysis": {{
    "qa_guide": "5 spezifische Fachfragen und wie du sie meisterst.",
    "behavioral_advice": "3 Fragen nach der STAR-Methode inklusive deiner empfohlenen Story.",
    "difficult_scenarios": "Strategien für deine individuellen Schwachstellen oder schwierige Fragen."
  }},
  "online_resources": [
    "ECHTE_URL_1_ZU_NEWS_ODER_PROFIL",
    "ECHTE_URL_2_ZU_KUNUNU_ODER_GLASSDOOR",
    "ECHTE_URL_3_ZU_RELEVANTER_FACHSEITE"
  ]
}}

====================
ANFORDERUNG: DEEP-DIVE BUTTONS
====================
Erstelle MINDESTENS 10 dieser Buttons. Jeder Button muss eine spezifische Taktik oder ein psychologisches Manöver darstellen, das auf deine Situation zugeschnitten ist (z.B. 'Die Gehaltsverhandlung-Matrix', 'Umgang mit kritischen Stakeholdern', 'Die Culture-Fit Falle' etc.). Jedes Feld innerhalb der Buttons muss dich direkt mit 'du' ansprechen.

====================
STIL & INHALT
====================
- Sei hochspezifisch. Analysiere die 'Schmerzpunkte' des Arbeitgebers.
- Gib konkrete Tipps zu Kommunikation und Psychologie.
- Validität: Stelle sicher, dass die URLs in 'online_resources' zum aktuellen Zeitpunkt erreichbar sind.
"""

    return [{"role": "user", "content": prompt}]


def get_deep_dive_messages(
    domain: str,
    company_name: str,
    focus: str,
    how_to_proceed: str,
    language: str = "de",
) -> List[Dict[str, str]]:
    output_language = "German" if language != "en" else "English"
    system_message = f"""You are a senior corporate intelligence analyst specializing in employer research for job candidates.
Your task is to write a focused, evidence-based research report about a specific aspect of a company.

Guidelines:
- Write 300-500 words in Markdown format
- Use concrete facts, data points, and examples wherever possible
- Clearly distinguish between confirmed facts, reasonable inferences, and speculation
- Structure your report with ## subheadings
- Be direct and actionable — the reader is a job candidate making an employment decision
- All output MUST be in {output_language}
- Do NOT wrap in code blocks — output raw Markdown only"""

    user_message = f"""Company: {company_name} ({domain})

Deep Dive Focus: {focus}

Research Approach:
{how_to_proceed}

Write a focused research report on this specific topic for {company_name}. Use your knowledge of this company and the research approach above. Be concrete and specific."""

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]


def get_extract_job_details_messages(
    text: str, language: str = "de"
) -> List[Dict[str, str]]:
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

    return [
        {"role": "system", "content": system_instruction},
        {
            "role": "user",
            "content": f"Extract the job description from this text:\n\n{text[:12000]}",
        },
    ]
