# Usability review of clickdummy-referenz.html (prioritised change list)

Verdict: domain logic strong (nextStep(), orange "Nächster Schritt" card, undo toasts, nodocs confirm, apply checklist — KEEP). Problems come from shell/dashboard furniture copied 1:1 from the Twisty/vestox images.

## P1 — structure and error prevention
1. Remove the floating frame (.app padding, .frame radius/shadow, --canvas). Full-bleed shell: white sidebar + grey --bg main.
2. Remove the right rail (withRail, renderRail, rail*). railNextSteps becomes an "Anstehend" block (max 3, from nextStepJobs()) at the top of Eingang. Search moves to sidebar top + Bewerbungen header. "Letzte Läufe" only in the source drawer.
3. Replace renderHero + lollipop on Eingang with a page header: h1 "Eingang" + lede status line ("3 neue Treffer · StepStone vor 2 Std.: 12 gefunden, 3 passend · nächster Lauf 14:00") + "Per URL importieren" on the right. (Lollipop = vanity metric; clicking a day filters nothing; pushes first job below fold.)
4. Replace the .acc accordion with always-visible compact rows: monogram, title, company · city · mode · salary, score pill, one-line fit reason or "Ausschlusskriterium" flag, inline Vormerken/Aussortieren. ≥1200px: master-detail (list ~420px, preview right).
5. Fix ACT.boardMove (bypasses backward-confirm, nodocs warning, outcome question, offers "Offen") — or delete the board (see 13).
6. Stepper: read-only status display + explicit "Phase ändern ▾" menu with all guards; confirm skipped stages (renderStepper, stepTo).
7. Threshold: move to Eingang › Unter Schwellwert, preview count then "Übernehmen", don't override manually restored jobs (INPUT.threshold, renderThreshold).
8. Bewerben: put renderApplyChecklist inside the orange .next card. For OPEN jobs put Aussortieren next to Vormerken in that card; remove it from jdHeader.
9. A11y: drop border-radius from :focus-visible; add --line-control #878e9a (≥3:1) for input/select/outline-button borders and .step-btn.future; 13.5px minimum for meaningful meta text (12.5px only for provenance/legal).
10. First run: show renderOnboarding automatically while no source or AI provider is configured (instead of empty hero).

## P2 — clarity and consistency
11. Bewerbungen: one card listing all phases, each with a subheader + one-line GROUP_HINT; drop per-group table headers. Rows open the job PAGE (drawers only for quick previews).
12. Funnel .fcol-ticks: one tick per application (not scaled gradient); funnel is the only phase filter. Remove Bewerbungen navTree.
13. Drop the board view (renderBoard, viewSeg).
14. Quellen: replace renderSourceOverview + source cards (dashboard tiles, bar bug: "gefunden" bar shows share of healthy sources) with a list: name/host, schedule, last run (result or error), status, "Durchsuchen" icon button. Failing sources in a .notice-error banner on top. Fix nested interactive elements (.src-card article containing a button; same for .bcard).
15. Separate .tag (static: 8px radius, no fill, hairline border) from .chip (clickable pill). Restyle .wizard-steps and .stage-pill so they don't look like buttons. Text inputs 12px radius.
16. Orange discipline: .progress > i in ink; Interview stage colour a neutral slate (not the accent); threshold line ink. Orange only for .next, due warnings, brand.
17. Terminology: "Unter Schwellwert" (automatic) vs "Von dir aussortiert" (manual); drop "Offen" from the stepper; "Treffer" for inbox items, "Bewerbung" from Vorgemerkt onwards. Page heading must match nav ("Eingang").
18. Job header: remove the stage chip (stage shown 3x), score 40px, visually secondary from Beworben onwards. .tab-state dots: replace with check + text or drop.
19. Activity: text label in a fixed place ("2 Aufgaben laufen"), a "Zuletzt fertig" list + unseen badge, toasts pause on hover/focus and ≥10s for action toasts, due badge on Bewerbungen nav item (overdue follow-up, interview within 48h).
20. Profil/Einstellungen sub-nav: in-page vertical list on desktop, seg on mobile; remove sidebar tree. Move Abmelden into the user menu (not a big sidebar button). Theme switch also under Einstellungen › Allgemein.
21. Unterlagen: one verb family for generation entry points; keep only the seg as preview switch.
22. Mobile: fullscreen "Vorschau groß öffnen" for A4 (text ~8px at 343px otherwise); overflow edge fade on stepper and tabs; scrollIntoView current step; ≥44px targets for chip-remove × and .btn-sm; make sure toast + bottombar + proto button don't cover a third of the screen.

## P3 — polish
23. Dark mode: .next as --accent-soft background with orange marker and button (full orange glares).
24. Add-source wizard: fold "URL-Muster" step into step 2 under "Erweitert".
25. Remove .mono tiles holding icons; monograms only for companies.
26. Profile completeness hint on Profil › Lebenslauf ("Lebenslauf ohne Ergebnisse → schwächere Bewertungen").
27. Low-contrast fills: --sunken vs white 1.13:1 → interactive fills need a visible boundary; stage dots --st-open/--st-closed ≥3:1.
28. Row focus: put a focusable link in the first cell instead of tabindex on <tr>.

## Recommended layouts
- Shell ≥1024px: full-bleed; white sidebar 232px (brand, 5 nav items with counts/due badge, bottom: activity status + user menu). Main on --bg, content max ~1120px, 40px padding. Every page: light 40px title + lede + primary action right. 768–1023px: sidebar collapses to 72px icons. Mobile: existing bottombar.
- Eingang: header with status lede → "Anstehend" card (only if items) → seg Neu / Unter Schwellwert / Von dir aussortiert → list + preview pane (fit summary, Passt/Lücken, posting link, sticky Vormerken (ink) / Aussortieren pair). "Unter Schwellwert" tab carries the threshold distribution (ticks) + slider + Übernehmen.
- Bewerbungen: header "5 aktiv · 1 fällig" + search → compact funnel tick strip (= filter) → one card with phase subheaders; rows: job · next step · since/due · documents → "Abgeschlossen (n)" collapsed.
- Job page: breadcrumb → header card (monogram, title, meta line with posting link, score 40px with ticks, read-only stepper + "Phase ändern ▾") → two columns: tabs + panel left (fluid), sticky 360px right column with orange next card holding its controls, then a small "Termine & Daten" card. Mobile order: header → next card → tabs → panel.
- Quellen: header with "Quelle hinzufügen" → error banner if needed → one list card of sources → drawer per source (pattern, schedule, notifications, run history).
- Profil/Einstellungen: pane max ~900px, 200px in-page sub-nav left, form cards right (form max 620px).

## Signature elements to keep (the reference spirit)
Urbanist; large light page titles with small bold captions; big numerals used sparingly (job score, funnel counts); near-black for selected/primary; ONE orange accent for "your next move"; tick/barcode device (funnel, score ticks, threshold distribution); soft 20–24px cards on light grey without borders; pill buttons/segs/badges (clickable only); company monograms; ink-pill toasts; A4 paper preview on the "desk".
