---
trigger: manual
---

### DESIGN SYSTEM VORGABEN (GLOBAL)

1. DESIGN PHILOSOPHIE: "Harmonized Adaptive Depth"
   - Ziel: Ein nahtloses Erlebnis. Light Mode wirkt "clean & physisch" (Papier), Dark Mode "immersiv & lumineszierend" (Glas).
   - Light Mode: Fokus auf Lesbarkeit, subtile `shadow-sm` und feine `border-slate-200`. Wirkt professionell und luftig.
   - Dark Mode: Fokus auf Tiefe durch `backdrop-blur`, innere `ring-white/5` Borders und farbige Glows. Kein reines Schwarz.
   - Konstanz: Layout und Abstände bleiben identisch, nur die "Materialität" ändert sich.

2. TECH STACK & TOOLS:
   - Framework: React (TypeScript)
   - Styling: Tailwind CSS (Utility-First)
   - Theme Management: `next-themes` (Class Strategy). Initial: `system` (bevorzuge Host-Einstellung).
   - Icons: Lucide React (Strichstärke: 1.5px für Eleganz).
   - Components: Shadcn/ui Stil (Radix Primitives).

3. FARBPALETTE & KLASSEN (Harmonisiertes Mapping):

   A. OBERFLÄCHEN & HINTERGRÜNDE (Light -> Dark):
   - App Background: `bg-slate-50` -> `dark:bg-slate-950` (Ein sehr dunkles, kühles Blau-Grau).
   - Card Surface: `bg-white border border-slate-200 shadow-sm` -> `dark:bg-slate-900/40 dark:border-slate-800 dark:backdrop-blur-md` (Glas-Effekt).
   - Sidebar/Panel: `bg-slate-50/80` -> `dark:bg-slate-950/80` (jeweils mit Blur).

   B. TYPOGRAFIE & KONTRAST:
   - Headings (H1-H3): `text-slate-900 tracking-tight` -> `dark:text-slate-50`.
   - Body Text: `text-slate-600` -> `dark:text-slate-400` (Vermeide zu hartes Weiß im Dark Mode für Fließtext).
   - Muted/Meta: `text-slate-400` -> `dark:text-slate-500`.

   C. SEMANTISCHE STATUS-FARBEN (The "Glassy Chip" Look):
   *Anstatt massiver Hintergründe nutzen wir im Dark Mode transparente Flächen mit farbigen Rändern.*

   - Primary (Brand/Action):
     - Light: `bg-indigo-600 text-white hover:bg-indigo-700`
     - Dark: `dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-500 dark:shadow-[0_0_15px_rgba(99,102,241,0.3)]` (Glow!)

   - "Deep Thinking" (AI Processing):
     - Light: `bg-amber-50 text-amber-700 border border-amber-200`
     - Dark: `dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20 animate-pulse`

   - "Active/Running" (Crawler):
     - Light: `bg-emerald-50 text-emerald-700 border border-emerald-200`
     - Dark: `dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20` (Plus `shadow-emerald-500/10`)

   - "Error/Stopped":
     - Light: `bg-rose-50 text-rose-700 border border-rose-200`
     - Dark: `dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20`

4. TYPOGRAFIE & FORMEN:
   - UI Font: 'Inter' oder 'Plus Jakarta Sans' (Variable Font empfohlen).
   - Code Font: 'Roboto Mono' oder 'JetBrains Mono' (für Logs).
   - Radius: `rounded-xl` (Standard), `rounded-lg` (Interne Elemente).
   - Borders: Im Dark Mode immer `dark:border-slate-800` nutzen, um Elemente vom Hintergrund abzuheben.

5. KOMPONENTEN-REGELN & LAYOUT:
   - Theme Toggle: 
     - Position: Fixiert unten links (`fixed bottom-4 left-4`) oder Sidebar-Footer.
     - Verhalten: Umschaltbar (Light/Dark/System).
   - Buttons: 
     - Subtile Animation beim Klick (`active:scale-95`).
     - Light: Solide Farben. Dark: Leichter Glow bei Hover.
   - Cards/Container:
     - Light: Trennung durch Schatten (`shadow-sm`) und Border.
     - Dark: Trennung durch Surface-Farbe (`bg-white/5`) und Border (`border-white/10`). KEINE Schlagschatten nach außen im Dark Mode (wirkt unsauber).
   - Logs/Terminal:
     - Immer dunkel, auch im Light Mode (für Kontrast): `bg-slate-950 text-slate-300 font-mono text-xs rounded-lg p-4`.

### OUTPUT REGELN
- Nutze `dark:` Modifier für JEDE Farbeigenschaft.
- Keine harten Kontraste im Dark Mode (z.B. kein `#000` auf `#FFF`), nutze Off-White (`slate-200`) auf Dark-Grey (`slate-900`).
- Wenn "Deep Thinking" aktiv ist, nutze Skeleton-Loader oder pulsierende Badges.