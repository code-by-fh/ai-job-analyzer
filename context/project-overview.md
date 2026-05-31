## 🎯 AI Job Agent Overview (Token-Optimized)

### 1. Core Concept

Self-Hosted (Docker Compose) Web-App für technische Endanwender zur Automatisierung der Stellensuche. Crawlt Jobbörsen, bewertet Postings via OpenRouter LLM gegen das Nutzerprofil, generiert Bewerbungen und trackt den Status im Dashboard (BYO-Key & BYO-Storage Modell).

### 2. Core User Flow & Features

1. **Auth & Profile:** JWT Cookie Auth, default Admin-Seed. Profil-Konfiguration (CV, Skills, Gehalt, Präferenzen).
2. **Crawl Engine:** Registrierung von Ziel-URLs mit Cron-Schedules. Auto-Crawl (Celery Beat) oder manuell. Support für HTTP & Playwright SSR. Live-Progress via WebSockets.
3. **AI Analysis & Gen:** LLM-Scoring + Begründung pro Job. On-Demand Generierung von Anschreiben & Interview-Prep (Refinement via User-Feedback-Notes).
4. **ATS Pipeline:** Status-Tracking (`OPEN` ➔ `DRAFTED` ➔ `APPLIED` ➔ `INTERVIEW` ➔ `OFFER` ➔ `ACCEPTED/REJECTED`), Favoriten, Historie, Notizen.
5. **Storage & Notifs:** Dual-Storage-Wahl pro User (Postgres Blob vs. Google Drive OAuth2). Multi-Channel Benachrichtigungen (Gmail, Pushover, Resend, Mailjet, SMTP).

### 3. Scope Boundaries

| In Scope (Erlaubt) | Out of Scope (Strikt Verboten) |
| --- | --- |
| Single-Tenant Docker Compose Stack | **Kein** Auto-Submit / Auto-Apply bei Jobbörsen (nur Drafts). |
| Multi-User-Support mit Admin-Rolle | **Kein** SaaS-Modell / Billing / Multi-Tenancy-Abrechnung. |
| OpenAI SDK Integration ➔ OpenRouter | **Keine** lokal gebündelten LLMs (User bringt Key). |
| Lokaler Blob- vs. Drive-Storage per User | Globales Job-Aggregation-Scraping ohne Target-URL. |
| Multi-Channel Notifications & i18n | Native Mobile Apps (nur Responsive Web UI). |

### 4. Hard Success Criteria

* **Crawl & Sync:** Plattform-Crawls laufen via Schedule oder Button-Klick; Frontend zeigt Live-Status über `/ws`.
* **Dynamic AI Config:** Admin-Nutzer wechselt OpenRouter-Key/Modell im Admin-UI; Änderungen greifen *ohne* Container-Neustart direkt für Celery-Tasks.
* **Bewerbungs-Iteration:** Entwürfe lassen sich auf Basis von Freitexteingaben (Nutzer-Anmerkungen) neu generieren und herunterladen.
* **Data Isolation:** Alle Job-Vorgänge, Notizen und Dokumente sind strikt auf die `user_id` des aktuellen Contexts isoliert.

---

## 🚨 Scope Checklist (Before Feature Dev)

* [ ] Dient das Feature direkt der Automatisierung, Bewertung, Generierung oder dem Tracking von Jobs? (Wenn nein ➔ Drop)
* [ ] Ist garantiert, dass *kein* externer Auto-Submit durchgeführt wird?
* [ ] Läuft das Feature vollständig autark im Self-Hosted-Docker-Setup (ohne Managed Cloud 3rd-Parties außer OpenRouter/Drive)?
* [ ] Sind alle Daten-Mutationen abgesichert gegen Cross-User-Zugriffe?