#!/usr/bin/env python3
"""
Build one fillable (AcroForm) PDF per nursing competency for
Al Hadeethah General Hospital, Nursing Service Department.

Source: scanned competency booklets (Emergency/Specific, General, Mandatory),
transcribed to JSON in data/.  Each generated PDF reproduces the original form
layout and adds interactive fields so a nurse can type their name and job
number (and the evaluator can tick M / NM / NA and fill in scores and comments)
without printing.
"""

import glob
import json
import os
import re
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
BRAND = os.path.join(HERE, "brand")

PW, PH = A4
ML, MR = 36, 36
TW = PW - ML - MR                      # table width
TOP = PH - 30                          # top of header art
BOTTOM = 66                            # nothing below this

C_NUM = 24
C_ASSESS = 36                          # each of M / NM / NA
C_TEXT = TW - C_NUM - 3 * C_ASSESS

FONT = "Helvetica"
BOLD = "Helvetica-Bold"

FS_ITEM = 8.5
LD_ITEM = 10.6
PAD = 3.2

FIELD_FILL = colors.Color(0.933, 0.953, 1.0)   # tint so fillable areas are visible
LINE = colors.black


# ----------------------------------------------------------------- text utils

def wrap(text, width, font=FONT, size=FS_ITEM):
    """Wrap text to `width`, honouring explicit newlines and leading indent."""
    lines = []
    for para in text.split("\n"):
        indent = len(para) - len(para.lstrip(" "))
        prefix = " " * indent
        words = para.strip().split()
        if not words:
            lines.append("")
            continue
        cur = prefix
        for w in words:
            trial = (cur + w) if cur in ("", prefix) else (cur + " " + w)
            if stringWidth(trial, font, size) <= width or cur.strip() == "":
                cur = trial
            else:
                lines.append(cur)
                cur = prefix + w
        lines.append(cur)
    return lines


def slug(s):
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-+", "-", s)


def fname(*parts):
    """A PDF field name: no dots (they build hierarchies), unique per doc."""
    return "_".join(re.sub(r"[^A-Za-z0-9]+", "", str(p)) for p in parts)


# --------------------------------------------------------------- the renderer

