# Agent + Job Design — resume-tailor (2026-09-23)

## 1. Goal
Add an AI agent to aid resume tailoring and cover-letter writing. Scope v1: tailor resume to a job, draft cover letters, chat coach. Approach A approved: renderer-only TypeScript agent.

## 2. Non-goals (v1)
No Rust backend, no SQLite, no vector search, no OCR for scanned PDFs, no auto-apply without confirm, no per-message chat delete, no multi-version compare per job.

## 3. Infra decisions (locked)
- **LLM:** `@earendil-works/pi-ai` (unified API, provider catalog, `CredentialStore`, cost tracking) + `@earendil-works/pi-agent-core` (`Agent`, `agentLoop`, tools, streaming). Rust `pi-ai`/`pi-agent` crates explicitly rejected — no Rust backend in this repo.
- **PDF parse:** `pdf-parse` v2 (`PDFParse`, browser+Node, `getText()`), extract-only in renderer. Note: literal npm `pdf-parser` is deprecated/buggy per upstream docs — use `pdf-parse`, not `pdf-parser`.
- **PDF view:** no `pdfjs-dist` rendering. `<iframe :src="blobUrl">` → Chromium pdfium in Electron + web.
- **UI kit:** `flowbite` + `flowbite-vue` (`Fwb*`: modal, input, select, toggle, toast, dropdown) for Settings/BYOK, New-Job modal, confirm/undo toasts. Tailwind v4 already present.
- **Threads:** wisp-style threads kept as JSON infra for future branching (not SQLite).

## 4. Data model (Workspace v3)
`profiles` → `jobs` (+ `activeJobId`); old files migrate. `Job extends Profile`:
`kind: 'master'|'job'`, `company`, `jobTitleTarget`, `jobDescription: string (readonly, extracted)`, `jobUrl?`, `coverLetter: string (markdown)`, `jdSource: {filename, pageCount, extractedAt, pdfRefId}|null`, plus inherited `template/accent/font/columns/density/title/summary/sections/view/overrides`, plus `chat: ChatThread`.
Master: exactly one `kind:'master'`, edits shared content directly, cannot be deleted.

### ChatThread (wisp port, `src/agent/threads.ts`)
`{ entryId: string|null, edges: Record<msgId, parentId|null>, decisions: number[]|null, messages: Record<id, ChatMsg> }` where `ChatMsg = {id, role: user|assistant|tool, text, timestamp}`. Helpers mirror `wisp-pro`: `addMessage`, `getChildren/getParent`, `getPathTo(leaf)` (parents→reverse, LLM context), `getDefaultLeaf` (last-child walk), `getTree() → {key,parent,children}[]`. Regenerations = siblings. `decisions` restores viewed branch.

### Byte + key stores (outside workspace JSON)
- PDF bytes: Electron `app-data/jd-pdfs/<jobId>.pdf` via main IPC; web IndexedDB `resume-tailor-jds`. Export/import JSON excludes bytes; missing PDF = "re-attach" badge.
- API keys: Electron `safeStorage` (OS keychain) via `agent-key:{set,get,delete}` IPC, blob beside store file, never in workspace export. Web: session-memory only + warning. `pi-ai` reads via async `getApiKey`.

## 5. Agent layer (`src/agent/`)
- `models.ts`: `createModels()` + keyring-backed `CredentialStore`, model picker (default anthropic/claude-sonnet-4), token/cost surfacing.
- `tools.ts` (4, active-Job scoped): `read_resume` (preview+JD readonly), `propose_bullet_rewrite` (→ `overrides`), `update_cover_letter`, `set_visibility` (→ `view`).
- `agent.ts`: system prompt for tailoring; `convertToLlm` filters to user/assistant/toolResult; `transformContext` = `getPathTo(activeLeaf)` + trim; `before_tool_call` enforces hybrid (auto-allow drafts/cover text; confirm modal for master deletes or hiding >50%).
- Streaming: `message_update` patches assistant node in place by id; retry = new sibling.

## 6. UI layout
Grid `[Job rail 260px | Pane1 | Pane2]` (`max-w 1600px`); mobile stacks, rail → horizontal select.
- `JobList.vue` rail: Master pinned + jobs (`company — role`, status dot grey/amber/green, updated-ago), `+ New job`, `⋯` (rename/duplicate/delete), text filter input.
- No tab bars: each pane header has a `Popover.vue` view-switch (`Form|Preview|Agent|JD PDF`). Guard: Form in one pane only. Defaults Pane1=Form, Pane2=Preview. Agent in either/both panes = same thread.
- `AgentPanel`: JD header (`[Text|PDF]` toggle: readonly extracted text + copy vs pdfium iframe + Replace JD button), thread view with `< 1/2 >` sibling switcher, composer + model badge + key-missing state, cover-letter tab bound to `job.coverLetter`.
- `FormNav` follows Form pane. Settings (BYOK, provider/model, limits) as Flowbite modal opened from the top bar.

## 7. CRUD
- Create: modal (company, role, JD PDF attach + extract, start-from template) → `view=allIds`, empty chat, PDF to byte-store.
- Switch: click row → `activeJobId`.
- Update: rename inline/`⋯`; JD replace-only (re-extract overwrites text); cover letter free edit; resume edits via existing override badges.
- Duplicate: copies JD/view/overrides/coverLetter, fresh chat.
- Delete: confirm modal (view, N overrides, letter, M msgs, PDF); active fallback to Master; 5s Undo toast.
- Chat: send/stop/retry/clear-thread (confirm); no single-message delete v1.

## 8. Errors, privacy, testing
Errors as inline thread nodes with retry (new sibling). No key/offline/401/rate-limit/extract-fail all handled with targeted copy + Settings link. Privacy banner: "Sends active Job context to [provider/model]." `vue-tsc` strict; tests: `threads.ts` (branch/path/default-leaf/decisions, ported from `wisp-pro/chat.rs`), v2→v3 migration, tool guards, keyring IPC mock.
