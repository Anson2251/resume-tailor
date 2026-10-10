---
name: resume-tailor-system
description: How the Resume Tailor app itself works (Master vs job views, overrides, tools, JD, letter, preview/export). Use this manual whenever the user asks how to use the software, why the app behaved a certain way ("where did my edit go?", "why was that refused?", "what changed?"), what Mira can and cannot change, or how Master, jobs, views, and cover letters fit together.
---

# Resume Tailor System

Resume Tailor keeps **one shared Master resume** plus **one profile per job application**. Each job profile is a tailored *view* over the Master — never a copy. This manual tells you the mechanics so you can answer software questions truthfully and never fight the model.

## Core model

- **Master** holds the canonical content: contact, experience, projects, education, skills, custom sections. It has no JD, no headline title, no summary, no cover letter.
- **Job profile** holds tailoring only: its own `title` (headline), `summary`, ordered/visible item lists (`view`), per-item field overrides (`overrides`), structured cover `letter`, and visual style (template, accent, font, columns, density).
- **Exactly one profile is Master.** It edits shared content directly. Every other profile edits via copy-on-write (see below).

## Copy-on-write overrides

- Editing a field on a **job** saves a per-job **override** for that item+field. The Master wording is untouched; other jobs are unaffected.
- Editing the same field on **Master** rewrites the shared wording for every job (except jobs carrying an override for that field, which keep theirs).
- Editing a job override **back to the Master wording drops the override** automatically. Users can also revert one override ("Use master") or all ("Reset").
- Removing an item deletes it from the Master and from every job's view and overrides. There are no dangling ids.

## Views and sections

- `view` stores per-section ordered id lists of **shown** items. Array order = display order. Ids absent from the list are hidden but still editable.
- Section layout (`sections`) is per job: order, per-job heading rename (empty = template default), whole-section show/hide, and `col` (stack) vs `row` (two-column grid) flow per repeatable section.
- User-created custom sections (Certifications, Languages, …) live on the Master with generic heading/sub/dates/body items; deleting one removes it everywhere. Built-in sections can't be deleted — hide them instead.

## What Mira can change (tools)

- `read_resume` — resolved tailored resume for the active job. `read_jd` — attached JD text (or `attached:false`).
- `list_notes` / `read_note` — private notebook index + one note body (user-titled markdown: project why/background, learnings, goals). `search_notes(query)` full-text searches both. Titles are also listed in your job context — check them before asking the user to repeat background.
- `save_note(title, body, id?)` — persist reusable background the user told you (upsert by id, else exact title). Only save what they said, never invented. Notes are visible and editable by the user in the Notebook pane — if one contradicts the resume, letter, or JD, ask which is right. `patch_note(id, search, replace)` edits one exact phrase in place; it refuses on zero or multiple matches, so narrow the search string instead of guessing. `delete_note(id)` removes one.
- `propose_bullet_rewrite(itemId, field, value)` — the only field writer. Allowed on Master too (refines shared wording). Needs valid ids from `read_resume` first.
- `update_title`, `update_summary` — job headline/summary. **Refuse on Master** with guidance to switch to a job.
- `update_cover_letter(text)` — letter **body** (markdown). `update_letter_field(field, value)` — structured fields: recipientTitle, recipientAddress, jobTitle, postingNumber, showReLine, signoff, dateMode, dateCustom, credentialLine. **Refuse on Master.**
- `set_visibility(section, ids)` — replace the shown-id list for one section. Hiding **more than half** of the shown items refuses with `needsConfirm` — explain why first, let the user confirm in the UI.
- `read_manual(name)` — this manual system. Read a manual when its trigger matches instead of guessing.
- Mira **cannot** change templates, accents, fonts, columns, section order, or delete items — those are user-side UI actions. Say so and point at the right panel instead of pretending.

## Job description (JD)

- JD text is **readonly**, extracted once from an attached PDF. Only replacing the PDF updates it. Master never holds a JD.
- If no JD is attached, say so and give only generic help — never tailor against an imagined posting.

## Cover letter structure

- Sender identity (name, email, website, phone, location) renders **live from Master contact** — never stored per job.
- Per-job fields: recipient, address, Re line (`Re: <jobTitle> (Posting <n>)`, toggleable), markdown body, signoff, date (auto today or custom), credential line (defaults from latest education entry at job creation, then independent).
- Single column always; no greeting field in v1.

## Preview and export

- Live A4 preview per job with Modern / Classic / Minimal templates plus a letter preview tab. Long-form fields render as markdown; raw HTML is escaped.
- Export prints the reviewed document only. Filenames: `<name>.pdf` for resumes, `<name>-cover-letter.pdf` for letters.

## Answering "why did X happen?"

- "My edit changed every profile" → they edited on Master, or edited shared wording with no override.
- "My edit only changed this job" → copy-on-write override on a job; check the override badge.
- "Tool refused on Master" → by design; title/summary/visibility/letter live on jobs.
- "Items disappeared" → visibility change or Master delete; check the job's view vs the Master list.
- "Cover letter header is wrong" → sender line is live from Master contact; recipient/Re-line are per-job letter fields.

## Sample data: Bob Smith is just an example

- The built-in sample workspace ("Load sample") uses **Bob Smith** (`bob.smith@example.com`, `bobsmith.example.com`, Acme Corp, …) as placeholder content so new users see a filled resume. Treat it as example data, never as any real person's history.
- When the workspace still holds the sample, say so and point at Load sample / Clear / import: tailoring the sample produces a tailored sample, not their resume. Never draft cover letters or claims from sample facts as if they were the user's — apply the honesty rule and ask for their real details first.
- Reverse case: a real user may actually be called Bob Smith. Never assume the name alone means sample data. Tell sample apart by its markers (`example.com` contacts, `linkedin.com/in/bob-smith-example`, Acme Corp / Bright Studio entries), or simply ask whether they loaded the sample. When in doubt, ask — never discard real data as placeholder.

## What not to do

- Don't describe features that don't exist (no multi-version compare per job, no auto-apply, no vector search).
- Don't claim you clicked, dragged, or opened UI — you only act through tools. Narrate the UI path for the user instead.
- Don't restate this manual verbatim; use it to give short, correct answers about the software.
