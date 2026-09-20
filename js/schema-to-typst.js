/**
 * B.A.T.S. Schema to Typst Translator
 * ==================================
 * Translates RenderCV JSON and standard B.A.T.S. Document schemas to Typst markup
 * for high-quality, ATS-compatible PDF generation in the browser.
 *
 * Theme-aware: accepts an optional themeConfig object { headingColor, font, isSerif }
 * to match the active paper sheet theme in the exported PDF.
 */

// Map paper-sheet font names to fonts actually bundled in the Typst WASM compiler.
// Liberation Sans is the only sans-serif bundled; Liberation Serif is the serif.
const TYPST_FONT_MAP = {
    'Source Sans 3':    'Liberation Sans',
    'Inter':            'Liberation Sans',
    'Outfit':           'Liberation Sans',
    'Merriweather':     'Liberation Serif',
    'Playfair Display': 'Liberation Serif',
    'Lora':             'Liberation Serif',
};

function resolveTypstFont(paperFont, isSerif) {
    if (TYPST_FONT_MAP[paperFont]) return TYPST_FONT_MAP[paperFont];
    return isSerif ? 'Liberation Serif' : 'Liberation Sans';
}

function escapeAndFormatTypst(val) {
    if (typeof val !== "string") {
        if (val === null || val === undefined) return "";
        return String(val);
    }
    
    // 1. Escape core triggers first (excluding * and _ to process formatting blocks)
    let res = val
        .replace(/\\/g, "\\\\")
        .replace(/@/g, "\\@")
        .replace(/#/g, "\\#")
        .replace(/</g, "\\<")
        .replace(/>/g, "\\>");
        
    // 2. Convert markdown bold **text** to Typst bold *text*
    res = res.replace(/\*\*(.*?)\*\*/g, (match, p1) => {
        return `*${p1}*`;
    });
    
    // 3. Convert markdown italic _text_ to Typst italic _text_
    res = res.replace(/_(.*?)_/g, (match, p1) => {
        return `_${p1}_`;
    });
    
    // 4. Escape remaining loose formatting markers to prevent compile warnings
    res = res.replace(/(?<!\\)\*/g, "\\*")
             .replace(/(?<!\\)_/g, "\\_");

    return res;
}

/**
 * @param {object} cvData - The parsed CV JSON (with top-level `cv` key)
 * @param {object} [themeConfig] - Optional theme: { headingColor, font, isSerif }
 */
export function translateCvToTypst(cvData, themeConfig) {
    const cv = cvData.cv || {};
    const hColor = (themeConfig && themeConfig.headingColor) || '#004f90';
    const fontName = resolveTypstFont(
        (themeConfig && themeConfig.font) || 'Source Sans 3',
        (themeConfig && themeConfig.isSerif) || false
    );
    let code = "";

    // ── Page Setup ─────────────────────────────────────────────────────
    code += `#set page(
  paper: "a4",
  margin: (x: 1.8cm, y: 2cm),
)\n`;
    
    // ── Typography Defaults ────────────────────────────────────────────
    code += `#set text(
  font: ("${fontName}", "Liberation Sans", "Arial", "Helvetica", "sans-serif"),
  size: 10pt,
  fill: rgb("#1e293b"),
)\n`;

    // ── Paragraph & List Global Defaults ───────────────────────────────
    code += `#set par(leading: 0.55em)\n`;
    code += `#set list(marker: [•], indent: 6pt, body-indent: 3pt, spacing: 4pt)\n`;

    // 1. Last Updated line (absolute top-right using #place to not shift name)
    code += `#place(top + right, dy: 10pt)[#text(size: 7.5pt, fill: rgb("#7f7f7f"), style: "italic")[Last updated in July 2026]]\n`;

    // 2. Name Header (centered, themed color)
    if (cv.name) {
        code += `#align(center)[\n  #text(size: 20pt, weight: "bold", fill: rgb("${hColor}"))[${escapeAndFormatTypst(cv.name)}]\n]\n#v(2pt)\n`;
    }

    // 3. Contact Details block (centered, split across rows to prevent wrapping)
    let contactRow1 = [];
    let contactRow2 = [];
    if (cv.location) contactRow1.push(escapeAndFormatTypst(cv.location));
    if (cv.email) contactRow1.push(escapeAndFormatTypst(cv.email));
    if (cv.phone) contactRow1.push(escapeAndFormatTypst(cv.phone));
    
    if (cv.social_networks) {
        cv.social_networks.forEach(net => {
            if (net.network.toLowerCase() === "linkedin") {
                contactRow2.push(`linkedin.com/in/${escapeAndFormatTypst(net.username)}`);
            } else {
                contactRow2.push(`${escapeAndFormatTypst(net.network)}: ${escapeAndFormatTypst(net.username)}`);
            }
        });
    }
    if (cv.website) {
        let cleanUrl = cv.website.replace(/^https?:\/\//, "");
        contactRow2.push(escapeAndFormatTypst(cleanUrl));
    }

    if (contactRow1.length > 0) {
        code += `#align(center)[#text(size: 9pt, fill: rgb("#64748b"))[${contactRow1.join("  |  ")}]]\n`;
    }
    if (contactRow2.length > 0) {
        code += `#align(center)[#text(size: 9pt, fill: rgb("#64748b"))[${contactRow2.join("  |  ")}]]\n`;
    }
    if (contactRow1.length > 0 || contactRow2.length > 0) {
        code += `#v(6pt)\n`;
    }

    // ── Render Sections ────────────────────────────────────────────────
    if (cv.sections) {
        const sectionOrder = cv.section_order || Object.keys(cv.sections);
        sectionOrder.forEach(sectionTitle => {
            const entries = cv.sections[sectionTitle];
            if (!entries) return;

            code += `\n// ── ${sectionTitle} ──\n`;
            
            // Section header with horizontal rule spanning to the right edge
            code += `#v(6pt)\n#grid(
  columns: (auto, 1fr),
  align: (left, horizon),
  gutter: 8pt,
  [#text(weight: "bold", size: 11pt, fill: rgb("${hColor}"))[${escapeAndFormatTypst(sectionTitle)}]],
  [#line(length: 100%, stroke: 1.5pt + rgb("${hColor}"))]
)\n#v(4pt)\n`;

            if (Array.isArray(entries)) {
                entries.forEach(entry => {
                    if (typeof entry === "string") {
                        // Paragraph / Text block (e.g. Summary) — explicit par break
                        code += `${escapeAndFormatTypst(entry)}\n\n#v(2pt)\n`;
                    } else if (typeof entry === "object") {
                        if (entry.label) {
                            // Label Section: Languages, Key Technologies, etc.
                            code += `- *${escapeAndFormatTypst(entry.label)}*: ${escapeAndFormatTypst(entry.details)}\n`;
                        } else if (entry.bullet) {
                            // Bullet Item Section: Professional Skills, Personal Skills, etc.
                            code += `- ${escapeAndFormatTypst(entry.bullet)}\n`;
                        } else {
                            // Experience or Education entry
                            const titleLeft = entry.company || entry.institution || entry.name || "";
                            const titleRight = (entry.start_date || entry.end_date) 
                                ? `${entry.start_date || ""} -- ${entry.end_date || ""}`
                                : "";
                            let subLeft = entry.position || "";
                            if (!subLeft) {
                                // Education: show "Degree in Area"
                                const degree = entry.studyType || entry.degree || "";
                                const area = entry.area || "";
                                if (degree && area) {
                                    subLeft = `${degree} in ${area}`;
                                } else {
                                    subLeft = degree || area || "";
                                }
                            }
                            const subRight = entry.location || "";

                            // Title line (Company / Dates)
                            if (titleLeft || titleRight) {
                                code += `#grid(
  columns: (1fr, auto),
  [*${escapeAndFormatTypst(titleLeft)}*], [#text(size: 10pt)[${escapeAndFormatTypst(titleRight)}]],
)\n`;
                            }

                            // Subtitle line (Position / Location)
                            if (subLeft || subRight) {
                                code += `#v(-2pt)\n#grid(
  columns: (1fr, auto),
  [_${escapeAndFormatTypst(subLeft)}_], [#text(fill: rgb("#64748b"))[${escapeAndFormatTypst(subRight)}]],
)\n`;
                            }

                            // Highlights/Bullets
                            if (entry.highlights && Array.isArray(entry.highlights)) {
                                code += `#v(2pt)\n`;
                                entry.highlights.forEach(h => {
                                    if (h.includes("[SUBPROJECT]")) {
                                        const subTitle = h.replace("[SUBPROJECT]", "").trim();
                                        code += `#v(3pt) #text(weight: "bold", style: "italic", fill: rgb("#6f6f6f"), size: 9.5pt)[${escapeAndFormatTypst(subTitle)}]\n`;
                                    } else {
                                        code += `- ${escapeAndFormatTypst(h)}\n`;
                                    }
                                });
                            }
                            
                            code += `#v(5pt)\n`;
                        }
                    }
                });
            }
        });
    }

    return code;
}

/**
 * @param {object} docData - The parsed Document JSON (with top-level `document` key)
 * @param {object} [themeConfig] - Optional theme: { headingColor, font, isSerif }
 */
export function translateDocToTypst(docData, themeConfig) {
    const doc = docData.document || {};
    const hColor = (themeConfig && themeConfig.headingColor) || '#004f90';
    const fontName = resolveTypstFont(
        (themeConfig && themeConfig.font) || 'Source Sans 3',
        (themeConfig && themeConfig.isSerif) || false
    );
    let code = "";

    // ── Page Setup ─────────────────────────────────────────────────────
    code += `#set page(
  paper: "a4",
  margin: (x: 2cm, y: 2.2cm),
)\n`;
    
    // ── Typography Defaults ────────────────────────────────────────────
    code += `#set text(
  font: ("${fontName}", "Liberation Sans", "Arial", "Helvetica", "sans-serif"),
  size: 10.5pt,
  fill: rgb("#1e293b"),
)\n`;

    // ── Paragraph & List Global Defaults ───────────────────────────────
    code += `#set par(leading: 0.55em)\n`;
    code += `#set list(marker: [•], indent: 6pt, body-indent: 3pt, spacing: 4pt)\n`;

    // Title
    if (doc.title) {
        code += `#align(center)[\n  #text(size: 22pt, weight: "bold", fill: rgb("${hColor}"))[${escapeAndFormatTypst(doc.title)}]\n]\n`;
    }

    // Author
    if (doc.author) {
        code += `#align(center)[\n  #text(size: 11pt, style: "italic", fill: rgb("#64748b"))[By ${escapeAndFormatTypst(doc.author)}]\n]\n#v(10pt)\n`;
    }

    // Horizontal rule under title
    code += `#line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))\n#v(12pt)\n`;

    // Render sections in explicit order
    if (doc.sections) {
        const sectionOrder = doc.section_order || Object.keys(doc.sections);
        sectionOrder.forEach(sectionTitle => {
            const entries = doc.sections[sectionTitle];
            if (!entries) return;

            code += `\n// ── ${sectionTitle} ──\n`;
            code += `#text(weight: "bold", size: 14pt, fill: rgb("${hColor}"))[${escapeAndFormatTypst(sectionTitle)}]\n\n`;

            if (Array.isArray(entries)) {
                entries.forEach(entry => {
                    if (typeof entry === "string") {
                        code += `${escapeAndFormatTypst(entry)}\n\n`;
                    } else if (typeof entry === "object") {
                        if (entry.bullet) {
                            code += `- ${escapeAndFormatTypst(entry.bullet)}\n`;
                        } else if (entry.heading) {
                            code += `== ${escapeAndFormatTypst(entry.heading)}\n\n`;
                        }
                    }
                });
                code += `#v(8pt)\n`;
            }
        });
    }

    return code;
}