class Form:
    def __init__(self, path, comp):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.comp = comp
        self.title = comp["title"]
        self.kind = comp["kind"]
        self.c.setTitle(f"{self.title} — {self.kind}")
        self.c.setAuthor("Al Hadeethah General Hospital — Nursing Service Department")
        self.c.setSubject("Nursing competency assessment form (fillable)")
        self.page = 0
        self.form = self.c.acroForm
        self._start_page()

    # -- chrome ------------------------------------------------------------
    def _start_page(self):
        self.page += 1
        c = self.c
        c.setFillColor(colors.black)
        c.setFont(FONT, 10.5)
        c.drawString(ML, TOP - 12, "Alhadithah General Hospital")
        c.drawString(ML, TOP - 24, "Nursing Service Department")
        c.drawString(ML, TOP - 36, self.kind)

        hdr = os.path.join(BRAND, "header.png")
        if os.path.exists(hdr):
            w = 152.0
            h = w * 249.0 / 660.0
            c.drawImage(hdr, PW - MR - w, TOP - h - 2, w, h,
                        mask="auto", preserveAspectRatio=True)

        ftr = os.path.join(BRAND, "footer.png")
        if os.path.exists(ftr):
            w = 112.0
            h = w * 103.0 / 480.0
            c.drawImage(ftr, PW - MR - w, 30, w, h,
                        mask="auto", preserveAspectRatio=True)

        c.setFont(FONT, 6.6)
        c.setFillColor(colors.Color(0.45, 0.45, 0.45))
        c.drawString(ML, 34, f"{self.title}  ·  page {self.page}")
        c.setFillColor(colors.black)

        self.y = TOP - 52

    def _newpage(self, repeat_assess_header=True):
        self.c.showPage()
        self._start_page()
        if repeat_assess_header:
            self._assess_subheader()

    def _need(self, h):
        if self.y - h < BOTTOM:
            self._newpage()

    # -- primitives --------------------------------------------------------
    def rect(self, x, y, w, h, lw=0.7):
        self.c.setLineWidth(lw)
        self.c.setStrokeColor(LINE)
        self.c.rect(x, y, w, h, stroke=1, fill=0)

    def text(self, x, y, s, font=FONT, size=FS_ITEM, color=colors.black):
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        self.c.drawString(x, y, s)
        self.c.setFillColor(colors.black)

    def centre(self, xc, y, s, font=BOLD, size=11):
        self.c.setFont(font, size)
        self.c.drawCentredString(xc, y, s)

    def tfield(self, name, x, y, w, h, size=9, multiline=False):
        self.form.textfield(
            name=name, tooltip=name, x=x, y=y, width=w, height=h,
            fontName=FONT, fontSize=size, borderWidth=0,
            fillColor=FIELD_FILL, textColor=colors.black,
            borderStyle="solid", forceBorder=False,
            fieldFlags="multiline" if multiline else "",
        )

    def cbox(self, name, x, y, size=10):
        self.form.checkbox(
            name=name, tooltip=name, x=x, y=y, size=size,
            buttonStyle="check", borderWidth=0,
            fillColor=FIELD_FILL, textColor=colors.black,
            checked=False, forceBorder=False,
        )

    # -- blocks ------------------------------------------------------------
    def info_table(self):
        """Name / Job Number / Rating / Unit / Job Title / Contract Date."""
        cA = TW * 0.315
        cB = TW * 0.415
        cC = TW - cA - cB
        rh = 17.0
        y = self.y

        # three stacked rows on the left, Rating spanning them on the right
        for i in range(3):
            self.rect(ML, y - rh * (i + 1), cA, rh)
        self.rect(ML + cA, y - rh, cB, rh)          # Job Number
        self.rect(ML + cA, y - rh * 2, cB, rh)      # Job Title
        self.rect(ML + cA, y - rh * 3, cB, rh)      # (blank, as in the original)
        self.rect(ML + cA + cB, y - rh * 3, cC, rh * 3)   # Rating

        labels = [("Name:", 0), ("Unit:", 1), ("Contract Date:", 2)]
        for lab, i in labels:
            self.text(ML + 4, y - rh * (i + 1) + 5.2, lab, BOLD, 9)
        self.text(ML + cA + 4, y - rh + 5.2, "Job Number:", BOLD, 9)
        self.text(ML + cA + 4, y - rh * 2 + 5.2, "Job Title:", BOLD, 9)
        self.text(ML + cA + cB + 4, y - rh + 5.2, "Rating:", BOLD, 9)

        lw = stringWidth("Contract Date:", BOLD, 9) + 8
        self.tfield("staff_name", ML + stringWidth("Name:", BOLD, 9) + 8,
                    y - rh + 3, cA - stringWidth("Name:", BOLD, 9) - 12, 12)
        self.tfield("unit", ML + stringWidth("Unit:", BOLD, 9) + 8,
                    y - rh * 2 + 3, cA - stringWidth("Unit:", BOLD, 9) - 12, 12)
        self.tfield("contract_date", ML + lw, y - rh * 3 + 3, cA - lw - 4, 12)
        jw = stringWidth("Job Number:", BOLD, 9) + 8
        self.tfield("job_number", ML + cA + jw, y - rh + 3, cB - jw - 4, 12)
        jt = stringWidth("Job Title:", BOLD, 9) + 8
        self.tfield("job_title", ML + cA + jt, y - rh * 2 + 3, cB - jt - 4, 12)
        self.tfield("rating", ML + cA + cB + 6, y - rh * 2.35, cC - 12, 13)
        # the rating underline from the original
        self.c.setLineWidth(0.7)
        self.c.line(ML + cA + cB + 6, y - rh * 2.45, ML + cA + cB + cC - 6, y - rh * 2.45)

        y -= rh * 3

        # evaluation key / method of evaluation
        kh = 21.0
        self.rect(ML, y - kh, cA, kh)
        self.rect(ML + cA, y - kh, cB + cC, kh)
        self.text(ML + 4, y - 9.5, "Evaluation Key:", BOLD, 8.6)
        self.c.setFont(BOLD, 7.2)
        self.c.drawString(ML + 4, y - 18, "M- Met")
        self.c.setFont(FONT, 7.2)
        w0 = stringWidth("M- Met  ", BOLD, 7.2)
        self.c.setFont(BOLD, 7.2)
        self.c.drawString(ML + 4 + w0, y - 18, "NM- Not Met")
        w1 = w0 + stringWidth("NM- Not Met  ", BOLD, 7.2)
        self.c.drawString(ML + 4 + w1, y - 18, "NA- Not Applicable")

        self.text(ML + cA + 4, y - 9.5, "Method of Evaluation:", BOLD, 8.6)
        x = ML + cA + 4
        for lab, val in (("Knowledge:", " Exam(Written/Oral)   "),
                         ("Skills:", " Demonstration/Discussion   "),
                         ("Attitude:", " Observation")):
            self.c.setFont(BOLD, 7.2)
            self.c.drawString(x, y - 18, lab)
            x += stringWidth(lab, BOLD, 7.2)
            self.c.setFont(FONT, 7.2)
            self.c.drawString(x, y - 18, val)
            x += stringWidth(val, FONT, 7.2)
        y -= kh

        # rating scale strip
        sh = 12.0
        self.rect(ML, y - sh, TW, sh)
        x = ML + 4
        segs = [("Rating Scale:", BOLD), ("  Met: 90% - 100%", BOLD),
                ("    Not Met: 89% & below and remedial once", BOLD),
                ("  NA-( Not applicable)", BOLD),
                (" – entries to be deducted from the total score", FONT)]
        for s, f in segs:
            self.c.setFont(f, 7.0)
            self.c.drawString(x, y - 8.4, s)
            x += stringWidth(s, f, 7.0)
        y -= sh
        self.y = y

    def _assess_subheader(self):
        """COMPETENCIES / EVALUATOR ASSESSMENT column headings."""
        y = self.y
        h1, h2 = 15.0, 15.0
        left = C_NUM + C_TEXT
        self.rect(ML, y - h1 - h2, left, h1 + h2)
        self.centre(ML + left / 2, y - h1 - h2 / 2 - 1, "COMPETENCIES", BOLD, 11.5)
        self.rect(ML + left, y - h1, 3 * C_ASSESS, h1)
        self.c.setFont(BOLD, 7.4)
        self.c.drawCentredString(ML + left + 1.5 * C_ASSESS, y - 10.4,
                                 "EVALUATOR ASSESSMENT")
        for i, lab in enumerate(("M", "NM", "NA")):
            x = ML + left + i * C_ASSESS
            self.rect(x, y - h1 - h2, C_ASSESS, h2)
            self.c.setFont(BOLD, 8.2)
            self.c.drawCentredString(x + C_ASSESS / 2, y - h1 - 6.5, lab)
            sub = {"M": "(1)", "NM": "(0)", "NA": ""}[lab]
            if sub:
                self.c.setFont(BOLD, 7.4)
                self.c.drawCentredString(x + C_ASSESS / 2, y - h1 - 13.4, sub)
        self.y = y - h1 - h2

    def section_row(self, roman, label):
        h = 16.0
        self._need(h)
        y = self.y
        self.rect(ML, y - h, C_NUM, h)
        self.rect(ML + C_NUM, y - h, C_TEXT, h)
        for i in range(3):
            self.rect(ML + C_NUM + C_TEXT + i * C_ASSESS, y - h, C_ASSESS, h)
        self.text(ML + 3, y - 10.5, roman, FONT, 7.2)
        self.centre(ML + C_NUM + C_TEXT / 2, y - 11.5, label, BOLD, 11)
        self.y = y - h

    def item_row(self, num, text, key):
        lines = wrap(text, C_TEXT - 2 * PAD - 3)
        h = max(14.0, len(lines) * LD_ITEM + 2 * PAD)
        if self.y - h < BOTTOM:
            self._newpage()
        y = self.y
        self.rect(ML, y - h, C_NUM, h)
        self.rect(ML + C_NUM, y - h, C_TEXT, h)
        self.text(ML + 3, y - PAD - 7.5, f"{num}.", FONT, 7.4)
        ty = y - PAD - 7.5
        for ln in lines:
            self.text(ML + C_NUM + PAD, ty, ln)
            ty -= LD_ITEM
        for i, code in enumerate(("m", "nm", "na")):
            x = ML + C_NUM + C_TEXT + i * C_ASSESS
            self.rect(x, y - h, C_ASSESS, h)
            self.cbox(fname(key, num, code), x + (C_ASSESS - 10) / 2, y - h / 2 - 5)
        self.y = y - h

    def raw_score_row(self):
        h = 20.0
        self._need(h)
        y = self.y
        self.c.setLineWidth(1.1)
        self.rect(ML, y - h, C_NUM, h, lw=1.1)
        self.rect(ML + C_NUM, y - h, C_TEXT, h, lw=1.1)
        self.text(ML + C_NUM + PAD, y - 13, "Raw Score", BOLD, 9)
        for i, code in enumerate(("m", "nm", "na")):
            x = ML + C_NUM + C_TEXT + i * C_ASSESS
            self.rect(x, y - h, C_ASSESS, h, lw=1.1)
            self.tfield(fname("raw_score", code), x + 3, y - h + 4, C_ASSESS - 6, 12)
        self.y = y - h

    def footer_blocks(self):
        need = 156.0
        if self.y - need < BOTTOM:
            self._newpage(repeat_assess_header=False)
        y = self.y - 10
        gap = 12.0
        w = (TW - gap) / 2

        # formula + needs remedial
        fh = 30.0
        self.rect(ML, y - fh, w, fh)
        self.text(ML + 6, y - 12, "Formula:", BOLD, 8.6)
        x = ML + 6 + stringWidth("Formula: ", BOLD, 8.6)
        self.text(x, y - 11, "Raw Score", BOLD, 8)
        rsw = stringWidth("Raw Score", BOLD, 8)
        self.c.setLineWidth(0.7)
        self.c.line(x, y - 13.6, x + rsw, y - 13.6)
        self.text(x, y - 22, "Total Score", BOLD, 8)
        self.text(x + rsw + 1, y - 11, "× 100%  = ", BOLD, 8)
        xr = x + rsw + 1 + stringWidth("× 100%  = ", BOLD, 8)
        self.tfield("percent_rating", xr, y - 15, 38, 12)
        self.text(xr + 42, y - 11, "% Rating", BOLD, 8)

        self.rect(ML + w + gap, y - fh, w, fh)
        self.text(ML + w + gap + 6, y - 12, "NEEDS REMEDIAL:", BOLD, 8.4)
        bx = ML + w + gap + 6 + stringWidth("NEEDS REMEDIAL:  ", BOLD, 8.4)
        self.cbox("needs_remedial_yes", bx, y - 16, 11)
        self.text(bx + 14, y - 12, "YES", BOLD, 8.4)
        bx2 = bx + 14 + stringWidth("YES   ", BOLD, 8.4)
        self.cbox("needs_remedial_no", bx2, y - 16, 11)
        self.text(bx2 + 14, y - 12, "NO", BOLD, 8.4)
        self.text(ML + w + gap + 6, y - 24, "REMEDIAL DATE:", BOLD, 8.4)
        dx = ML + w + gap + 6 + stringWidth("REMEDIAL DATE:  ", BOLD, 8.4)
        self.tfield("remedial_date", dx, y - 27, w - (dx - (ML + w + gap)) - 8, 11)

        y -= fh + 6

        # comments
        ch = 98.0
        self.c.setLineWidth(0.7)
        self.rect(ML, y - ch, w, ch)
        self.text(ML + 6, y - 12, "Evaluators Comments/Recommendations:", BOLD, 8.4)
        for i in range(3):
            self.tfield(f"evaluator_comment_{i+1}", ML + 8, y - 28 - i * 13, w - 20, 11)
        self.text(ML + 6, y - 70, "Evaluated By:", BOLD, 9)
        self.tfield("evaluated_by", ML + 8, y - 84, w * 0.72, 12)
        self.c.setLineWidth(0.7)
        self.c.line(ML + 8, y - 85.5, ML + 8 + w * 0.72, y - 85.5)
        self.text(ML + 6, y - ch + 4, "Evaluator's Name/Signature/Job Number", BOLD, 7.8)

        self.rect(ML + w + gap, y - ch, w, ch)
        bx = ML + w + gap
        self.text(bx + 6, y - 12, "Staff Nurse Comments:", BOLD, 8.4)
        for i in range(3):
            self.tfield(f"staff_comment_{i+1}", bx + 8, y - 28 - i * 13, w - 20, 11)
        self.text(bx + 6, y - 70, "Conformed By:", BOLD, 9)
        self.tfield("staff_signature", bx + 8, y - 84, w * 0.55, 12)
        self.c.line(bx + 8, y - 85.5, bx + 8 + w * 0.55, y - 85.5)
        self.tfield("staff_sign_date", bx + w * 0.62, y - 84, w * 0.3, 12)
        self.c.line(bx + w * 0.62, y - 85.5, bx + w * 0.62 + w * 0.3, y - 85.5)
        self.text(bx + 6, y - ch + 4, "Staff Name/Signature", BOLD, 7.8)
        self.text(bx + w - stringWidth("Date", BOLD, 7.8) - 10, y - ch + 4, "Date", BOLD, 7.8)

        self.y = y - ch

    def title_line(self):
        y = self.y
        self.centre(PW / 2, y - 12, self.title, BOLD, 12.5)
        tw = stringWidth(self.title, BOLD, 12.5)
        self.c.setLineWidth(0.8)
        self.c.line(PW / 2 - tw / 2, y - 15, PW / 2 + tw / 2, y - 15)
        self.y = y - 26

    def note_line(self, note):
        lines = wrap(note, TW - 8, FONT, 7.4)
        h = len(lines) * 9.2 + 6
        y = self.y
        self.c.setFillColor(colors.Color(0.96, 0.96, 0.93))
        self.c.setStrokeColor(colors.Color(0.75, 0.72, 0.55))
        self.c.setLineWidth(0.6)
        self.c.rect(ML, y - h, TW, h, stroke=1, fill=1)
        self.c.setFillColor(colors.Color(0.35, 0.32, 0.18))
        ty = y - 11
        for ln in lines:
            self.c.setFont(FONT, 7.4)
            self.c.drawString(ML + 5, ty, ln)
            ty -= 9.2
        self.c.setFillColor(colors.black)
        self.c.setStrokeColor(LINE)
        self.y = y - h - 6

    def save(self):
        self.c.save()


