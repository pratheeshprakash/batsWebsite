/**
 * B.A.T.S. Schema to Typst Translator
 * ==================================
 * Translates RenderCV JSON and standard B.A.T.S. Document schemas to Typst markup
 * for high-quality, ATS-compatible PDF generation in the browser.
 */

function escapeTypst(val) {
    if (typeof val !== "string") {
        if (val === null || val === undefined) return "";
        return String(val);
    }
    return val
        .replace(/\\/g, "\\\\")
        .replace(/@/g, "\\@")
        .replace(/#/g, "\\#")
        .replace(/_/g, "\\_")
        .replace(/\*/g, "\\*")
        .replace(/</g, "\\<")
        .replace(/>/g, "\\>");
}

export function translateCvToTypst(cvData) {
    const cv = cvData.cv || {};
    let code = "";

    // Set page parameters
    code += `#set page(
  paper: "a4",
  margin: (x: 1.5cm, y: 1.8cm),
)\n`;
    
    // Set text parameters
    code += `#set text(
  font: "Liberation Sans",
  size: 10pt,
  fill: rgb("#1e293b"), // Slate 800
)\n`;

    // Title / Header
    if (cv.name) {
        code += `#align(center)[\n  #text(size: 20pt, weight: "bold", fill: rgb("#004f90"))[${escapeTypst(cv.name)}]\n]\n`;
    }

    // Contact details line
    let contact = [];
    if (cv.location) contact.push(escapeTypst(cv.location));
    if (cv.email) contact.push(escapeTypst(cv.email));
    if (cv.phone) contact.push(escapeTypst(cv.phone));
    if (cv.website) {
        let cleanUrl = cv.website.replace(/^https?:\/\//, "");
        contact.push(escapeTypst(cleanUrl));
    }
    if (cv.social_networks) {
        cv.social_networks.forEach(net => {
            contact.push(`${escapeTypst(net.network)}: ${escapeTypst(net.username)}`);
        });
    }

    if (contact.length > 0) {
        code += `#align(center)[\n  #text(size: 8.5pt, fill: rgb("#64748b"))[${contact.join("  |  ")}]\n]\n#v(4pt)\n`;
    }

    // Horizontal rule under header
    code += `#line(length: 100%, stroke: 0.5pt + rgb("#004f90"))\n#v(10pt)\n`;

    // Render sections in explicit order
    if (cv.sections) {
        const sectionOrder = cv.section_order || Object.keys(cv.sections);
        sectionOrder.forEach(sectionTitle => {
            const entries = cv.sections[sectionTitle];
            if (!entries) return;

            code += `\n// ── ${sectionTitle} ──\n`;
            code += `#text(weight: "bold", size: 12pt, fill: rgb("#004f90"))[${escapeTypst(sectionTitle).toUpperCase()}]\n`;
            code += `#v(-4pt)\n#line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))\n#v(4pt)\n`;

            if (Array.isArray(entries)) {
                entries.forEach(entry => {
                    if (typeof entry === "string") {
                        // Paragraph / Text block
                        code += `${escapeTypst(entry)}\n\n`;
                    } else if (typeof entry === "object") {
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
  [*${escapeTypst(titleLeft)}*], [${escapeTypst(titleRight)}],
)\n`;
                        }

                        // Subtitle line
                        if (subLeft || subRight) {
                            code += `#v(-4pt)\n#grid(
  columns: (1fr, auto),
  [_${escapeTypst(subLeft)}_], [#text(fill: rgb("#64748b"))[${escapeTypst(subRight)}]],
)\n`;
                        }

                        // Highlights/Bullets
                        if (entry.highlights && Array.isArray(entry.highlights)) {
                            code += `#v(2pt)\n`;
                            entry.highlights.forEach(h => {
                                code += `- ${escapeTypst(h)}\n`;
                            });
                        }
                        
                        code += `#v(6pt)\n`;
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
    
    // Set text parameters
    code += `#set text(
  font: "Liberation Sans",
  size: 10.5pt,
  fill: rgb("#1e293b"), // Slate 800
)\n`;

    // Title
    if (doc.title) {
        code += `#align(center)[\n  #text(size: 22pt, weight: "bold", fill: rgb("#004f90"))[${escapeTypst(doc.title)}]\n]\n`;
    }

    // Author
    if (doc.author) {
        code += `#align(center)[\n  #text(size: 11pt, style: "italic", fill: rgb("#64748b"))[By ${escapeTypst(doc.author)}]\n]\n#v(10pt)\n`;
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
            code += `#text(weight: "bold", size: 14pt, fill: rgb("#004f90"))[${escapeTypst(sectionTitle)}]\n\n`;

            if (Array.isArray(entries)) {
                entries.forEach(entry => {
                    if (typeof entry === "string") {
                        code += `${escapeTypst(entry)}\n\n`;
                    } else if (typeof entry === "object") {
                        if (entry.bullet) {
                            code += `- ${escapeTypst(entry.bullet)}\n`;
                        } else if (entry.heading) {
                            code += `== ${escapeTypst(entry.heading)}\n\n`;
                        }
                    }
                });
                code += `#v(8pt)\n`;
            }
        });
    }

    return code;
}
