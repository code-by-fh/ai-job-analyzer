## 🎨 UI Context & Design System (Token-Optimized)

### 1. Core Paradigm

- **No Libraries:** Kein shadcn/ui, keine externen UI-Kits. Alle Komponenten in `frontend/app/components/` sind hand-rolled.
- **No Custom CSS Variables:** Keine neuen Hex-Variablen (`--bg-*`). Reine Tailwind 4 Utility-Klassen + globale CSS-Klassen aus `globals.css`.

### 2. Theme & Glassmorphism

- **Light & Dark:** Voller Support. Dark Mode nutzt die `class`-Strategie (`.dark` auf `<html>`). `ThemeToggler.tsx` schreibt direkt in `localStorage`. _Kein_ Theme-Provider.
- **Base Plates:** \* Light: `body { @apply bg-slate-50 text-slate-900; }`
- Dark: `.dark body { @apply bg-slate-950 text-slate-100; }`

- **Glass Utilities:** `.glass-card` (semi-opak), `.glass-panel` (transluzent + starker Blur), `.text-gradient` (Indigo ➔ Purple Text-Clip).

### 3. Color Token Mapping (Tailwind 4)

| Role                 | Light Variant                       | Dark Variant (`dark:`)                   |
| -------------------- | ----------------------------------- | ---------------------------------------- |
| **Surfaces / Cards** | `bg-white` / `.glass-card`          | `bg-slate-900/60` + Blur (`.glass-card`) |
| **Primary Text**     | `text-slate-900`                    | `text-white` / `text-slate-100`          |
| **Muted Text**       | `text-slate-500` / `text-slate-400` | `text-slate-400` / `text-slate-500`      |
| **Primary Accent**   | `text-indigo-600` / `bg-indigo-500` | `text-indigo-400` / `bg-indigo-500`      |
| **Accent Gradient**  | `from-indigo-500 to-purple-600`     | `from-indigo-400 to-purple-400`          |
| **Borders**          | `border-slate-200`                  | `border-slate-800`                       |
| **Error Status**     | `text-rose-600` / `bg-rose-50`      | `text-rose-400` / `bg-rose-500/10`       |
| **Success Status**   | `text-emerald-500`                  | `text-emerald-500` (identisch)           |
| **Warning / Fav**    | `text-amber-500` / `bg-amber-50`    | `text-amber-400` / `bg-amber-500/10`     |

### 4. Typography & Icons

- **Fonts:** Geist Sans (`--font-geist-sans`) für UI; Geist Mono (`--font-geist-mono`) für Code. Geladen über `next/font/google`.
- **Headings:** Immer `tracking-tight font-bold`. Meta-Labels: `text-[10px]` oder `text-[11px] uppercase tracking-wider`.
- **Markdown:** Rendered über `@tailwindcss/typography` mit `prose prose-sm dark:prose-invert max-w-none`.
- **Icons:** `lucide-react`. Sizes: `w-3.5` (tiny), `w-4` (default), `w-5` (sidebar/headers), `w-6` (mobile nav). Color via `currentColor`.

### 5. Border Radius Scale

- `rounded-lg`: Inline-Buttons, Badges, Chips.
- `rounded-xl`: Inputs, Selects, Standard-Buttons (z.B. Primary/Destructive).
- `rounded-2xl`: Cards, Dropdowns, Segmented Controls.
- `rounded-3xl`: Große Modals, Full-Screen Overlays.
- `rounded-full`: Avatars, Status-Dots, Toggles, Pills.

### 6. Layout Patterns & Components

- **App Shell (`DashboardShell`):** Desktop-Sidebar (`w-56`, kollabiert zu `w-[68px]`). Content-Offset: `md:pl-56`. Mobile: Top-Bar (`h-14`) + Bottom-Nav (`h-16`) mit Slide-Up "More"-Panel. Breakpoint: `md`.
- **Page Layout:** `PageHeader` (Titel + Actions, `border-b`) ➔ `PageWrapper` (`space-y-8` + Einblende-Animation). Container: `max-w-7xl mx-auto px-4`.
- **Modals:** Werden über `Portal.tsx` (`createPortal` in den Root-Body) gerendert, sperren den Scroll-State und nutzen native Keyframes (`popupEntry`, `backdropFade`).

---

## 🚨 UI Implementation Checklist

- [ ] Jede Oberflächen- und Textklasse besitzt ein `dark:`-Pendant.
- [ ] Buttons nutzen `rounded-xl`, `font-bold` und `active:scale-95` für haptisches Feedback.
- [ ] Modals werden strikt über `<Portal>` gerendert (Klick auf Backdrop schließt).
- [ ] Keine harten, statischen Hex-Farben (z.B. `#ffffff`) im Code verwendet.
- [ ] Responsives Verhalten geprüft (`md`-Breakpoint bricht von Sidebar auf Bottom-Nav).