# ------------------------------------------------------------ equipment sheet

def build_equipment(comp, path):
    f = Form(path, comp)
    f.title_line()
    f.info_table()
    f.y -= 4

    # legend
    for code, desc in comp["legend"]:
        lines = wrap(desc, TW - 60, FONT, 7.6)
        h = max(13.0, len(lines) * 9.4 + 5)
        y = f.y
        f.rect(ML, y - h, 40, h)
        f.rect(ML + 40, y - h, TW - 40, h)
        f.text(ML + 5, y - 10, code, BOLD, 8.2)
        ty = y - 10
        for ln in lines:
            f.text(ML + 44, ty, ln, FONT, 7.6)
            ty -= 9.4
        f.y = y - h
    f.y -= 10

    # equipment table
    cw = TW - 3 * C_ASSESS - 20
    hh = 15.0
    y = f.y
    f.rect(ML, y - hh, 20 + cw, hh)
    f.centre(ML + (20 + cw) / 2, y - 11, "EQUIPMENT", BOLD, 10)
    for i, lab in enumerate(("VT", "RD", "UEC")):
        x = ML + 20 + cw + i * C_ASSESS
        f.rect(x, y - hh, C_ASSESS, hh)
        f.c.setFont(BOLD, 8.2)
        f.c.drawCentredString(x + C_ASSESS / 2, y - 10.5, lab)
    f.y = y - hh

    for i, item in enumerate(comp["equipment"], 1):
        h = 16.0
        if f.y - h < BOTTOM:
            f._newpage(repeat_assess_header=False)
        y = f.y
        f.rect(ML, y - h, 20, h)
        f.rect(ML + 20, y - h, cw, h)
        f.text(ML + 3, y - 11, str(i), FONT, 7.4)
        f.text(ML + 24, y - 11, item, FONT, 9)
        for j, code in enumerate(("vt", "rd", "uec")):
            x = ML + 20 + cw + j * C_ASSESS
            f.rect(x, y - h, C_ASSESS, h)
            f.cbox(fname("eq", i, code), x + (C_ASSESS - 10) / 2, y - h / 2 - 5)
        f.y = y - h

    f.footer_blocks()
    f.save()


