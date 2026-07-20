/**
 * B.A.T.S. Schema to Typst Translator
 * ==================================
 * Translates RenderCV JSON and standard B.A.T.S. Document schemas to Typst markup
 * for high-quality, ATS-compatible PDF generation in the browser.
 */

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
    res = res.replace(/\*\frac{.*?}\*\*/g, (match, p1) => {
        return `*${p1}*`;
    });
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

export function translateCvToTypst(cvData) {
    const cv = cvData.cv || {};
    let code = "";

    // Set page parameters
    code += `#set page(
  paper: "a4",
  margin: (x: 1.5cm, y: 1.8cm),
)\n`;
    
    // Set text parameters with robust fallbacks
    code += `#set text(
  font: ("Source Sans 3", "Liberation Sans", "Arial", "Helvetica", "sans-serif"),
  size: 10pt,
  fill: rgb("#1e293b"), // Slate 800
)\n`;

    // 1. Last Updated line (absolute top-right using #place to not shift name)
    code += `#place(top + right, dy: 10pt)[#text(size: 7.5pt, fill: rgb("#7f7f7f"), style: "italic")[Last updated in July 2026]]\n`;

    // 2. Name Header (centered, large blue)
    if (cv.name) {
        code += `#align(center)[\n  #text(size: 26pt, weight: "bold", fill: rgb("#004f90"))[${escapeAndFormatTypst(cv.name)}]\n]\n#v(2pt)\n`;
    }

    // 3. Contact Details block (centered, no-tofu clean layout)
    let contactItems = [];
    if (cv.location) contactItems.push(escapeAndFormatTypst(cv.location));
    if (cv.email) contactItems.push(escapeAndFormatTypst(cv.email));
    if (cv.phone) contactItems.push(escapeAndFormatTypst(cv.phone));
    
    if (cv.social_networks) {
        cv.social_networks.forEach(net => {
            if (net.network.toLowerCase() === "linkedin") {
                contactItems.push(`linkedin.com/in/${escapeAndFormatTypst(net.username)}`);
            } else {
                contactItems.push(`${escapeAndFormatTypst(net.network)}: ${escapeAndFormatTypst(net.username)}`);
            }
        });
    }
    if (cv.website) {
        let cleanUrl = cv.website.replace(/^https?:\/\//, "");
        contactItems.push(escapeAndFormatTypst(cleanUrl));
    }

    if (contactItems.length > 0) {
        // Group contact details into a clean centered row layout with pipe dividers
        code += `#align(center)[\n  #text(size: 8.5pt, fill: rgb("#64748b"))[\n`;
        code += `    ${contactItems.join("  |  ")}\n`;
        code += `  ]\n]\n#v(10pt)\n`;
    }

    // Render sections in explicit order
    if (cv.sections) {
        const sectionOrder = cv.section_order || Object.keys(cv.sections);
        sectionOrder.forEach(sectionTitle => {
            const entries = cv.sections[sectionTitle];
            if (!entries) return;

            code += `\n// ── ${sectionTitle} ──\n`;
            
            // Header with line spanning to the right edge (Summary ────────────)
            code += `#v(4pt)\n#grid(
  columns: (auto, 1fr),
  align: (left, horizon),
  gutter: 10pt,
  [#text(weight: "bold", size: 12pt, fill: rgb("#004f90"))[${escapeAndFormatTypst(sectionTitle)}]],
  [#line(length: 100%, stroke: 1.5pt + rgb("#004f90"))]
)\n#v(4pt)\n`;

            if (Array.isArray(entries)) {
                entries.forEach(entry => {
                    if (typeof entry === "string") {
                        // Paragraph / Text block (e.g. Summary)
                        code += `${escapeAndFormatTypst(entry)}\n\n`;
                    } else if (typeof entry === "object") {
                        if (entry.label) {
                            // Label Section: Languages, etc.
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
                            const subLeft = entry.position || entry.area || entry.degree || "";
                            const subRight = entry.location || "";

                            // Title line
                            if (titleLeft || titleRight) {
                                code += `#grid(
  columns: (1fr, auto),
  [*${escapeAndFormatTypst(titleLeft)}*], [${escapeAndFormatTypst(titleRight)}],
)\n`;
                            }

                            // Subtitle line
                            if (subLeft || subRight) {
                                code += `#v(-4pt)\n#grid(
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
                            
                            code += `#v(6pt)\n`;
                        }
                    }
                });
            }
        });
    }

    return code;
}

export function translateDocToTypst(docData) {
    const doc = docData.document || {};
    let code = "";

    // Set page parameters
    code += `#set page(
  paper: "a4",
  margin: (x: 2cm, y: 2.2cm),
)\n`;
    
    // Set text parameters with robust fallbacks
    code += `#set text(
  font: ("Source Sans 3", "Liberation Sans", "Arial", "Helvetica", "sans-serif"),
  size: 10.5pt,
  fill: rgb("#1e293b"), // Slate 800
)\n`;

    // Title
    if (doc.title) {
        code += `#align(center)[\n  #text(size: 22pt, weight: "bold", fill: rgb("#004f90"))[${escapeAndFormatTypst(doc.title)}]\n]\n`;
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
            code += `#text(weight: "bold", size: 14pt, fill: rgb("#004f90"))[${escapeAndFormatTypst(sectionTitle)}]\n\n`;

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
