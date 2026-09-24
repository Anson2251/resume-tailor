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

| Slot | Source |
|---|---|
| name / email / website / tele / region | live from `master.contact` (fullName, email, website, phone, location). Never duplicated per job |
| date | `letter.dateMode: 'auto'` (today, locale date) or `'custom'` + `letter.dateCustom` |
| hiring division | `letter.recipientTitle` |
| address | `letter.recipientAddress` (multiline plain text) |
| job title | `letter.jobTitle`, defaults from `job.jobTitleTarget` at job creation, editable per letter |
| post number | `letter.postingNumber` (empty = omitted, parens dropped) |
| Re line | auto-composed `Re: <jobTitle> (Posting <n>)`; `letter.showReLine` toggles it |
| letter body | `letter.body` (markdown, rendered with the same `MarkdownText` pipeline as resume) |
| Sincerely, | `letter.signoff`, default `"Sincerely,"` |
| signature name | live from `master.contact.fullName` |
| credential line | `letter.credentialLine`, default auto-built from latest `master.education` entry (`degree + school`, e.g. `B.S. Candidate | State University`), editable per job |

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
  letter: CoverLetter            // NEW (replaces coverLetter)
  letterTemplate: string         // NEW — TEMPLATES id, default mirrors resume template at creation
  letterAccent: string           // NEW — default mirrors resume accent at creation
  letterFont: string | null      // NEW — null = template default (same convention as resume font)
  letterDensity: number          // NEW — same normalizeDensity() range as resume
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

## 4. Panes + editing UX (approved)

- `PaneView` gains `'letter'` (`form | preview | agent | jdpdf | letter`); `resolvePaneViews`
  treats it like preview/agent (allowed in both panes simultaneously, unlike `form`).
- The `letter` pane is self-contained: `CoverLetterForm.vue` (structured fields:
  Recipient, Subject/Re line, Body, Sign-off/Date) stacked above `LetterPreview.vue`
  (A4 page). This satisfies the approved "new pane type" choice: resume preview left +
  letter right is a first-class layout.
- `FormNav` unchanged in v1 (resume anchors only).
- `AgentPanel` keeps its `Chat | Cover letter` tabs; the letter tab rebinds from
  `job.coverLetter` to `job.letter.body` (same textarea UX, same placeholder). The
  structured fields live only in the letter pane — the agent tab is a quick body editor.
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
- Contact line joins present values with ` | ` (email | website | phone | location),
  matching the approved template's pipe separators.
- Empty blocks collapse: no recipient block when both fields empty; no Re line when
  `showReLine` is false or `jobTitle` empty; `(Posting n)` segment only when set.

## 6. Export, status, agent (approved)

- Export PDF exports the focused document: the print stylesheet + Electron
  `printToPDF` switch from "always the resume page" to "whichever doc pane
  (resume preview or letter preview) was last focused". Implementation: a focused-doc
  tracker (focusin on pane containers) + `document.title` from the right doc name.
  No separate buttons and no combined PDF in v1 (per "export active doc" answer).
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

## 9. Testing

- `workspace.migrate.test.ts`-style cases: legacy `coverLetter` string → `letter.body`;
  missing/invalid letter fields → defaults; style fallback to resume style.
- `blankJob`/`cloneJob`: credential default from education; clone independence.
- Re-line composer: title only, title + posting, hidden flag.
- Manual: resume preview + letter pane side-by-side; style each independently;
  export each; agent draft lands in body; import/export round-trip.
