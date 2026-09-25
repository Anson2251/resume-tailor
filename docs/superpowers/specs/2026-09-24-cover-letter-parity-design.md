# Cover Letter Parity Design — resume-tailor (2026-09-24)

## 1. Goal

Make the cover letter a first-class document equal to the resume (option B approved:
fully independent letter styling). Today the letter is a single `job.coverLetter: string`
edited in a textarea inside `AgentPanel`'s `Chat | Cover letter` tabs, with no preview,
no templates, no pane, and no export. After this change each job owns a structured
letter + independent style + live A4 preview + export, side-by-side with the resume.

## 2. Canonical letter template (locked)

All letter templates render this exact block order (differing only in alignment,
type scale, and accent usage, mirroring the Modern/Classic/Minimal resume trio):

```text
[name]
[email] | [website] | [tele] | [region]
[date]

[hiring division]
[address]

Re: [job title] (Posting [post number])

[letter]

Sincerely,
[name]
[degree] Candidate | [university]
```

Field mapping:

| Slot                                   | Source                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| name / email / website / tele / region | live from `master.contact` (fullName, email, website, phone, location). Never duplicated per job                          |
| date                                   | `letter.dateMode: 'auto'` (today, locale date) or `'custom'` + `letter.dateCustom`                                        |
| hiring division                        | `letter.recipientTitle`                                                                                                   |
| address                                | `letter.recipientAddress` (multiline plain text)                                                                          |
| job title                              | `letter.jobTitle`, defaults from `job.jobTitleTarget` at job creation, editable per letter                                |
| post number                            | `letter.postingNumber` (empty = omitted, parens dropped)                                                                  |
| Re line                                | auto-composed `Re: <jobTitle> (Posting <n>)`; `letter.showReLine` toggles it                                              |
| letter body                            | `letter.body` (markdown, rendered with the same `MarkdownText` pipeline as resume)                                        |
| Sincerely,                             | `letter.signoff`, default `"Sincerely,"`                                                                                  |
| signature name                         | live from `master.contact.fullName`                                                                                       |
| credential line                        | `letter.credentialLine`, default auto-built from latest `master.education` entry (`degree + school`, e.g. `B.S. Candidate | State University`), editable per job |

No greeting/salutation field in v1 — the approved template has none; body starts directly.

## 3. Data model

```ts
export interface CoverLetter {
	recipientTitle: string
	recipientAddress: string
	jobTitle: string
	postingNumber: string
	showReLine: boolean
	body: string
	signoff: string
	dateMode: 'auto' | 'custom'
	dateCustom: string
	credentialLine: string
}

export interface Job extends Profile {
	// ...existing fields...
	letter: CoverLetter // NEW (replaces coverLetter)
	letterTemplate: string // NEW — TEMPLATES id, default mirrors resume template at creation
	letterAccent: string // NEW — default mirrors resume accent at creation
	letterFont: string | null // NEW — null = template default (same convention as resume font)
	letterDensity: number // NEW — same normalizeDensity() range as resume
}
```

Rules:

- Sender identity is never stored on the letter; templates always read `master.contact`.
- `credentialLine` default is computed once at job creation (not live), so later master
  education edits don't silently rewrite a finished letter. Empty education → empty default.
- `jobTitle` default snapshots `job.jobTitleTarget` at creation; afterwards they diverge
  independently (renaming the job doesn't rewrite the letter's Re line).
- Letters are single-column always: no `letterColumns`, no letter sections/layout.
- `coverLetter: string` is removed; migration maps it to `letter.body` (section 7).

## 4. Panes + editing UX (approved, revised per review)

- `PaneView` gains `'letter'` and labels are renamed for parity: Resume / Resume preview /
  Cover letter / Agent / JD PDF. The `form` / `preview` view values are kept (only labels
  change) to avoid churning `panes.ts` and its tests. The resume-form-only-in-one-pane
  guard is unchanged.
- The `letter` pane hosts the letter form only: `CoverLetterForm.vue` (structured fields:
  Recipient, Subject/Re line, Body, Sign-off/Date). The letter preview does NOT sit
  under the form — it lives as a tab in the preview pane (revised per review).
- The `preview` pane gains a `Resume | Cover letter` tab (per-pane state, defaults to
  Resume): `ResumePreview` or `LetterPreview` below it. When both panes show the preview
  they stay on alternative views (`syncPreviewTabs` in `agent/panes.ts`) — switching one
  tab mirrors the other, and switching a second pane to Preview takes the alternative of
  the first.
- `FormNav` follows the Resume pane (unchanged scope, relabeled anchor source).
- `AgentPanel` drops its `Chat | Cover letter` tabs and becomes pure chat: no letter
  textarea. All letter editing lives in the Cover letter pane (`CoverLetterForm` body
  field). Agent tool cards for letter writes gain a "Review in Cover letter pane"
  affordance that jumps to the letter: it flips a visible preview pane to the Cover
  letter tab, else opens the Cover letter form pane.
