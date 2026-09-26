---
name: skill-brainstorm
description: Brainstorm resume content when the user has no ideas (thin resume, "what should I add?", blank or empty section, "I haven't done anything"). Use this manual to excavate real history with probing questions and map it to resume items. Never invent facts; only draft wording after the user supplies true details.
---

# Skill Brainstorm

Use this manual when the user is stuck at the blank page: thin resume, empty section, "what skills do I have?", "I've done nothing worth listing". Your job is to excavate real history, not to invent it.

## Core principles

1. **Excavate, don't invent.** Every line must trace to something the user actually did. A weak true line beats a strong invented one.
2. **Everything counts at first.** Coursework, class projects, part-time jobs, volunteering, clubs, freelance gigs, home labs, open-source lurking, caregiving logistics — all are raw material. Filtering comes later.
3. **Small and specific beats big and vague.** "Kept the café's weekend cash drawer balanced across 30+ shifts" beats "responsible and hardworking".
4. **You ask, they supply, then you draft.** Never write bullets, skills, or metrics before the user confirms the underlying facts.

## Workflow

### Step 1: Find the gap

- Call `read_resume` first. Name which section is thin and what the target JD (if attached) asks for that the resume doesn't show.
- If no JD is attached, say so and brainstorm transferable material generally — don't guess at a posting.

### Step 2: Excavate with probes

Ask 3–5 concrete questions, not "tell me more". Pick from the banks below based on the gap. Ask for numbers wherever natural (how many, how often, how long, who for).

**Experience / projects bank:**

- What have you built, fixed, organized, or run — at work, school, or home — that someone else relied on?
- Walk me through the most demanding week of the last year. What did you actually do each day?
- What tools did you touch (software, hardware, instruments, vehicles, tills, CMSs)? What did you do with each?
- Did anything break or go wrong that you helped resolve? What was your part?

**Skills bank:**

- What do people ask you for help with?
- What did your last course / job / volunteer role require you to learn in the first month?
- Which languages, frameworks, tools, or equipment can you use without supervision today?

**Education / extras bank:**

- Courses with a final artifact (paper, prototype, performance, portfolio piece)? Grades or feedback worth quoting?
- Talks, posters, competitions, certifications, workshops?
- Volunteering, clubs, societies, caregiving, community roles with a schedule you kept?

### Step 3: Map to resume items

For each confirmed fact, propose the smallest fitting home:

| Raw fact | Home |
|---|---|
| Sustained role with dates and duties | Experience entry |
| Built thing with a stack and outcome | Project entry |
| Course, degree, cert, workshop | Education or custom section |
| Tool / language / method usable solo | Skills group |
| One-off talk, award, language, clearance | Custom section (Awards, Languages, …) |

Tell the user the mapping explicitly ("this becomes a project entry; that becomes a skill line") and what is still missing (dates, metrics, employer names).

### Step 4: Draft only after confirmation

- Once the user confirms facts, draft concise markdown bullets via `propose_bullet_rewrite` (existing items) or tell them the exact fields to create in the form (new items — you cannot create entries, only rewrite fields).
- Mark anything unconfirmed as `[needs your input]` rather than smoothing over it.

## Output format

- Probing round: numbered questions, grouped by section gap.
- Mapping round: table of confirmed fact → resume home → missing fields.
- Draft round: bullets only, each traceable to a confirmed fact.

## What not to do

- Don't invent employers, dates, tools, metrics, or proficiency levels to fill a thin section.
- Don't keyword-stuff the JD into unconfirmed lines.
- Don't dump 20 generic questions — ask the few that target the actual gap.
- Don't lecture about this manual; just run the excavation.
