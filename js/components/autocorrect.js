import { store, markDirty } from "../store.js";
import { $ } from "../utils.js";

// Common technical and professional typo dictionary (Local Fallback)
const DICTIONARY = {
    "teh": "the",
    "recieve": "receive",
    "recieved": "received",
    "seperate": "separate",
    "seperated": "separated",
    "developpment": "development",
    "developper": "developer",
    "managment": "management",
    "managerment": "management",
    "enginering": "engineering",
    "engineeer": "engineer",
    "embeded": "embedded",
    "responsable": "responsible",
    "referance": "reference",
    "referances": "references",
    "successfull": "successful",
    "succesful": "successful",
    "achivement": "achievement",
    "achivements": "achievements",
    "occured": "occurred",
    "tommorow": "tomorrow",
    "goverment": "government",
    "enviroment": "environment",
    "experiance": "experience",
    "knowlege": "knowledge",
    "implimentation": "implementation",
    "implimented": "implemented",
    "maintainance": "maintenance",
    "oppurtunity": "opportunity",
    "technolgy": "technology",
    "visualisation": "visualization",

    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "reactjs": "React",
    "nodejs": "Node.js",
    "github": "GitHub",
    "postgressql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "mongodb": "MongoDB",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "linux": "Linux",
    "ubuntu": "Ubuntu",
    "fastapi": "FastAPI"
};

let activePopover = null;

export function initAutocorrect() {
    const paper = $("paperSheet");
    if (!paper) return;

    let scanTimer = null;

    function triggerScan(target) {
        if (!target) return;
        const editable = target.isContentEditable ? target : target.closest("[contenteditable='true']");
        if (editable && !editable.closest(".autocorrect-popover")) {
            scanWithLanguageTool(editable);
        }
    }

    // Remove any popover on outside click
    document.addEventListener("click", (e) => {
        if (activePopover && !activePopover.contains(e.target) && !e.target.closest(".autocorrect-typo, .autocorrect-grammar, .autocorrect-style")) {
            closePopover();
        }
    });

    // Delegated click on highlighted error span
    paper.addEventListener("click", (e) => {
        const errorSpan = e.target.closest(".autocorrect-typo, .autocorrect-grammar, .autocorrect-style");
        if (errorSpan) {
            e.stopPropagation();
            const typo = errorSpan.dataset.typo || errorSpan.textContent;
            let suggestions = [];
            try {
                suggestions = JSON.parse(errorSpan.dataset.suggestions || "[]");
            } catch (err) {
                suggestions = [];
            }
            const message = errorSpan.dataset.message || "Possible issue detected";
            const category = errorSpan.dataset.category || "spelling";
            showPopover(errorSpan, typo, suggestions, message, category);
        }
    });

    // Debounced scan on typing pause (500ms)
    paper.addEventListener("input", (e) => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
            triggerScan(e.target);
        }, 500);
    });

    // Immediate scan on Space or Enter key
    paper.addEventListener("keyup", (e) => {
        if (e.key === " " || e.key === "Enter") {
            clearTimeout(scanTimer);
            triggerScan(e.target);
        }
    });

    // Scan editable elements on blur / focusout
    paper.addEventListener("focusout", (e) => {
        clearTimeout(scanTimer);
        triggerScan(e.target);
    });
}

export function scanPaperSheet() {
    const paper = $("paperSheet");
    if (!paper) return;
    const editables = paper.querySelectorAll("[contenteditable='true']");
    editables.forEach(el => scanWithLanguageTool(el));
}

