# RELEASE NOTES

## 0.2.2

> **Mira works everywhere again, and Settings gets out of the way 🛠️**

A fixes-only follow-up to v0.2.1: pi-ai calls that failed in dev or against opencode-style backends now go through, think on/off models get a proper switch, and the Providers/Agent surfaces guide instead of nagging.

### What's new

#### Thinking switch for think on/off models

- Reasoning models without a multi-level effort map (Claude Sonnet 4.5 — the default model — o3, Gemini flash, Kimi, Qwen, GLM, …) or with a single mapped level now show a **Think switch** instead of hiding the control entirely. Multi-level models (e.g. GPT-5) keep the effort slider.
- Switching models preserves your on/off intent — it never silently turns thinking off.

#### Context window usage in the agent panel

- The footer now shows live usage (`12.3k/200k · 6%`) with a thin progress bar (amber at 70%, red at 90%). Numbers come from the API response; before the first reply it estimates from the transcript (marked `≈`). Hover for the input/output/cache breakdown.

#### Providers & models sort themselves

- Providers and models with enabled entries float to the top, alphabetical within each group. Providers with enabled models get an enabled-count badge.

#### Quieter key management, better first run

- A stored API key collapses to a single yellow **Reconfigure key** button; clicking it returns to the input without deleting the stored key.
- With no model enabled at all, the agent panel guides you to Settings (add a key + enable models) instead of prompting for one provider's key.

### Fixes

- **pi-ai in dev —** providers without CORS headers (e.g. opencode.ai zen) failed preflight from the Vite dev origin. Dev-only bypass in the Electron main process (packaged builds unaffected, `webSecurity` stays on).
- **opencode 400 `MissingSessionID` —** the `x-opencode-session` routing header is now sent, bound to the active conversation.
- **Template typecheck —** `vue-tsc` pinned to `3.3.11`; 3.3.13 falsely reported 16 `Cannot find name` errors in `ResumeForm.vue` (file untouched, runtime unaffected).

### Data & compatibility

- No breaking change and no migration — old workspaces and settings carry over as-is.

### Downloads

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | Resume Tailor-0.2.2-arm64.dmg |
| Windows | Resume Tailor Setup 0.2.2.exe |
| Linux | Resume Tailor-0.2.2.AppImage |

> [!important]
> Same as v0.2.1 — **please read before applying anywhere**
> - Fair use / honest by design still applies — everything you export must be true and interview-defensible.
> - GenAI policy — check university/employer rules first; verify every Mira suggestion.
> - Notebook is private by design — stored locally (IndexedDB / SQLite), never included in resume/letter PDFs.

### Known limitations (unchanged)

- Desktop builds are unsigned: macOS Gatekeeper / Windows SmartScreen will warn on first launch (right-click → Open).
- macOS build is Apple Silicon only; Intel/universal binary planned.
- No in-app auto-update yet — grab new versions from this page.

## 0.2.1

> **A4 or Letter, cleaner exports, and Mira drafts entries ✍️**

A small, sharp follow-up to v0.2.0: pick your page size, ship PDFs with real document metadata, edit a job's company and role after creating it, and let Mira add the entries you tell her about.

### What's new

#### Page size — A4 or Letter, per document

- Choose **A4** (210 × 297 mm) or **US Letter** (8.5 × 11 in) from the Style popover — set independently for a job's **resume** and its **cover letter**.
- Wired through the whole path: a `.paper-letter` page box in the preview, matching `@page` / print rules, and Electron `printToPDF`'s `pageSize`. The default stays A4, so nothing changes until you pick Letter.

#### Exports — real PDF metadata and per-document names

- Exported PDFs now carry proper document info instead of blank fields:
  - **Title** — `Resume - <Name>` or `Cover letter - <Name>`
  - **Author** — your master contact name
  - **Subject** — `<Resume|Cover letter> - <Company> - <Role>`
- The save dialog and default filenames now distinguish document kind (`resume.pdf` / `cover-letter.pdf`), and the dialog title says which document you're exporting.

#### Edit a job's company and role

- The job dialog now edits **Company**, **Role**, and **Name** — previously only the name could be changed. (The Master keeps a name-only edit.)

#### Mira