- `CoverLetterForm` inputs are plain per-job fields (no master/override split: letters
  are per-job by nature, unlike resume items).

## 5. Preview + templates (approved)

- `LetterPreview.vue` mirrors `ResumePreview.vue` chrome: Style popover
  (letterTemplate / letterAccent / letterFont / letterDensity), zoom/pan viewport,
  `#print-area` page wrapper, `--sp` density variable.
- Three letter templates in `src/components/templates/letters/`:
  `ModernLetterTemplate.vue`, `ClassicLetterTemplate.vue`, `MinimalLetterTemplate.vue`
  — same props `({ letter, contact, credentialDefault?, accent, font, density })`,
  same `fontStack()` + `.md` markdown styling as resume templates.
- Contact line joins present values with `|` (email | website | phone | location),
  matching the approved template's pipe separators.
- Empty blocks collapse: no recipient block when both fields empty; no Re line when
  `showReLine` is false or `jobTitle` empty; `(Posting n)` segment only when set.

## 6. Export, status, agent (approved, revised per review)

- Export PDF is decided by which documents are on screen. Visible set: a pane on the
  `preview` view counts its active tab (Resume or Cover letter). The form-only Cover
  letter pane does not count — only a reviewed preview does.
  - Both visible → Export opens a chooser dialog (`FwbModal`: "Export which
    document?" with `[Resume]` / `[Cover letter]`). No "Both" in v1 (combined PDF
    stays a non-goal).
  - Exactly one visible → export it directly (it is the reviewed doc, no dialog).
  - None visible → no print; show a message telling the user to switch a pane to
    the document they want to export and review it before exporting.
- The print stylesheet + Electron `printToPDF` render only the chosen document's
  page. Filenames: resume keeps the current `<name>.pdf`; letter uses
  `<name>-cover-letter.pdf`; `document.title` follows the chosen doc.
- `JobList.statusOf` keeps its current logic, reading `job.letter.body` instead of
  `job.coverLetter` (`Tailored + cover letter` / `Draft in progress` / `Not tailored yet`).
- Agent tools: `update_cover_letter` writes `letter.body` (unchanged UX, new target);
  new `update_letter_field` writes the structured fields
  (recipientTitle, recipientAddress, jobTitle, postingNumber, showReLine, signoff,
  dateMode, dateCustom, credentialLine). `read_resume` context gains a compact letter
  snapshot so the agent stops drafting from stale text.
- `cloneJob` deep-copies `letter` + letter style (already covered by JSON copy) with
  fresh conversations; `removeJob` confirm copy already mentions the letter — keep.

## 7. Migration + normalization

- `normalizeWorkspace` / `toJob`: build `letter` via a `normalizeLetter(raw)` helper
  (all fields strings with the defaults above; booleans/enums validated, fallback to
  safe defaults). Legacy `raw.coverLetter: string` → `letter.body` when no `raw.letter`.
- `letterTemplate`: valid `TEMPLATES` id else the job's resume template; `letterAccent`:
  non-empty string else the job's accent; `letterFont`: valid `FONT_IDS` else null;
  `letterDensity`: `normalizeDensity()`.
- `blankJob` seeds `letter` with the defaults (jobTitle from `jobTitleTarget`,
  credentialLine from `master.education[0]` (first = most recent), editable per job) and letter style mirroring the passed resume style opts.
- Export/import (zip + JSON) carries the letter automatically as part of the workspace.

## 8. Non-goals (v1)

No letter columns/sections engine, no greeting field, no combined resume+letter PDF,
no per-recipient letter variants inside one job (duplicate the job instead), no
separate letter undo history, no envelope/window formatting.

## 10. Master is canonical (revised per review)

Master holds the shared content only: no JD (`jobDescription`/`jdSource` blocked in
`attachJdPdf` and stripped in `toJob`, JDViewer shows a notice), no tailored headline
or summary (`title`/`summary` stripped in `toJob`, Tailoring card shows a note).
The agent tailors Master FOR jobs, never ON it, with one exception: `propose_bullet_rewrite`
is allowed on Master and refines the shared wording. The other five tailoring writes
(`update_title`, `update_summary`, `update_cover_letter`,
`update_letter_field`, `set_visibility`) refuse on Master with guidance; reads and
coaching stay available, `buildJobContext` carries a Master scope line, and AgentPanel
shows a Master banner. The locked system prompt teaches the Master-vs-job model
(views, copy-on-write overrides, structured letter) and the per-tool behavior. The sample workspace demonstrates the split: a bare
Master plus one sample job carrying the tailored title/summary, active on load.

## 9. Testing

- `workspace.migrate.test.ts`-style cases: legacy `coverLetter` string → `letter.body`;
  missing/invalid letter fields → defaults; style fallback to resume style.
- `blankJob`/`cloneJob`: credential default from education; clone independence.
- Re-line composer: title only, title + posting, hidden flag.
- Manual: resume preview + letter pane side-by-side; style each independently;
  export chooser with both visible, direct export with one visible, guided message
  with none visible; agent draft lands in body with review affordance;
  import/export round-trip.
