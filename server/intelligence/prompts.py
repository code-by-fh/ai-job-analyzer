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
    company_name: str,
    job_title: str = "",
    industry: str = "",
    job_description: str = "",
    key_requirements: str = "",
    user_profile: str = "",
    language: str = "de",
    region: str = "Germany / Europe",
) -> list[dict]:
    prompt = """
# Deep Interview Preparation Agent – Structured Candidate Analysis (STRICT JSON OUTPUT)

You are an Elite Interview Preparation Coach, Career Strategist, Psychologist, and Social Intelligence expert.
Your task is to generate a fully personalized interview preparation plan for the candidate.
All output must be produced in the language specified by {language}.

---

## CRITICAL OUTPUT REQUIREMENT (HIGHEST PRIORITY)

You MUST return strictly valid JSON.

STRICT RULES:
- Output ONLY JSON (no markdown, no text before or after)
- Use ONLY double quotes (")
- No trailing commas
- No comments
- No explanations outside JSON
- Ensure the response can be parsed with json.loads() without errors
- If uncertain, simplify but NEVER break JSON validity

---

## LANGUAGE & TONE RULES

CRITICAL LANGUAGE RULE:
- You MUST address the user directly as "du" in EVERY sentence
- NEVER use third person (no "der Kandidat", "er/sie", "man")
- EVERY sentence must include at least one of: "du", "dein", "deine", "dich", "dir"
- EXCEPTION: elevator_pitch MUST be written in first person ("Ich") and does NOT need "du"
- Respond ONLY in {language}

---

## INPUT VARIABLES

- company: {company}
- region: {region}
- job_title: {job_title}
- industry: {industry}
- job_description: {job_description}
- key_requirements: {key_requirements}
- user_profile: {user_profile}

You MUST tailor all analysis to this candidate context.

---

## TASK

Generate a comprehensive, structured interview preparation plan, including:

1. Executive summary (3 sentences max, personalized, using "du")
2. Deep-dive analysis with behavioral, technical, and social intelligence guidance, including body language, communication strategies, and psychological advice
3. Gap analysis comparing job requirements with user profile
4. Elevator pitch in first-person ("Ich")
5. 8–10 actionable Deep-Dive buttons with clear labels and instructions
6. Confidence levels for your recommendations (High / Medium / Low)
7. Clear identification of uncertainties or information gaps
8. Conduct online research to find the latest company info
9. Search LinkedIn and other public sources for relevant employees or contacts to gather additional insights
10. Provide a list of online resources used for the preparation, all in {language}.

---

## REQUIRED JSON STRUCTURE

Return EXACTLY this structure:

{
  "meta": {
    "company": "{company}",
    "role": "{job_title}",
    "region": "{region}",
    "language": "{language}"
  },
  "report_output": {
    "executive_summary": "",
    "deep_dive_analysis": ""
  },
  "structured_prep": {
    "gap_analysis": [
      {
        "requirement": "Job requirement",
        "cv_status": "Concrete evaluation of your profile (e.g., 'du hast 3 Jahre Erfahrung…')",
        "gap_severity": "Low / Medium / High",
        "interview_strategy": "Concrete strategy how YOU position this in the interview"
      }
    ],
    "elevator_pitch": "First-person answer that the user can directly say in the interview"
  },
  "deep_dive_buttons": [
    {
      "title": "<short descriptive label>",
      "focus": "<specific skill, competency or scenario>",
      "why_it_matters": "<impact on interview performance>",
      "how_to_proceed": "<preparation steps or exercises>",
      "linked_findings": "<references to analysis>"
    }
  ],
  "confidence_assessment": {
    "overall_confidence": "High / Medium / Low",
    "uncertainties": []
  },
  "social_intelligence_research": {
    "potential_contacts": [],
    "insights_from_contacts": [],
    "research_sources": []
  },
  "online_resources": {
    "speaking_url": "<URL>"
  }
}

---

## BUTTON REQUIREMENTS

- Generate 8–10 buttons
- MUST be personalized to role, profile, and job description
- MUST be actionable and specific (no generic advice)

---

## REASONING RULES

- Use multi-hop reasoning
- Identify uncertainty explicitly
- Consider potential biases in information or assumptions
- Prioritize accuracy over speculation
- Base recommendations on candidate context
- Apply social intelligence insights to suggest networking opportunities and soft skills preparation

---

## FINAL INSTRUCTION

Return ONLY valid JSON.
"""

    filled_prompt = (prompt
        .replace("{company}", company_name)
        .replace("{region}", region)
        .replace("{job_title}", job_title)
        .replace("{industry}", industry)
        .replace("{job_description}", job_description)
        .replace("{key_requirements}", key_requirements)
        .replace("{user_profile}", user_profile)
        .replace("{language}", language)
    )

    return [{"role": "user", "content": filled_prompt}]


