# Nursing competency forms — fillable PDFs

One fillable PDF per competency, ready to send to nurses. A nurse opens the file
in any PDF reader and types their **name** and **job number** directly into the
form — no printing, no scanning back.

48 forms, split by the booklet they came from:

| Folder | Set | Forms |
| --- | --- | --- |
| `01-emergency-department-specific/` | Emergency Department — Specific Competency | 21 |
| `02-general/` | General Competency | 17 |
| `03-mandatory/` | Mandatory Competency | 10 |

## What is fillable

Every form carries interactive AcroForm fields:

- **Header** — Name, Job Number, Unit, Job Title, Contract Date, Rating
- **Assessment** — an M / NM / NA checkbox on every knowledge, skill and attitude item
- **Raw Score** — one box per M / NM / NA column
- **Formula** — % Rating
- **Needs Remedial** — YES / NO checkboxes, plus Remedial Date
- **Comments** — three lines each for the evaluator and the staff nurse
- **Sign-off** — Evaluated By, Conformed By (staff name/signature), Date

Fillable areas carry a pale blue tint so they are easy to find on screen; the
tint is light enough to disappear on a printed page.

`02-general/equipment-checklist.pdf` uses the equipment layout from the original
(VT / RD / UEC columns against a list of 18 devices) rather than the
knowledge/skills/attitude table.

## Where the content came from

The four supplied PDFs were 300-dpi **scans with no text layer**, so every form
was transcribed from the page images and re-typeset. Content is reproduced as
printed, including the source's own spelling (e.g. "constrictive criticism",
"Conformed By"), so the forms still match the hospital's approved wording.

Three things in the source scans needed a judgement call. Each is flagged here,
and the two that affect a single form are also printed in a note box on that
form itself:

1. **`01-emergency-department-specific/pain-and-discomfort-patient-management-guidelines.pdf`**
   — the scan contains only the KNOWLEDGE section; the SKILLS and ATTITUDE pages
   are missing from the supplied file. The form is generated with Knowledge
   only. The complete version of this competency is in `02-general/`.
2. **`01-emergency-department-specific/ambulance-transport-variant-2.pdf`** — an
   orphan continuation page (Skills + Attitude only) whose wording differs
   slightly from the Ambulance Transport form on pages 1–2 (it adds "and/or
   Midwifery Kit"). Its Knowledge page is not in the supplied scan. **Confirm
   with the Nursing Service Department whether this is a genuine second form or
   a duplicate before issuing it.**
3. **Pain and Discomfort, Knowledge item 13** — the scan prints "for 224 hours".
   Transcribed as "24 hours" to match the identical wording in Skills item 9 of
   the same form.

Two forms number their items 1, 2, 3, 4, 6, 7, 8 in the original (no item 5):
Defibrillation/Cardioversion and Medication Calculation for Specific Pediatric
Emergency. No item text is missing — the printed numbering simply skips a value —
so the generated forms renumber sequentially.

The supplied `Images_PDF_007.pdf` is the **Job Description of Staff Nurse**, not
a competency, so no form was generated for it.

## Regenerating

Content lives in `source/data/*.json`, one entry per competency. Edit the JSON
and rebuild — the layout, pagination and form fields are all derived.

```bash
pip install reportlab pypdf pillow
cd docs/nursing-competencies
python3 source/build_forms.py .
```

`source/brand/` holds the hospital header and the Aljouf Health Cluster wordmark,
lifted from the scans and cleaned up.
