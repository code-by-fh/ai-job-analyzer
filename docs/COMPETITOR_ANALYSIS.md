# Wettbewerbsanalyse: Vergleichbare Open-Source-Lösungen

**Stand:** 2026-10-07

**Frage:** Gibt es auf GitHub bereits eine von der Community gepflegte Lösung, die dasselbe leistet wie dieses Projekt?

**Methode:**
- Websuche, danach die Kennzahlen (Sterne, letzter Push, Lizenz) über die GitHub-API abgefragt.
- Features aus den READMEs bzw. der Dokumentation der jeweiligen Projekte. Keines der fremden Projekte wurde installiert oder ausprobiert.
- Die Angaben zu diesem Projekt stammen aus `context/` und dem Code im Repo.

---

## 1. Kandidaten

| Projekt | ⭐ | Letzter Push | Lizenz | Einordnung |
|---|---|---|---|---|
| [DaKheera47/job-ops](https://github.com/DaKheera47/job-ops) | ~4.000 | 2026-10-06 | AGPLv3 + Commons Clause | Engster Konkurrent. Selbst gehostete Pipeline: suchen → bewerten → CV anpassen → PDF → nachverfolgen. Mehrere Mitwirkende, eigene Doku, Release-Pipeline, bezahlte Cloud-Variante. |
| [Gsync/jobsync](https://github.com/Gsync/jobsync) | ~1.370 | 2026-10-06 | MIT | Bewerbungs-Tracker mit KI-Assistent (Lebenslauf-Review, Matching, Anschreiben) und MCP-Server. Automatische Jobsuche nur über Greenhouse, Lever und Ashby. |
| [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search) | ~45.000 | 2026-10-05 | MIT | Kommandozeilen-Workflow auf Basis von Claude Code (`/scrape`, `/apply`, `/interview`). Keine Web-App, nur ein Benutzer. Scraper für den dänischen Markt. |
| [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | ~4.400 | 2026-10-07 | MIT | Kein Produkt, sondern eine Python-Bibliothek zum Scrapen (LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter …). JobOps setzt sie selbst ein. |
| [olyaiy/resume-lm](https://github.com/olyaiy/resume-lm) | ~330 | 2026-09-14 | AGPL-3.0 | Nur ein KI-Lebenslauf-Builder. Gleicher Frontend-Stack wie hier (Next.js, React 19, Tailwind). |
| [ibarrajo/ApplyPilot](https://github.com/ibarrajo/ApplyPilot), Jobberman, JobHound | gering | teils inaktiv | diverse | Kleine Einzelprojekte, teils mit automatischem Bewerben. Nicht von einer Community getragen. |

Das früher bekannte AIHawk (`feder-cr/Jobs_Applier_AI_Agent_AIHawk`) existiert unter dem Namen nicht mehr. Das Repo leitet auf ein anderes Projekt weiter.

**Zur Lizenz von JobOps:** Die Commons Clause verbietet, die Software zu verkaufen oder als bezahlten Dienst anzubieten, dessen Wert im Wesentlichen aus JobOps stammt. Code daraus darf daher nicht in ein vermarktetes Produkt übernommen werden.

---

## 2. Feature-Vergleich

**Legende:** ✅ vorhanden · ⚠️ eingeschränkt · ❌ nicht vorhanden · ? in README/Docs nicht erwähnt (kann trotzdem existieren) · – nicht anwendbar

| Feature | **AI Job Agent (dieses Projekt)** | **JobOps** | **JobSync** | **ai-job-search** |
|---|---|---|---|---|
| **Art der Lösung** | Web-App, Docker | Web-App, Docker | Web-App, Docker | CLI-Workflow auf Claude Code |
| **Jobs finden & Scraping** | | | | |
| Jobbörsen scrapen | ✅ frei per URL | ✅ 13 feste Börsen + eigene Extractoren (TS) | ⚠️ nur Greenhouse, Lever, Ashby (Firmen-APIs) | ✅ dänische Börsen + LinkedIn |
| Beliebige Plattform per URL anlegen (Einrichtungsassistent, URL-Muster) | ✅ | ❌ (Code schreiben) | ⚠️ Board-URL nur bei den drei ATS | ❌ (Skill schreiben) |
| Zeitgesteuerte Suchen | ✅ pro Plattform (Celery Beat) | ? | ✅ Automations | ❌ manuell `/scrape` |
| Live-Fortschritt beim Crawl | ✅ WebSocket | ? | ? | ❌ |
| SSRF-Schutz beim Crawlen | ✅ | ? | ? | – |
| **KI-Bewertung** | | | | |
| Match-Score gegen Profil | ✅ | ✅ 0–100 | ✅ | ✅ |
| Auto-Archivierung unter Schwellwert | ✅ | ? | ❌ | ❌ |
| Gesprochene Sprachen im Matching | ✅ | ? | ? | ? |
| Visa-Sponsoring-Prüfung | ❌ | ✅ (UK) | ❌ | ❌ |
| **Dokumente** | | | | |
| CV pro Stelle anpassen | ✅ | ✅ | ❌ (nur Review) | ✅ |
| Anschreiben generieren | ✅ | ✅ („Ghostwriter") | ✅ | ✅ |
| Gegenprüfung durch zweiten Agenten | ❌ | ? | ❌ | ✅ Reviewer-Agent |
| PDF-Export | ✅ WeasyPrint | ✅ lokal oder Reactive Resume | ✅ 2 Vorlagen | ✅ LaTeX |
| Eigene HTML-Vorlagen + Editor im Browser | ✅ Drag & Drop | ⚠️ über Reactive Resume | ❌ | ❌ (LaTeX-Dateien) |
| CV-Vorlage hochladen, KI füllt sie | ✅ | ? | ❌ | ❌ |
| Lebenslauf aus PDF/Word importieren | ❌ | ? | ✅ | ❌ |
| Profil-Dokumente (Zeugnisse, Referenzen) | ✅ | ? | ⚠️ Anhänge | ❌ |
| Ablage in Google Drive | ✅ (alternativ DB) | ❌ | ❌ | ❌ (lokale Dateien) |
| **Bewerbung & Nachverfolgung** | | | | |
| Status-Pipeline | ✅ Open → … → Accepted/Rejected, mit Historie | ✅ | ✅ | ? |
| Antworten aus Gmail auswerten (Interview/Absage erkennen) | ❌ | ✅ | ❌ | ❌ |
| Automatisch bewerben | ❌ bewusst | ❌ bewusst | ❌ | ❌ |
| Interview-Vorbereitung | ✅ KI-generiert | ? | ⚠️ manuelle Fragen-Sammlung | ✅ `/interview` |
| Firmen-Recherche (Tech-Stack, Kultur, Gehalt) | ✅ KI | ? | ⚠️ Firmenseiten ohne KI | ⚠️ optional Gehalt |
| Kontakte (Recruiter etc.) | ❌ | ? | ✅ | ❌ |
| Aufgaben & Zeiterfassung | ❌ | ? | ✅ | ❌ |
| Analyse-Dashboard | ✅ Übersicht | ✅ inkl. Antwortquote je Quelle | ✅ | ❌ |
| Mehrere Jobs gleichzeitig bearbeiten | ✅ | ✅ | ? | ❌ |
| **Plattform** | | | | |
| Mehrere Benutzer + Admin-Rolle | ✅ | ? | ⚠️ Accounts, Admin unklar | ❌ |
| Benachrichtigungen | ✅ Gmail, SMTP, Pushover, Resend, Mailjet | ? | ❌ | ❌ |
| KI-Anbieter | OpenRouter + Ollama, **wählbar pro Aufgabe** | viele inkl. OpenAI, Claude, Gemini, Ollama | Ollama, DeepSeek u. a. | nur Claude Code |
| MCP-Server für KI-Agenten | ❌ | ? | ✅ | – (läuft selbst als Agent) |
| Backup/Restore | ❌ | ? | ✅ ZIP | – (Git) |
| Oberfläche DE/EN | ✅ | ? | ? | – |
| Gehostete Variante | ❌ | ✅ £20–30/Monat | ✅ Demo | ❌ |
| **Community** | | | | |
| Sterne / letzte Aktivität (Stand 2026-10-07) | – | ~4.000 / 2026-10-06 | ~1.370 / 2026-10-06 | ~45.000 / 2026-10-05 |
| Lizenz | Apache 2.0 (laut `LICENSE`; das README-Badge zeigt fälschlich MIT) | AGPLv3 + Commons Clause | MIT | MIT |

---

## 3. Bewertung

### Was dieses Projekt als einziges kann
- Frei konfigurierbare Plattformen per URL statt fest einprogrammierter Scraper. Das ist der größte Unterschied, gerade für deutsche Jobbörsen (StepStone, XING …), die keines der anderen Projekte mitbringt.
- Eigene HTML-Vorlagen mit Editor im Browser, und hochgeladene CV-Vorlagen, die die KI befüllt.
- Mehrere Benutzer mit Admin-Rolle, fünf Benachrichtigungskanäle, Ablage in Google Drive.
- Wahl des KI-Anbieters pro Aufgabe (lokal oder Cloud) und automatische Archivierung unter dem Schwellwert.

### Was die anderen haben und hier fehlt
- **JobOps:** Gmail-Auswertung der Recruiter-Antworten und Antwortquote je Quelle.
- **JobSync:** Lebenslauf-Import aus PDF/Word, Kontakte, Aufgaben, MCP-Server, Backup/Restore.
- **ai-job-search:** Reviewer-Agent, der CV und Anschreiben vor der Ausgabe gegenprüft.

### Fazit
- **Gepflegte Lösung zum Benutzen:** JobOps ist der klare Kandidat. Vorher prüfen, ob es mit deutschen Jobbörsen zurechtkommt.
- **Eigene Weiterentwicklung:** Dieses Projekt hebt sich vor allem durch frei konfigurierbare Plattformen, die Vorlagen und Multi-User ab.
- **Möglicher Baustein:** JobSpy (MIT, Python) könnte Teile des eigenen Scrapers ersetzen.

### Offene Punkte
Die vielen „?" bei JobOps kommen daher, dass dessen Feature-Seite viel nicht erwähnt (z. B. Multi-User, Benachrichtigungen, zeitgesteuerte Suchen). Wo eine Zeile für eine Entscheidung wichtig ist, sollte sie gezielt im Code von JobOps nachgeprüft werden.

---

## Quellen

- [JobOps README](https://github.com/DaKheera47/job-ops)
- [JobOps Feature-Übersicht](https://jobops.dakheera47.com/docs/features/overview)
- [JobSync README](https://github.com/Gsync/jobsync)
- [ai-job-search README](https://github.com/MadsLorentzen/ai-job-search)
- [JobSpy](https://github.com/speedyapply/JobSpy)
- [ResumeLM](https://github.com/olyaiy/resume-lm)
- [ApplyPilot](https://github.com/ibarrajo/ApplyPilot)
- [Jobberman](https://github.com/joey727/Jobberman)
- [JobOps auf AlternativeTo](https://alternativeto.net/software/jobops/about)
- [Scrapfly: Best open-source job scrapers](https://scrapfly.io/blog/posts/best-open-source-job-scrapers)