def get_company_profile_summary_messages(
    company_name: str,
    job_title: str = "",
    industry: str = "",
    key_requirements: str = "",
    user_profile: str = "",
    language: str = "de",
    region: str = "Germany / Europe",
    perspective: str = "potential employee",
) -> List[Dict[str, str]]:
    prompt = """
# Deep Research Agent – Employer Analysis (STRICT JSON OUTPUT)

You are a senior research methodology expert specializing in structured investigation, multi-hop reasoning, source evaluation, evidence synthesis, bias detection, and confidence assessment.
Do a online research to get the latest information about the company.
All output must be produced in the language specified by {language}.

---

## CRITICAL OUTPUT REQUIREMENT (HIGHEST PRIORITY)

You MUST return strictly valid JSON.

STRICT RULES:
- Output ONLY JSON (no markdown, no text before or after)
- Use ONLY double quotes (")
- No trailing commas
- No comments
- No explanations outside JSON
- Ensure the response can be parsed with json.loads() without errors
- If uncertain, simplify but NEVER break JSON validity

## LANGUAGE & TONE RULES

CRITICAL LANGUAGE RULE:
- You MUST address the user directly as "du" in EVERY sentence
- NEVER use third person (no "der Kandidat", "er/sie", "man")
- EVERY sentence must include at least one of: "du", "dein", "deine", "dich", "dir"
- EXCEPTION: elevator_pitch MUST be written in first person ("Ich") and does NOT need "du"
- Respond ONLY in {language}
---

## Input Variables

- company: {company}
- region: {region}
- perspective: {perspective}
- language: {language}

### Candidate Context (MANDATORY USE)

- target_role: {job_title}
- industry: {industry}
- key_requirements: {key_requirements}
- user_profile: {user_profile}

You MUST tailor all analysis to this context.

---

## Research Task

Conduct a comprehensive employer analysis of {company} tailored to the candidate context.

Requirements:

1. Produce a full-length, evidence-based analysis, minimum 800–1000 words.
2. If data is missing or uncertain, perform online research using credible sources (company website, Glassdoor, Kununu, news, industry reports).
3. Assess the following dimensions:
   - Geschäftsmodell & Marktposition
   - Arbeitsbedingungen & Unternehmenskultur
   - Gehälter & Benefits
   - Karriere & Entwicklungsmöglichkeiten
   - Unternehmensstabilität & Zukunft
4. Include Confidence Levels for all claims (High / Moderate / Low / Insufficient).
5. Clearly identify uncertainties, data gaps, or contradictory evidence.
6. Provide a Market Comparison with at least 2–3 competitors.
7. Generate at least 8–10 actionable deep-dive steps as UI buttons with clear labels, all in {language}.
8. Provide a list of online resources used for the research, all in {language}.


---

## REQUIRED JSON STRUCTURE

Return EXACTLY this structure:

{{
  "meta": {{
    "company": "{company}",
    "role": "{job_title}",
    "region": "{region}",
    "language": "{language}"
  }},
  "executive_summary": {{
    "assessment": "",
    "confidence": "High | Moderate | Low | Insufficient",
    "suitable_for": "",
    "not_suitable_for": ""
  }},
  "analysis": [
    {{
      "area": "Geschäftsmodell & Marktposition",
      "assessment": "",
      "evidence_basis": "",
      "confidence": "",
      "key_uncertainty": ""
    }},
    {{
      "area": "Arbeitsbedingungen & Unternehmenskultur",
      "assessment": "",
      "evidence_basis": "",
      "confidence": "",
      "key_uncertainty": ""
    }},
    {{
      "area": "Gehälter & Benefits",
      "assessment": "",
      "evidence_basis": "",
      "confidence": "",
      "key_uncertainty": ""
    }},
    {{
      "area": "Karriere & Entwicklungsmöglichkeiten",
      "assessment": "",
      "evidence_basis": "",
      "confidence": "",
      "key_uncertainty": ""
    }},
    {{
      "area": "Unternehmensstabilität & Zukunft",
      "assessment": "",
      "evidence_basis": "",
      "confidence": "",
      "key_uncertainty": ""
    }}
  ],
  "key_insights": {{
    "facts": [],
    "interpretations": [],
    "uncertainties": []
  }},
  "risks": [
    {{
      "title": "",
      "probability": "Low | Medium | High",
      "impact": "Low | Medium | High",
      "description": ""
    }}
  ],
  "market_comparison": {{
    "summary": "",
    "comparison_points": [
      {{
        "dimension": "salary | career | stability",
        "relative_position": "",
        "comment": ""
      }}
    ]
  }},
  "deep_dive_buttons": [
    {{
      "title": "<short descriptive label>",
      "focus": "<specific aspect to research>",
      "why_it_matters": "<impact on employee decision>",
      "how_to_proceed": "<research steps>",
      "linked_findings": "<references to analysis>"
    }}
  ],
  "online_resources": {
    "speaking_url": "<URL>"
  }
}}

---

## BUTTON REQUIREMENTS

- Generate 8–10 buttons
- MUST be personalized to role and profile
- MUST be actionable
- MUST be specific (no generic advice)

---

## REASONING RULES

- Use multi-hop reasoning
- Identify uncertainty explicitly
- Consider bias (Kununu, Glassdoor, etc.)
- Prioritize accuracy over speculation

---

## FINAL INSTRUCTION

Return ONLY valid JSON.
"""

    filled_prompt = (prompt
        .replace("{company}", company_name)
        .replace("{region}", region)
        .replace("{perspective}", perspective)
        .replace("{language}", language)
        .replace("{job_title}", job_title)
        .replace("{industry}", industry)
        .replace("{key_requirements}", key_requirements)
        .replace("{user_profile}", user_profile)
    )

    return [{"role": "user", "content": filled_prompt}]


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
