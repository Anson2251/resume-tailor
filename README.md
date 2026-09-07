# Resume Tailor

A simple resume-tailoring tool built with Vue 3 + Tailwind CSS v4 + Vite.

- **Form mirrors the resume**: contact info, experience, education, and skills sections.
- **Repeatable fields are editable lists**: each experience / education / skill-group entry is a card with add, remove, and reorder (↑/↓) controls.
- **Live preview** with 3 templates: Modern, Classic, Minimal — plus an accent-color picker.
- **Export PDF** button — opens the print dialog; choose “Save as PDF” with margins set to None for an edge-to-edge A4 file with selectable vector text.
- Draft **auto-saves to localStorage**; Load sample / Clear helpers in the top bar.
- **Import / Export** buttons — move your resume between browsers as a minified JSON file (same shape as the auto-save: `{ resume, template, accent }`). Import validates the file and asks before replacing your current content.

## Run it

```sh
pnpm install
pnpm dev      # dev server
pnpm build    # production build → dist/
pnpm preview  # preview the build
```

## Project layout

```
index.html
src/
  main.js                 # app entry
  style.css               # tailwind + shared form classes + print CSS
  App.vue                 # top bar (template switcher, accent, export) + form/preview layout
  data/resume.js          # resume shape, blank/sample factories, parsing helpers
  components/
    ResumeForm.vue        # the editing form (lists with add/remove/reorder)
    ResumePreview.vue     # A4 page wrapper, picks the active template
    templates/
      ModernTemplate.vue  # accent header + skills sidebar
      ClassicTemplate.vue # centered serif, single column
      MinimalTemplate.vue # airy, hairline dividers
```

## Notes

- Multi-line textareas (achievements) treat **one line = one bullet**; skill inputs are **comma-separated**.
- PDF export is print-based: no extra dependencies, crisp vector text, and the `@page` rule targets A4 with zero margins. The print stylesheet flattens the app chrome so only the 210mm resume page lands on the sheet.
- Custom layouts are intentionally out of scope for now — to add one, create a new component in `src/components/templates/` and register it in `ResumePreview.vue` + the `TEMPLATES` list in `App.vue`.