- **New tools —** `add_experience_item` and `add_project_item`. After you confirm the true facts, Mira can create one new experience or project entry (allowed on Master; saved to the shared Master and shown on the active job). She still refuses to invent anything.
- **See hidden items —** `read_resume` accepts `includeHidden:true` to reveal Master items hidden on the current job (useful for suggesting a strategic unhide).
- **Full manuals —** manual reads are no longer truncated; Mira gets the whole body.
- **A better notebook habit —** the system prompt now tells Mira to check notes *before* asking you to repeat yourself, to save reusable facts immediately, and to patch notes instead of duplicating them.
- **Apply to master —** a new action on a job override pushes the tailored wording back into the shared Master and drops the now-redundant override.

#### Model picker

- The Model tab sorts enabled models (provider → label → id) and auto-selects the first as the default — unless your stored default is still enabled, which wins.

### Fixes

- **macOS dock re-open crash —** clicking the dock icon after closing the window re-ran startup, which re-registered IPC handlers (a hard throw) and left stale splash flags. IPC now registers once and window-opening is a repeatable, state-reset routine.
- **Much smaller installers —** every build-time-only dependency (Vue, Flowbite, remark, unpdf, localforage, …) moved to `devDependencies`, so electron-builder stops bundling them (Vite already inlines them into `dist/`). Only `pdf-lib` ships as a runtime dependency, cutting the packaged size substantially.

### Data & compatibility

- Each profile now stores `paperSize` and each job stores `letterPaperSize` (both default to `a4`). Old workspaces migrate automatically via `normalizePaperSize` — no breaking change; existing `.json` / `.zip` imports keep working.

### Downloads

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | Resume Tailor-0.2.1-arm64.dmg |
| Windows | Resume Tailor Setup 0.2.1.exe |
| Linux | Resume Tailor-0.2.1.AppImage |

> [!important]
> Same as v0.2.0 — **please read before applying anywhere**
> - Fair use / honest by design still applies — everything you export must be true and interview-defensible.
> - GenAI policy — check university/employer rules first; verify every Mira suggestion.
> - Notebook is private by design — stored locally (IndexedDB / SQLite), never included in resume/letter PDFs.

### Known limitations (unchanged)

- Desktop builds are unsigned: macOS Gatekeeper / Windows SmartScreen will warn on first launch (right-click → Open).
- macOS build is Apple Silicon only; Intel/universal binary planned.
- No in-app auto-update yet — grab new versions from this page.

## 0.2.0

> **Compact, roomier, and Mira remembers 📓**

A focused follow-up to v0.1.0: a dense 1-page template, a more flexible workspace, and a private Notebook so Mira stops asking you the same background twice.

### What's new

#### 4th template — Compact (Jake's Resume)