# ------------------------------------------------------------- standard sheet

def build_standard(comp, path):
    f = Form(path, comp)
    f.title_line()
    f.info_table()
    if comp.get("note"):
        f.y -= 6
        f.note_line("Note: " + comp["note"])
    f._assess_subheader()

    for roman, label, key in (("I.", "KNOWLEDGE", "knowledge"),
                              ("II.", "SKILLS", "skills"),
                              ("III.", "ATTITUDE", "attitude")):
        items = comp.get(key) or []
        if not items:
            continue
        f.section_row(roman, label)
        for n, item in enumerate(items, 1):
            f.item_row(n, item, key)

    f.raw_score_row()
    f.footer_blocks()
    f.save()


# ------------------------------------------------------------------- driver

def add_zapf_to_dr(path):
    """reportlab only lists /Helv in the AcroForm resources; a viewer that
    rebuilds checkbox appearances needs /ZaDb there too."""
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import DictionaryObject, NameObject

    r = PdfReader(path)
    acro = r.trailer["/Root"].get("/AcroForm")
    if acro is None:
        return
    dr = acro.get("/DR")
    if dr is None:
        return
    fonts = dr.get("/Font")
    if fonts is None or "/ZaDb" in fonts:
        return
    w = PdfWriter(clone_from=r)
    fonts = w._root_object["/AcroForm"]["/DR"]["/Font"]
    zadb = DictionaryObject()
    zadb[NameObject("/Type")] = NameObject("/Font")
    zadb[NameObject("/Subtype")] = NameObject("/Type1")
    zadb[NameObject("/BaseFont")] = NameObject("/ZapfDingbats")
    fonts[NameObject("/ZaDb")] = w._add_object(zadb)
    with open(path, "wb") as fh:
        w.write(fh)


SET_DIR = {
    "EMERGENCY DEPARTMENT": "01-emergency-department-specific",
    "GENERAL": "02-general",
    "MANDATORY": "03-mandatory",
}


def main():
    out_root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out")
    comps = []
    for jf in sorted(glob.glob(os.path.join(DATA, "*.json"))):
        comps.extend(json.load(open(jf, encoding="utf-8")))

    seen, built = {}, []
    for comp in comps:
        d = os.path.join(out_root, SET_DIR[comp["set"]])
        os.makedirs(d, exist_ok=True)
        base = slug(comp["title"])
        n = seen.get((d, base), 0) + 1
        seen[(d, base)] = n
        if n > 1:
            base = f"{base}-{n}"
        path = os.path.join(d, base + ".pdf")
        if comp.get("layout") == "equipment":
            build_equipment(comp, path)
        else:
            build_standard(comp, path)
        add_zapf_to_dr(path)
        built.append((comp["set"], comp["title"], path))

    print(f"built {len(built)} fillable PDFs under {out_root}")
    return built


if __name__ == "__main__":
    main()