export async function scanWithLanguageTool(el) {
    if (!el || el.dataset.autocorrectScanning) return;
    const rawText = el.innerText || el.textContent;
    if (!rawText || rawText.trim().length < 3) return;

    el.dataset.autocorrectScanning = "true";
    clearHighlights(el);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const response = await fetch("https://api.languagetool.org/v2/check", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            body: new URLSearchParams({
                text: rawText,
                language: "en-US"
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error("LanguageTool HTTP Error");
        const data = await response.json();

        if (data && data.matches && data.matches.length > 0) {
            highlightLanguageToolMatches(el, data.matches);
        } else {
            scanAndHighlightElement(el);
        }
    } catch (err) {
        // Fallback to local dictionary scan if LanguageTool API is offline or times out
        scanAndHighlightElement(el);
    } finally {
        delete el.dataset.autocorrectScanning;
    }
}

function clearHighlights(el) {
    const existing = el.querySelectorAll(".autocorrect-typo, .autocorrect-grammar, .autocorrect-style");
    existing.forEach(span => {
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
    });
    el.normalize();
}

function highlightLanguageToolMatches(el, matches) {
    const fullText = el.textContent;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let n;
    while (n = walk.nextNode()) textNodes.push(n);

    // Filter valid matches
    const validMatches = matches.filter(m => m.replacements && m.replacements.length > 0);
    if (validMatches.length === 0) return;

    // Process matches in reverse offset order to prevent index drift
    validMatches.sort((a, b) => b.offset - a.offset);

    validMatches.forEach(match => {
        const matchStart = match.offset;
        const matchEnd = match.offset + match.length;
        const typoStr = fullText.slice(matchStart, matchEnd);
        if (!typoStr.trim()) return;

        // Categorize match
        let category = "spelling";
        let cssClass = "autocorrect-typo";
        const issueType = match.rule?.issueType || "";
        const catId = match.rule?.category?.id || "";

        if (issueType === "grammar" || catId === "GRAMMAR" || catId === "PUNCTUATION") {
            category = "grammar";
            cssClass = "autocorrect-grammar";
        } else if (issueType === "style" || catId === "STYLE" || catId === "REDUNDANCY") {
            category = "style";
            cssClass = "autocorrect-style";
        }

        const suggestions = match.replacements.slice(0, 3).map(r => r.value);

        // Find matching text node
        let currentOffset = 0;
        for (let node of textNodes) {
            const nodeLen = node.nodeValue.length;
            if (matchStart >= currentOffset && matchEnd <= currentOffset + nodeLen) {
                const nodeStart = matchStart - currentOffset;
                const nodeEnd = matchEnd - currentOffset;

                const text = node.nodeValue;
                const before = text.slice(0, nodeStart);
                const targetText = text.slice(nodeStart, nodeEnd);
                const after = text.slice(nodeEnd);

                const span = document.createElement("span");
                span.className = cssClass;
                span.dataset.typo = targetText;
                span.dataset.suggestions = JSON.stringify(suggestions);
                span.dataset.message = match.message || match.shortMessage || "LanguageTool Suggestion";
                span.dataset.category = category;
                span.textContent = targetText;

                const frag = document.createDocumentFragment();
                if (before) frag.appendChild(document.createTextNode(before));
                frag.appendChild(span);
                if (after) frag.appendChild(document.createTextNode(after));

                if (node.parentNode) {
                    node.parentNode.replaceChild(frag, node);
                }
                break;
            }
            currentOffset += nodeLen;
        }
    });
}

export function scanAndHighlightElement(el) {
    if (!el) return;
    clearHighlights(el);

    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    let n;
    while (n = walk.nextNode()) nodes.push(n);

    nodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const words = text.split(/(\s+|[.,!?:;()"`]+)/);
        let modified = false;
        const frag = document.createDocumentFragment();

        words.forEach(word => {
            const cleanWord = word.trim();
            const lower = cleanWord.toLowerCase();
            if (cleanWord && DICTIONARY[lower] && cleanWord !== DICTIONARY[lower]) {
                const suggestion = DICTIONARY[lower];
                let finalSuggest = suggestion;
                if (/^[A-Z]/.test(cleanWord) && /^[a-z]/.test(suggestion)) {
                    finalSuggest = suggestion.charAt(0).toUpperCase() + suggestion.slice(1);
                }

                const span = document.createElement("span");
                span.className = "autocorrect-typo";
                span.dataset.typo = cleanWord;
                span.dataset.suggestions = JSON.stringify([finalSuggest]);
                span.dataset.message = "Spelling suggestion";
                span.dataset.category = "spelling";
                span.textContent = word;
                frag.appendChild(span);
                modified = true;
            } else {
                frag.appendChild(document.createTextNode(word));
            }
        });

        if (modified && textNode.parentNode) {
            textNode.parentNode.replaceChild(frag, textNode);
        }
    });
}

function showPopover(targetSpan, typo, suggestions, message, category) {
    closePopover();

    const rect = targetSpan.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.className = "autocorrect-popover";

    const badgeClass = category.toLowerCase();
    const badgeLabel = category.toUpperCase();

    let suggestionsHtml = "";
    if (suggestions && suggestions.length > 0) {
        suggestionsHtml = suggestions.map(s => `
            <button class="btn-autocorrect-suggest" type="button" data-val="${escapeHtml(s)}">
                <span>Replace with <strong>${escapeHtml(s)}</strong></span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
        `).join("");
    } else {
        suggestionsHtml = `<div style="font-size:0.75rem;color:var(--text-subtle);">No direct replacement</div>`;
    }

    popover.innerHTML = `
        <div class="autocorrect-header">
            <span class="autocorrect-badge ${badgeClass}">${badgeLabel}</span>
            <span class="autocorrect-typo-str">${escapeHtml(typo)}</span>
        </div>
        <div class="autocorrect-msg">${escapeHtml(message)}</div>
        <div class="autocorrect-suggestions">
            ${suggestionsHtml}
        </div>
        <button class="btn-autocorrect-ignore" type="button">Ignore Suggestion</button>
    `;

    document.body.appendChild(popover);
    activePopover = popover;

    // Positioning above or below target span
    const popRect = popover.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 6;
    let left = rect.left + window.scrollX;

    if (rect.bottom + popRect.height + 20 > window.innerHeight) {
        top = rect.top + window.scrollY - popRect.height - 6;
    }

    if (left + popRect.width > window.innerWidth - 16) {
        left = window.innerWidth - popRect.width - 16;
    }
    if (left < 16) left = 16;

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;

    // Button actions
    popover.querySelectorAll(".btn-autocorrect-suggest").forEach(btn => {
        btn.addEventListener("click", () => {
            const val = btn.dataset.val;
            applyCorrection(targetSpan, val);
        });
    });

    popover.querySelector(".btn-autocorrect-ignore").addEventListener("click", () => {
        ignoreCorrection(targetSpan);
    });
}

function applyCorrection(span, suggestion) {
    const parent = span.closest("[contenteditable='true']") || span.parentNode;
    const textNode = document.createTextNode(suggestion);
    span.parentNode.replaceChild(textNode, span);
    if (parent) parent.normalize();

    closePopover();
    markDirty();

    if (parent) {
        const event = new Event("input", { bubbles: true, cancelable: true });
        parent.dispatchEvent(event);
    }
}

function ignoreCorrection(span) {
    const textNode = document.createTextNode(span.textContent);
    span.parentNode.replaceChild(textNode, span);
    closePopover();
}

function closePopover() {
    if (activePopover) {
        activePopover.remove();
        activePopover = null;
    }
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