- New **Compact** template based on [Jake's Resume on Overleaf](https://www.overleaf.com/latex/templates/jakes-resume/syzfjbzwjncs) — centered serif header, ruled small-caps sections, tight bullets, inline skills, `9mm 12mm 10mm` page padding.
- Built for the 1-page constraint: `10.5–11px` type, `1.35` leading, two-line entries (title/company + date), respects the same per-job visibility / order / overrides as the other templates.
- Now 4 templates: **Modern / Classic / Minimal / Compact**, all with 1/2-column and per-job style.

#### Workspace — collapsible rail + resizable split

- **Collapse the profile rail** — chevron button hides the left Job List to give the two panes more room. Persists in `localStorage` (`rt:railCollapsed`).
- **Draggable divider** between the two panes — drag, double-click to reset to 50/50, or nudge with arrow keys. Clamped `20–80%`, persisted as `rt:splitPct`. Stacks vertically on mobile as before.
- Both pane switcher popovers now `start-align` (fixes clipping on the right pane).

#### Mira — Private Notebook + Answer-Sheet guidance

##### Notebook (local-only, never exported)

- New **Notebook** pane (`notes` view) — user-titled markdown notes stored on `MasterResume.notes` (`id / title / body / updatedAt`, `120` / `8000` char limits). Create / edit / delete in the UI, autosaves on change.
- **Index-only injection** — every job prompt now includes `Notebook: N notes — title | title | …` plus a nudge to check `list_notes` / `search_notes` / `read_note` before asking the user to repeat background. Full bodies stay behind `read_note` (`NOTE_BODY_CHARS: 4000`).
- **6 new agent tools:** `list_notes` (index + 120-char previews), `read_note` (by `id` or exact `title`), `search_notes` (full-text with `…snippet…`), `save_note` (upsert by `id` else exact `title`, never invents), `patch_note` (exact-phrase `search→replace`, refuses on 0 or 2+ matches so Mira narrows the string), `delete_note`. Shared pure helper `patchNoteInList` for panel + agent.
- Notes survive import/export/migration via `normalizeNotes` and are excluded from preview/PDF.

##### New manual — `resume-answer-sheet`

- Includes 4-step method: `① Inventory (from self) → ② Requirements (from JD) → ③ Translate-trim → ④ Assemble-check`, bullet formula `Verb + method/tool + quantified result`, 5 self-checks (30s retell, name-cover, company-swap, numbers, deletion), and a diagnosis table.
- Mira reads it when the user is/likely is a student/new-grad or the resume shows classic pitfalls (archive-style listing, no numbers, one-size-fits-all). Prompt now notes notes are user-editable and asks Mira to clarify contradictions.

#### Branding & polish

- **App icons** — `ResumeStackIcon` / `ResumeStackIconSmall` in header (`28px`), favicons (`16/32/svg`), `apple-touch-icon`, `icon-192/512`, `icon.icns`/`icon.ico`, `site.webmanifest`, Electron bundle icons.
- **External links** — GitHub button now calls `shell.openExternal` via `window.electronAPI.openExternal` on desktop (validated `http(s)` in `electron/main.ts`) so it never navigates the app window; falls back to `window.open` on web.
- **Print fix** — `#panes` / `.pane-col` forced to `display:block`, `gap:0`, `box-shadow:none` in `@media print` — fixes the `gap-6` white strip that pushed the resume onto a second page at print width (~794px).
- **Release workflow** — drops `release/builder-debug.yml` from artifacts.

### Data & compatibility

- `MasterResume` now has `notes: MemoryNote[]`. `normalizeWorkspace` migrates old workspaces (empty array if missing, dedupes `id`, trims limits). No breaking change — existing `.json` imports keep working.

### Downloads

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | Resume Tailor-0.2.0-arm64.dmg |
| Windows | Resume Tailor Setup 0.2.0.exe |
| Linux | Resume Tailor-0.2.0.AppImage |

> [!important]
> Same as v0.1.0 — **please read before applying anywhere**
> - Fair use / honest by design still applies — everything you export must be true and interview-defensible.
> - GenAI policy — check university/employer rules first; verify every Mira suggestion.
> - Notebook is private by design — stored locally (IndexedDB / SQLite), never included in resume/letter PDFs.

### Known limitations (unchanged)

- Desktop builds are unsigned: macOS Gatekeeper / Windows SmartScreen will warn on first launch (right-click → Open).
- macOS build is Apple Silicon only; Intel/universal binary planned.
- No in-app auto-update yet — grab new versions from this page.

## 0.1.0

> **First release 🎉**

### What's inside

#### Core
- Master resume + one profile per job: each job keeps its own visible items and order, per-item overrides, title, summary, and visual style
- Live A4 preview with 3 templates (Modern, Classic, Minimal), 1/2-column layout, per-job style, sections panel with custom sections (Certifications, Languages, …)
- Structured cover letters with independent styling, live preview, and separate PDF export
- PDF export with crisp selectable text (print-to-PDF on web, direct save on desktop)

#### Mira, the tailoring agent (BYOK)

- Per-job chat with threaded, retryable conversations
- Attach the posting PDF — suggestions stay grounded in the JD
- Drafts bullet rewrites, titles, summaries, and cover letters as the same overrides you'd make by hand
- Honest by design: asks for evidence, never invents experience, flags gaps you don't meet
- Bring your own API key — stored in the OS keychain on desktop, session memory on web

**Private by design** — workspace auto-saves locally (IndexedDB / SQLite), import/export for moving between machines, light/dark workspace.

### Downloads
| Platform | File |
| --- | --- | 
| macOS (Apple Silicon) | Resume Tailor-0.1.0-arm64.dmg |
| Windows | Resume Tailor Setup 0.1.0.exe |
| Linux | Resume Tailor-0.1.0.AppImage |

> [!important]
> **Please read before applying anywhere**
> - Fair use: everything you export must be true and interview-defensible. The app shows the full terms on first launch.
> - GenAI policy: check your university/employer rules first — if AI use is banned, don't use Mira. Where allowed, verify every suggestion; models hallucinate, and you own every line.
> - Sample data: the built-in Bob Smith workspace is placeholder content — replace it with your history.

### Known limitations

- Desktop builds are unsigned: macOS Gatekeeper / Windows SmartScreen will warn on first launch (right-click → Open, or equivalent).
- macOS build is Apple Silicon only in this release; Intel Mac support (universal binary) is planned.
- No in-app auto-update yet — grab new versions from this page.
