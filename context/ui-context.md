## 🎨 UI Context & Design System (Token-Optimized)

### 1. Core Paradigm

- **No Libraries:** No shadcn/ui, no external UI kits. All components in `frontend/app/components/` are hand-rolled.
- **No Custom CSS Variables:** No new hex variables (`--bg-*`). Pure Tailwind 4 utility classes + global CSS classes from `globals.css`.

### 2. Theme & Glassmorphism

- **Light & Dark:** Full support. Dark Mode uses the `class` strategy (`.dark` on `<html>`). `ThemeToggler.tsx` writes directly to `localStorage`. _No_ Theme provider.
- **Base Plates:** 
  - Light: `body { @apply bg-slate-50 text-slate-900; }`
  - Dark: `.dark body { @apply bg-slate-950 text-slate-100; }`
- **Glass Utilities:** `.glass-card` (semi-opaque), `.glass-panel` (translucent + strong blur), `.text-gradient` (Indigo ➔ Purple text clip).

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
| **Success Status**   | `text-emerald-500`                  | `text-emerald-500` (identical)           |
| **Warning / Fav**    | `text-amber-500` / `bg-amber-50`    | `text-amber-400` / `bg-amber-500/10`     |

### 4. Typography & Icons

- **Fonts:** Geist Sans (`--font-geist-sans`) for UI; Geist Mono (`--font-geist-mono`) for code. Loaded via `next/font/google`.
- **Headings:** Always `tracking-tight font-bold`. Meta-labels: `text-[10px]` or `text-[11px] uppercase tracking-wider`.
- **Markdown:** Rendered via `@tailwindcss/typography` with `prose prose-sm dark:prose-invert max-w-none`.
- **Icons:** `lucide-react`. Sizes: `w-3.5` (tiny), `w-4` (default), `w-5` (sidebar/headers), `w-6` (mobile nav). Color via `currentColor`.

### 5. Border Radius Scale

- `rounded-lg`: Inline buttons, badges, chips.
- `rounded-xl`: Inputs, selects, standard buttons (e.g., Primary/Destructive).
- `rounded-2xl`: Cards, dropdowns, segmented controls.
- `rounded-3xl`: Large modals, full-screen overlays.
- `rounded-full`: Avatars, status dots, toggles, pills.

### 6. Layout Patterns & Components

- **App Shell (`DashboardShell`):** Desktop sidebar (`w-56`, collapses to `w-[68px]`). Content offset: `md:pl-56`. Mobile: Top bar (`h-14`) + Bottom navigation (`h-16`) with slide-up "More" panel. Breakpoint: `md`.
- **Page Layout:** `PageHeader` (Title + Actions, `border-b`) ➔ `PageWrapper` (`space-y-8` + fade-in animation). Container: `max-w-7xl mx-auto px-4`.
  - `PageHeader` contains: page title (`text-xl font-bold tracking-tight`), optional subtitle, and right-aligned action buttons (e.g. "New Job", "Save").
  - `PageWrapper` contains: everything below the header — filters, tables, cards, forms. Never put action buttons inside `PageWrapper`.
- **Modals:** Rendered via `Portal.tsx` (`createPortal` into the root body), lock the scroll state, and use native keyframes (`popupEntry`, `backdropFade`).
  - `popupEntry`: scale from `0.95` + opacity `0` → `1` over `180ms ease-out`. Use for modal content panels.
  - `backdropFade`: opacity `0` → `0.5` over `150ms ease-out`. Use for the backdrop overlay.
  - Do not define new keyframe animations inline — add them to `globals.css` and reference by name.

---

## 🚨 UI Implementation Checklist

- [ ] Every surface and text class has a `dark:` counterpart.
- [ ] Buttons use `rounded-xl`, `font-bold`, and `active:scale-95` for haptic feedback.
- [ ] Modals are strictly rendered via `<Portal>` (clicking on backdrop closes the modal).
- [ ] No hardcoded, static hex colors (e.g., `#ffffff`) used in the code.
- [ ] Responsive behavior verified (`md` breakpoint collapses sidebar to bottom navigation).
