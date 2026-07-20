import { DOC_META, store as state, markDirty, markClean } from "./store.js";
import { $, showToast, debounce, formatDateToUI, parseDateFromUI } from "./utils.js";
import * as api from "./api.js";
import { supabase } from "./supabase-client.js";
import { translateCvToTypst, translateDocToTypst } from "./schema-to-typst.js";


// ── Config ─────────────────────────────────────────────────────────────────

// ── State ────────────────────────────────────────────────────────────────────

// ── DOM refs ──────────────────────────────────────────────────────────────────
const timelineList       = $("timelineList");
const searchBar          = $("searchBar");
const activeCvTitle      = $("activeCvTitle");
const activeCvDate       = $("activeCvDate");
const activeCvLocation   = $("activeCvLocation");
const submissionCountBadge = $("submissionCountBadge");
const submissionList     = $("submissionList");
const addSubmissionForm  = $("addSubmissionForm");
const addSubmissionInput = $("addSubmissionInput");
const previewIframe      = $("previewIframe");
const previewLoader      = $("previewLoader");
const paperSheet         = $("paperSheet");
let NAV_BADGES = {};
const cvNavBadge = {
    get textContent() {
        const el = document.getElementById("cvCountBadge");
        return el ? el.textContent : "";
    },
    set textContent(val) {
        const el = document.getElementById("cvCountBadge");
        if (el) el.textContent = val;
    }
};
const unsavedDot         = $("unsavedDot");
const btnSaveDetails     = $("btnSaveDetails");
const btnBranchNew       = $("btnBranchNew");
const btnCompare         = $("btnCompare");
const btnDownloadPdf     = $("btnDownloadPdf");
const btnDeleteCv        = $("btnDeleteCv");
const btnPromoteMain     = $("btnPromoteMain");
const btnChooseTheme       = $("btnChooseTheme");
const themePickerModal     = $("themePickerModal");
const btnCloseThemePicker  = $("btnCloseThemePicker");
const btnCancelThemePicker = $("btnCancelThemePicker");
const themePickerGrid      = $("themePickerGrid");
// cvOnlyActions no longer exists — PDF is its own button now
const submissionsPanel   = $("submissionsPanel");
const diffOverlay        = $("diffOverlay");
const btnCloseDiff       = $("btnCloseDiff");
const diffSelectV1       = $("diffSelectV1");
const diffSelectV2       = $("diffSelectV2");
const diffContainer      = $("diffContainer");
const branchOverlay      = $("branchOverlay");
const btnCloseBranch     = $("btnCloseBranch");
const branchSelectBase   = $("branchSelectBase");
const branchInputSlug    = $("branchInputSlug");
const btnCreateBranchSubmit = $("btnCreateBranchSubmit");
const deleteModal        = $("deleteModal");
const deleteModalBody    = $("deleteModalBody");
const btnDeleteCancel    = $("btnDeleteCancel");
const btnDeleteConfirm   = $("btnDeleteConfirm");


// Note template refs
const noteTemplateSection  = $("noteTemplateSection");
const btnEditTemplate      = $("btnEditTemplate");
const noteTemplateModal    = $("noteTemplateModal");
const noteTemplateEditor   = $("noteTemplateEditor");
const btnCloseNoteTemplate = $("btnCloseNoteTemplate");
const btnCancelNoteTemplate= $("btnCancelNoteTemplate");
const btnSaveNoteTemplate  = $("btnSaveNoteTemplate");

// Reminders Inbox refs
const btnOpenRemindersInbox = $("btnOpenRemindersInbox");
const btnCloseRemindersInbox = $("btnCloseRemindersInbox");
const remindersInboxPanel   = $("remindersInboxPanel");
const remindersInboxList    = $("remindersInboxList");
const globalReminderBadge   = $("globalReminderBadge");

// Set reminder modal refs
const btnSetReminder       = $("btnSetReminder");
const reminderSetModal     = $("reminderSetModal");
const reminderSetNoteLabel = $("reminderSetNoteLabel");
const reminderDateInput    = $("reminderDateInput");
const reminderMsgInput     = $("reminderMsgInput");
const btnCloseReminderSet  = $("btnCloseReminderSet");
const btnClearReminder     = $("btnClearReminder");
const btnCancelReminderSet = $("btnCancelReminderSet");
const btnSaveReminderSet   = $("btnSaveReminderSet");


// ── Undo stack + Ctrl+S / Ctrl+Z ─────────────────────────────────────────────
const undoStack = [];
const MAX_UNDO = 50;

function pushUndo() {
    if (!state.activeJson) return;
    undoStack.push(JSON.parse(JSON.stringify(state.activeJson)));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function popUndo() {
    if (undoStack.length === 0) return;
    state.activeJson = undoStack.pop();
    renderPaperSheet(state.activeJson, state.activeDocType);
    markDirty();
}

document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); btnSaveDetails.click(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        const active = document.activeElement;
        const inContentEditable = active && (active.isContentEditable || active.closest("[contenteditable]"));
        if (!inContentEditable) { e.preventDefault(); popUndo(); }
    }
    
    // Intercept Enter key inside highlight subprojects and bullet points
    if (e.key === "Enter") {
        const target = e.target;
        const editSpan = target.closest("span[contenteditable]");
        if (editSpan) {
            const isSubProject = editSpan.closest(".entry-subproject");
            const isBullet = editSpan.closest(".entry-highlights li");
            
            if (isSubProject || isBullet) {
                e.preventDefault();
                pushUndo();
                
                if (isSubProject) {
                    const group = editSpan.closest(".subproject-group");
                    if (group) {
                        const ul = group.querySelector(".entry-highlights");
                        if (ul) {
                            const li = document.createElement("li");
                            li.style.cssText = "display:flex;align-items:baseline;gap:4px;";
                            li.innerHTML = `<span class="bullet-dot" style="margin-right:8px;color:var(--paper-ink);opacity:0.8;user-select:none;">•</span><span contenteditable="true" style="flex:1;outline:none;"></span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove bullet">&times;</button>`;
                            ul.insertBefore(li, ul.firstChild);
                            const span = li.querySelector("span[contenteditable]");
                            if (span) span.focus();
                            markDirty();
                        }
                    }
                } else if (isBullet) {
                    const currentLi = editSpan.closest("li");
                    if (currentLi) {
                        const ul = currentLi.parentElement;
                        const nextLi = document.createElement("li");
                        nextLi.style.cssText = "display:flex;align-items:baseline;gap:4px;";
                        nextLi.innerHTML = `<span class="bullet-dot" style="margin-right:8px;color:var(--paper-ink);opacity:0.8;user-select:none;">•</span><span contenteditable="true" style="flex:1;outline:none;"></span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove bullet">&times;</button>`;
                        ul.insertBefore(nextLi, currentLi.nextSibling);
                        const span = nextLi.querySelector("span[contenteditable]");
                        if (span) span.focus();
                        markDirty();
                    }
                }
            }
        }
    }
});

// ── SVG Icons Lookup ────────────────────────────────────────────────────────
const SVG_ICONS = {
    "file-text": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    "user": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    "star": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    "edit-3": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    "award": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
    "book": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    "briefcase": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    "compass": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
    "target": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    "message-square": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    "activity": `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`
};

const PRESET_COLORS = [
    "#4f8ef7", // Blue
    "#22d3a0", // Emerald
    "#a78bfa", // Violet
    "#fbbf24", // Amber
    "#f43f5e", // Crimson/Rose
    "#06b6d4", // Cyan
    "#f97316"  // Orange
];

let activeTabs = [];
let suggestionTabs = [];

// ── Dynamic Tabs Initialization ──────────────────────────────────────────────
async function initTabs() {
    try {
        const data = await api.fetchTabs();
        activeTabs = data.active_tabs;
        suggestionTabs = data.suggestions;

        // Clear and update DOC_META in store
        for (const key in DOC_META) delete DOC_META[key];
        activeTabs.forEach(t => {
            const svgContent = SVG_ICONS[t.icon] || SVG_ICONS["file-text"];
            DOC_META[t.type] = {
                icon: svgContent,
                label: t.label,
                color: t.color,
                isDefault: t.isDefault
            };
        });

        // Re-render navigation
        const docNav = $("docNav");
        docNav.innerHTML = "";
        NAV_BADGES = {};

        // Keep CV Vault first and Notes last, with custom tabs in-between
        const cvTab = activeTabs.find(t => t.type === "cv");
        const notesTab = activeTabs.find(t => t.type === "notes");
        const middleTabs = activeTabs.filter(t => t.type !== "cv" && t.type !== "notes");

        const orderedTabs = [];
        if (cvTab) orderedTabs.push(cvTab);
        orderedTabs.push(...middleTabs);
        if (notesTab) orderedTabs.push(notesTab);

        orderedTabs.forEach(t => {
            const wrapper = document.createElement("div");
            wrapper.className = "nav-pill-wrapper";

            const btn = document.createElement("button");
            btn.className = `nav-pill ${state.activeDocType === t.type ? "active" : ""}`;
            btn.dataset.doc = t.type;
            btn.style.setProperty("--tab-color", t.color);
            
            // Set styles dynamically if active
            if (state.activeDocType === t.type) {
                document.documentElement.style.setProperty("--accent", t.color);
                document.documentElement.style.setProperty("--accent-glow", t.color + "38");
                document.documentElement.style.setProperty("--accent-dim",  t.color + "1a");
                document.documentElement.style.setProperty("--border-hi",   t.color + "66");
            }

            const iconSvg = SVG_ICONS[t.icon] || SVG_ICONS["file-text"];
            btn.innerHTML = `
                ${iconSvg}
                ${t.label}
                <span class="nav-badge" id="${t.type}CountBadge" style="--badge-color:${t.color};"></span>
            `;

            btn.addEventListener("click", () => switchDocType(t.type));
            wrapper.appendChild(btn);

            if (!t.isDefault) {
                const delBtn = document.createElement("button");
                delBtn.className = "btn-delete-tab";
                delBtn.innerHTML = "×";
                delBtn.title = `Remove ${t.label} Tab`;
                delBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    removeTab(t.type);
                });
                wrapper.appendChild(delBtn);
            }

            docNav.appendChild(wrapper);
            NAV_BADGES[t.type] = document.getElementById(`${t.type}CountBadge`);
        });

        // Load versions for all tabs to populate badges
        activeTabs.forEach(t => {
            loadVersions(t.type);
        });

        // Set the initial theme for the active document type
        const activeTab = activeTabs.find(t => t.type === state.activeDocType);
        const activeTheme = activeTab ? (activeTab.theme || 'professional-navy') : 'professional-navy';
        applyPaperTheme(activeTheme, false);

    } catch (err) {
        showToast("Error loading dynamic tabs: " + err.message, "error");
    }
}

async function removeTab(type) {
    const tab = activeTabs.find(t => t.type === type);
    if (!tab) return;
    if (tab.isDefault) {
        showToast("Cannot remove default tabs", "error");
        return;
    }
    const ok = await showConfirm(
        "Remove Tab?",
        `Are you sure you want to remove the "${tab.label}" tab?\nAll document files under 'documents/${type}/' will remain safe on disk.`,
        true
    );
    if (!ok) return;

    try {
        const newActive = activeTabs.filter(t => t.type !== type);
        const newSuggestions = [...suggestionTabs];
        if (["bio", "brand", "cover_letters", "portfolio", "credentials", "testimonials"].includes(type)) {
            const preset = {
                type,
                label: tab.label,
                icon: tab.icon,
                color: tab.color
            };
            if (!newSuggestions.some(s => s.type === type)) {
                newSuggestions.push(preset);
            }
        }

        await api.saveTabs({ active_tabs: newActive, suggestions: newSuggestions });

        showToast(`Removed tab: ${tab.label}`, "success");
        
        if (state.activeDocType === type) {
            state.activeDocType = "cv";
            state.activeVersion = null;
            state.activeJson = null;
        }

        await initTabs();
        switchDocType(state.activeDocType);

    } catch (err) {
        showToast("Failed to remove tab: " + err.message, "error");
    }
}

// ── Add Tab Modal Helpers ───────────────────────────────────────────────────
const addTabModal = $("addTabModal");
const addTabSuggestionSelect = $("addTabSuggestionSelect");
const addTabCustomFields = $("addTabCustomFields");
const addTabLabelInput = $("addTabLabelInput");
const addTabSlugInput = $("addTabSlugInput");
const addTabIconGrid = $("addTabIconGrid");
const addTabColorGrid = $("addTabColorGrid");
const btnConfirmAddTab = $("btnConfirmAddTab");

function renderColorPickerGrid() {
    const colorGrid = $("addTabColorGrid");
    colorGrid.innerHTML = "";
    PRESET_COLORS.forEach(color => {
        const swatch = document.createElement("div");
        swatch.className = "color-picker-swatch";
        swatch.style.backgroundColor = color;
        swatch.style.setProperty("--swatch-color", color + "4d");
        swatch.dataset.color = color;
        swatch.addEventListener("click", () => {
            colorGrid.querySelectorAll(".color-picker-swatch").forEach(s => s.classList.remove("selected"));
            swatch.classList.add("selected");
        });
        colorGrid.appendChild(swatch);
    });
    if (colorGrid.firstChild) colorGrid.firstChild.click();
}

function renderIconPickerGrid() {
    const iconGrid = $("addTabIconGrid");
    iconGrid.innerHTML = "";
    Object.keys(SVG_ICONS).forEach(iconName => {
        const btn = document.createElement("button");
        btn.className = "icon-picker-btn";
        btn.innerHTML = SVG_ICONS[iconName];
        btn.dataset.icon = iconName;
        btn.type = "button";
        btn.addEventListener("click", () => {
            iconGrid.querySelectorAll(".icon-picker-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
        });
        iconGrid.appendChild(btn);
    });
    if (iconGrid.firstChild) iconGrid.firstChild.click();
}

function populateAddTabSelect() {
    const select = $("addTabSuggestionSelect");
    select.innerHTML = "";
    
    suggestionTabs.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.type;
        opt.textContent = s.label;
        select.appendChild(opt);
    });

    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "Custom Tab...";
    select.appendChild(customOpt);

    select.dispatchEvent(new Event("change"));
}


// Collapsible Submissions Panel
const submissionsHeader = $("submissionsHeader");
const submissionsContent = $("submissionsContent");
const submissionsChevron = $("submissionsChevron");
if (submissionsHeader && submissionsContent && submissionsChevron) {
    const isCollapsed = localStorage.getItem("bats_submissions_collapsed") === "true";
    if (isCollapsed) {
        submissionsContent.style.display = "none";
        submissionsChevron.style.transform = "rotate(-90deg)";
    } else {
        submissionsContent.style.display = "flex";
        submissionsChevron.style.transform = "rotate(0deg)";
    }
    submissionsHeader.addEventListener("click", () => {
        const currentlyHidden = submissionsContent.style.display === "none";
        if (currentlyHidden) {
            submissionsContent.style.display = "flex";
            submissionsChevron.style.transform = "rotate(0deg)";
            localStorage.setItem("bats_submissions_collapsed", "false");
        } else {
            submissionsContent.style.display = "none";
            submissionsChevron.style.transform = "rotate(-90deg)";
            localStorage.setItem("bats_submissions_collapsed", "true");
        }
    });
}

// Bind modal toggle events
if ($("btnOpenAddTab")) {
    $("btnOpenAddTab").addEventListener("click", () => {
        populateAddTabSelect();
        renderIconPickerGrid();
        renderColorPickerGrid();
        addTabModal.style.display = "flex";
    });
}
if ($("btnCloseAddTab")) $("btnCloseAddTab").addEventListener("click", () => { addTabModal.style.display = "none"; });
if ($("btnCancelAddTab")) $("btnCancelAddTab").addEventListener("click", () => { addTabModal.style.display = "none"; });

// Bind Theme Modal toggle events
if (btnChooseTheme) {
    btnChooseTheme.addEventListener("click", () => {
        renderThemePickerGrid();
        themePickerModal.style.display = "flex";
    });
}
if (btnCloseThemePicker) {
    btnCloseThemePicker.addEventListener("click", () => {
        themePickerModal.style.display = "none";
    });
}
if (btnCancelThemePicker) {
    btnCancelThemePicker.addEventListener("click", () => {
        themePickerModal.style.display = "none";
    });
}

addTabSuggestionSelect.addEventListener("change", () => {
    if (addTabSuggestionSelect.value === "custom") {
        addTabCustomFields.style.display = "block";
    } else {
        addTabCustomFields.style.display = "none";
    }
});

btnConfirmAddTab.addEventListener("click", async () => {
    const mode = addTabSuggestionSelect.value;
    let newTab = null;

    if (mode === "custom") {
        const label = addTabLabelInput.value.trim();
        let slug = addTabSlugInput.value.trim().toLowerCase();
        
        if (!label) {
            showToast("Please enter a tab label", "error");
            return;
        }

        if (!slug) {
            slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        }

        if (!slug || !/^[a-z0-9_-]+$/.test(slug)) {
            showToast("Invalid slug. Use alphanumeric, hyphens, or underscores only.", "error");
            return;
        }

        if (activeTabs.some(t => t.type === slug)) {
            showToast("A tab with this slug/type already exists", "error");
            return;
        }

        const selectedIconBtn = addTabIconGrid.querySelector(".icon-picker-btn.selected");
        const icon = selectedIconBtn ? selectedIconBtn.dataset.icon : "file-text";

        const selectedColorSwatch = addTabColorGrid.querySelector(".color-picker-swatch.selected");
        const color = selectedColorSwatch ? selectedColorSwatch.dataset.color : "#4f8ef7";

        newTab = {
            type: slug,
            label,
            icon,
            color,
            isDefault: false
        };
    } else {
        const preset = suggestionTabs.find(t => t.type === mode);
        if (!preset) return;
        newTab = { ...preset, isDefault: false };
    }

    try {
        btnConfirmAddTab.disabled = true;
        btnConfirmAddTab.textContent = "Adding…";

        const newActive = [...activeTabs, newTab];
        const newSuggestions = suggestionTabs.filter(t => t.type !== newTab.type);

        await api.saveTabs({ active_tabs: newActive, suggestions: newSuggestions });

        showToast(`Added tab: ${newTab.label}`, "success");
        addTabModal.style.display = "none";
        
        addTabLabelInput.value = "";
        addTabSlugInput.value = "";

        await initTabs();
        switchDocType(newTab.type);

    } catch (err) {
        showToast("Failed to add tab: " + err.message, "error");
    } finally {
        btnConfirmAddTab.disabled = false;
        btnConfirmAddTab.textContent = "Add Tab";
    }
});

// ── Paper Themes Logic ────────────────────────────────────────────────────────
const THEME_FONTS = {
    'classic-serif': 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&display=swap',
    'warm-earth': 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap'
};

const THEMES_LIST = [
    { id: 'professional-navy', name: 'Professional Navy', desc: 'CVs, formal documents', headingColor: '#004f90', font: 'Source Sans 3', isSerif: false },
    { id: 'minimal-clean', name: 'Minimal Clean', desc: 'Notes, quick docs', headingColor: '#1a1a1a', font: 'Inter', isSerif: false },
    { id: 'classic-serif', name: 'Classic Serif', desc: 'Bios, cover letters', headingColor: '#2c3e50', font: 'Merriweather', isSerif: true },
    { id: 'modern-sans', name: 'Modern Sans', desc: 'Brand manuals, portfolios', headingColor: '#0ea5e9', font: 'Outfit', isSerif: false },
    { id: 'warm-earth', name: 'Warm Earth', desc: 'Personal, creative', headingColor: '#92400e', font: 'Playfair Display', isSerif: true },
    { id: 'monochrome', name: 'Monochrome', desc: 'Print-optimised, formal', headingColor: '#000000', font: 'Source Sans 3', isSerif: false }
];

function loadThemeFonts(themeId) {
    const linkId = "theme-fonts-stylesheet";
    let linkEl = document.getElementById(linkId);
    
    const fontUrl = THEME_FONTS[themeId];
    if (fontUrl) {
        if (!linkEl) {
            linkEl = document.createElement("link");
            linkEl.id = linkId;
            linkEl.rel = "stylesheet";
            document.head.appendChild(linkEl);
        }
        linkEl.href = fontUrl;
    } else {
        if (linkEl) linkEl.remove();
    }
}

async function applyPaperTheme(themeId, persist = true) {
    if (!paperSheet) return;
    
    // 1. Set data attribute on paper sheet
    paperSheet.setAttribute('data-theme', themeId);
    
    // 2. Load any non-standard fonts needed
    loadThemeFonts(themeId);

    // Find tab metadata
    const tabIndex = activeTabs.findIndex(t => t.type === state.activeDocType);
    if (tabIndex !== -1) {
        const tab = activeTabs[tabIndex];
        
        // 3. Update tab config memory
        if (tab.theme !== themeId) {
            tab.theme = themeId;
            
            // 4. Persist to disk if requested
            if (persist) {
                try {
                    await api.saveTabs({ active_tabs: activeTabs, suggestions: suggestionTabs });
                    showToast(`Applied theme: ${THEMES_LIST.find(t=>t.id===themeId).name}`, "success");
                } catch (err) {
                    showToast("Could not save theme choice", "error");
                }
            }
        }
    }
}

function renderThemePickerGrid() {
    if (!themePickerGrid) return;
    themePickerGrid.innerHTML = "";
    
    // Retrieve current tab's active theme
    const activeTab = activeTabs.find(t => t.type === state.activeDocType);
    const activeThemeId = activeTab ? (activeTab.theme || 'professional-navy') : 'professional-navy';

    THEMES_LIST.forEach(t => {
        const wrapper = document.createElement("div");
        wrapper.className = `theme-card-wrapper ${activeThemeId === t.id ? "selected" : ""}`;
        
        // Build mini preview card markup
        wrapper.innerHTML = `
            <div class="theme-card" style="color: #0f172a; font-family: ${t.isSerif ? t.font + ', Georgia, serif' : t.font + ', sans-serif'};">
                <div class="theme-mini-heading" style="color: ${t.headingColor}; font-family: ${t.font};">
                    <span>Heading</span>
                    <span class="theme-mini-line" style="background: ${t.headingColor}; opacity: 0.6; height: 1px; flex: 1;"></span>
                </div>
                <div class="theme-mini-body">Lorem ipsum dolor sit amet, elit...</div>
                <div class="theme-mini-bullet">
                    <span class="theme-mini-bullet-dot"></span>
                    <span>Bullet item preview</span>
                </div>
            </div>
            <div class="theme-card-label">
                ${activeThemeId === t.id ? '<span style="font-size:0.9rem;">●</span>' : '<span style="font-size:0.9rem;opacity:0.4;">○</span>'}
                ${t.name}
            </div>
        `;
        
        wrapper.addEventListener("click", () => {
            applyPaperTheme(t.id, true);
            themePickerModal.style.display = "none";
        });
        
        themePickerGrid.appendChild(wrapper);
    });
}

async function switchDocType(type) {
    if (state.isDirty) {
        const ok = await showConfirm("Unsaved Changes", "Unsaved changes — switch anyway?", false);
        if (!ok) return;
    }
    markClean();
    state.activeDocType = type;
    state.activeVersion = null;
    state.activeJson = null;
    updateReminderButtonState();

    // Load active tab theme (no save/persist)
    const tab = activeTabs.find(t => t.type === type);
    const theme = tab ? (tab.theme || 'professional-navy') : 'professional-navy';
    applyPaperTheme(theme, false);

    // Nav pill highlight
    document.querySelectorAll(".nav-pill").forEach(p => p.classList.toggle("active", p.dataset.doc === type));

    // Topbar colour accent
    const meta = DOC_META[type];
    document.documentElement.style.setProperty("--accent", meta.color);
    document.documentElement.style.setProperty("--accent-glow", meta.color + "38");
    document.documentElement.style.setProperty("--accent-dim",  meta.color + "1a");
    document.documentElement.style.setProperty("--border-hi",   meta.color + "66");

    // Show/hide Notes-specific template button section
    if (noteTemplateSection) {
        noteTemplateSection.style.display = (type === "notes") ? "block" : "none";
    }

    // Remind button is shown for all types now
    if (btnSetReminder) {
        btnSetReminder.style.display = "inline-flex";
    }

    // Update the New button tooltip/title based on doc type
    if (btnBranchNew) {
        btnBranchNew.title = (type === "notes") ? "New Note" : "New Version";
    }

    // Reset paper
    paperSheet.innerHTML = `<div class="empty-state">
        <span style="display:inline-flex;color:var(--accent);margin-bottom:12px;">${meta.icon}</span>
        <p>Select a ${meta.label} version from the sidebar</p>
    </div>`;
    activeCvTitle.textContent = meta.label;
    activeCvTitle.contentEditable = "false";
    activeCvTitle.classList.remove("renamable");
    activeCvTitle.removeAttribute("title");
    activeCvDate.style.display = "none";
    const pickerVal = document.getElementById("datePickerValue");
    if (pickerVal) pickerVal.textContent = "";
    activeCvLocation.style.display = "none";
    activeCvLocation.innerHTML = "";

    // Load versions for this type
    loadVersions(type);
}

// ── Load versions for a doc type ──────────────────────────────────────────────
async function loadVersions(type) {
    try {
        const versions = await api.fetchVersions(type);
        state.versions[type] = versions;

        // Update the badge for this tab (always display count, even if 0)
        if (NAV_BADGES[type]) NAV_BADGES[type].textContent = versions.length;
        // Legacy alias kept for anything that still references cvNavBadge directly
        if (type === "cv") cvNavBadge.textContent = versions.length;

        if (type === state.activeDocType) {
            renderTimeline(type);
            populateDiffDropdowns(type);
            populateBranchDropdown(type);
        }
        // Only auto-select first version when loading the currently active tab
        if (versions.length > 0 && !state.activeVersion && type === state.activeDocType) {
            selectVersion(versions[0]);
        }
    } catch (err) {
        showToast(`Could not load ${DOC_META[type]?.label} versions`, "error");
    }
}

// ── Timeline rendering ────────────────────────────────────────────────────────
function renderTimeline(type) {
    timelineList.innerHTML = "";
    const versions = state.versions[type] || [];
    const kw = state.searchTerm.toLowerCase();
    const filtered = versions.filter(v => {
        const fn = v.filename ? v.filename.toLowerCase() : "";
        const sl = v.slug ? v.slug.toLowerCase() : "";
        const ti = v.title ? v.title.toLowerCase() : "";
        const subs = v.submissions || [];
        const links = v.linked_to || [];
        
        return fn.includes(kw) || 
               sl.includes(kw) || 
               ti.includes(kw) || 
               subs.some(s => s && s.toLowerCase().includes(kw)) ||
               links.some(l => l && l.toLowerCase().includes(kw));
    });

    if (filtered.length === 0) {
        timelineList.innerHTML = `<div style="font-size:0.75rem;color:var(--text-3);text-align:center;padding:24px 0;">No versions found.</div>`;
        return;
    }

    const allFilenames = versions.map(v => v.filename);
    const roots    = filtered.filter(v => !v.parent || !allFilenames.includes(v.parent));
    const children = filtered.filter(v => v.parent  &&  allFilenames.includes(v.parent));
    const childMap = {};
    if (type !== "notes") {
        children.forEach(c => { (childMap[c.parent] = childMap[c.parent] || []).push(c); });
    }

    function renderCard(v, isChild) {
        const card = document.createElement("div");
        const isActive = state.activeVersion?.filename === v.filename;
        card.className = `timeline-card${isActive ? " active" : ""}`;
        card.dataset.filename = v.filename;
        if (isChild) { card.style.marginLeft = "14px"; card.style.width = "calc(100% - 14px)"; }

        let folder = "";
        const fnLower = v.filename.toLowerCase();
        if (fnLower.includes("canada")) folder = "Canada";
        else if (fnLower.includes("denmark")) folder = "Denmark";
        else if (fnLower.includes("sweden")) folder = "Sweden";
        else if (fnLower.includes("singapore")) folder = "Singapore";
        else if (fnLower.includes("india")) folder = "India";
        else if (fnLower.includes("1-feb-25-apllied-cvs") || fnLower.includes("applied")) folder = "Feb 25 Applied";
        else if (fnLower.includes("2025-old") || fnLower.includes("2025 old")) folder = "2025 Old";
        else if (fnLower.includes("2025")) folder = "2025";
        else if (fnLower.includes("old")) folder = "Old";
        else if (v.filename.includes("/")) folder = v.filename.split("/")[0];
        const folderBadge = folder ? `<span class="card-slug" style="text-transform:none;">${folder}</span>` : "";
        const hasActiveReminder = allReminders.some(r => r.filename === v.filename && r.docType === type && r.status !== "dismissed");
        const reminderBadge = hasActiveReminder
            ? `<span class="card-slug reminder-trigger" title="Active reminder" style="cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding: 2px; border-radius: 4px; border: 1px solid var(--accent); color: var(--accent); background: var(--accent-dim); margin-right: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>`
            : "";
        const subs = (v.submissions || []).length;
        const subsText = subs ? `${subs} submission${subs !== 1 ? "s" : ""}` : "";
        const hasLink = v.linked_to && v.linked_to.length > 0;
        const displayTitle = v.title || v.slug.replace(/-/g, " ");
        card.innerHTML = `
            <div class="card-header">
                <span class="card-date">${formatDateToUI(v.date)}</span>
                <div style="display:flex; gap:4px;">
                    ${reminderBadge}
                    ${folderBadge}
                </div>
            </div>
            <div class="card-title">${(isChild ? "└ " : "") + displayTitle}</div>
            <div class="card-footer-row">
                ${subsText ? `<div class="card-meta">${subsText}</div>` : ""}
                ${state.activeDocType === "notes"
                    ? `<button class="card-link-chip ${hasLink ? "active" : ""}" data-file="${v.filename}" title="${hasLink ? "Go to linked submission: " + v.linked_to[0] : "Select note to link inline"}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        ${hasLink ? "Linked" : "Link"}
                      </button>`
                    : ""}
            </div>
        `;
        card.addEventListener("click", async e => {
            const reminderTrigger = e.target.closest(".reminder-trigger");
            if (reminderTrigger) {
                e.stopPropagation();
                if (state.activeVersion?.filename !== v.filename) {
                    await selectVersion(v);
                }
                const btnSetReminder = document.getElementById("btnSetReminder");
                if (btnSetReminder) btnSetReminder.click();
                return;
            }

            const linkChip = e.target.closest(".card-link-chip");
            if (linkChip) {
                e.stopPropagation();
                if (hasLink) {
                    findAndJumpToSubmission(v.linked_to[0]);
                } else {
                    selectVersion(v);
                }
                return;
            }
            selectVersion(v);
        });
        timelineList.appendChild(card);
        if (type !== "notes") {
            (childMap[v.filename] || []).forEach(c => renderCard(c, true));
        }
    }
    if (type === "notes") {
        filtered.forEach(r => renderCard(r, false));
    } else {
        roots.forEach(r => renderCard(r, false));
    }
}

// ── Select a version ──────────────────────────────────────────────────────────
async function selectVersion(v) {
    state.activeVersion = v;
    const type = state.activeDocType;

    document.querySelectorAll(".timeline-card").forEach(c =>
        c.classList.toggle("active", c.dataset.filename === v.filename)
    );

    activeCvTitle.textContent  = v.title || v.slug.replace(/-/g, " ");
    if (type === "cv") {
        activeCvTitle.contentEditable = "true";
        activeCvTitle.classList.add("renamable");
        activeCvTitle.title = "Click to edit version name in place";
    } else {
        activeCvTitle.contentEditable = "false";
        activeCvTitle.classList.remove("renamable");
        activeCvTitle.removeAttribute("title");
    }
    activeCvDate.style.display = "inline-flex";
    selectedDateStr = v.date;
    const pickerVal = document.getElementById("datePickerValue");
    if (pickerVal) pickerVal.textContent = formatDateToUI(v.date);
    if (v.location) {
        activeCvLocation.style.display = "inline-flex";
        activeCvLocation.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${v.location}`;
    } else {
        activeCvLocation.style.display = "none";
        activeCvLocation.innerHTML = "";
    }

    if (btnPromoteMain) {
        if (v.parent) {
            btnPromoteMain.style.display = "inline-flex";
        } else {
            btnPromoteMain.style.display = "none";
        }
    }

    renderSubmissions(); // all tabs show the linked-to panel

    try {
        state.activeJson = await api.fetchDocumentJson(type, v.filename);
        renderPaperSheet(state.activeJson, type);
        updateReminderButtonState();
        markClean();
    } catch (err) {
        paperSheet.innerHTML = `<div style="color:red;padding:20px;">Error: ${err.message}</div>`;
        showToast("Failed to load document", "error");
    }
}

// ── Duration calculator (matches RenderCV auto-duration) ─────────────────────
function calcDuration(startStr, endStr) {
    if (!startStr) return "";
    const parseDate = s => {
        if (!s || s === "present") return new Date();
        const parts = String(s).split("-");
        const y = parseInt(parts[0], 10);
        const m = parts.length > 1 ? parseInt(parts[1], 10) - 1 : 0;
        return new Date(y, m, 1);
    };
    const start = parseDate(startStr);
    const end = parseDate(endStr || "present");
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (months < 0) return "";
    const years = Math.floor(months / 12);
    months = months % 12;
    const parts = [];
    if (years === 1) parts.push("1 year");
    else if (years > 1) parts.push(`${years} years`);
    if (months === 1) parts.push("1 month");
    else if (months > 1) parts.push(`${months} months`);
    return parts.join(" ") || "< 1 month";
}

// ── Date formatter (matches RenderCV human-readable dates) ───────────────────
function formatDate(dateStr) {
    if (!dateStr || dateStr === "present") return dateStr || "";
    const s = String(dateStr);
    const parts = s.split("-");
    if (parts.length < 2) return s; // year-only like "2018"
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "June",
                        "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    if (m >= 1 && m <= 12) return `${monthNames[m - 1]} ${y}`;
    return s;
}

// ── Date parser (converts human-readable or edited dates back to digital format) ───
function parseDateToYMD(dateStr) {
    if (!dateStr) return "";
    const s = String(dateStr).trim().toLowerCase();
    if (s === "present" || s === "current") return "present";
    
    // YYYY-MM-DD or YYYY-MM
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
        return s;
    }
    // YYYY-M -> YYYY-MM
    if (/^\d{4}-\d{1}$/.test(s)) {
        const parts = s.split("-");
        return `${parts[0]}-0${parts[1]}`;
    }
    // YYYY (year only)
    if (/^\d{4}$/.test(s)) {
        return s;
    }

    const months = {
        jan: "01", january: "01",
        feb: "02", february: "02",
        mar: "03", march: "03",
        apr: "04", april: "04",
        may: "05",
        jun: "06", june: "06",
        jul: "07", july: "07",
        aug: "08", august: "08",
        sep: "09", sept: "09", september: "09",
        oct: "10", october: "10",
        nov: "11", november: "11",
        dec: "12", december: "12"
    };

    // Try splitting by any non-alphanumeric character (spaces, hyphens, slashes, en-dash, em-dash)
    const parts = s.split(/[\s,/\-\u2013\u2014]+/).filter(Boolean);
    if (parts.length === 2) {
        let month = "";
        let year = "";
        if (/^\d{4}$/.test(parts[1])) {
            year = parts[1];
            month = parts[0];
        } else if (/^\d{4}$/.test(parts[0])) {
            year = parts[0];
            month = parts[1];
        }
        
        if (year) {
            if (months[month]) {
                return `${year}-${months[month]}`;
            }
            if (/^\d{1,2}$/.test(month)) {
                const mNum = parseInt(month, 10);
                if (mNum >= 1 && mNum <= 12) {
                    const mStr = mNum < 10 ? `0${mNum}` : `${mNum}`;
                    return `${year}-${mStr}`;
                }
            }
        }
    }
    
    // Return original string trimmed if we can't parse it
    return dateStr.trim();
}


// ── Sub-project highlight detection ──────────────────────────────────────────
function isSubProjectHighlight(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (t.length === 0) return false;
    // Check if it ends with punctuation that implies a sentence rather than a title/heading
    if (/[.!?]$/.test(t)) return false;
    // Typical subproject pattern: contains en-dash, em-dash, or standard dash surrounded by spaces
    if (/\s+[\u2013\u2014-]\s+/.test(t)) return true;
    // Short line (usually a project title or module name) and doesn't look like a standard sentence
    if (t.length < 60 && !t.includes(" and ") && !t.includes(" the ") && !t.includes(" with ")) return true;
    return false;
}

// ── Render structured highlights into HTML ───────────────────────────────────
function renderHighlightsHtml(highlights) {
    let html = "";

    // Check if highlights contains explicit [SUBPROJECT] or \[SUBPROJECT\] tagging.
    // If so, we use explicit tag detection rather than the heuristic, avoiding layout changes on text edits.
    const hasExplicitTags = highlights.some(h => {
        const text = typeof h === "object" && h.bullet ? h.bullet : (typeof h === "string" ? h : "");
        return text.startsWith("[SUBPROJECT]") || text.startsWith("\\[SUBPROJECT\\]");
    });

    const groups = [];
    let currentGroup = { subproject: null, bullets: [] };
    groups.push(currentGroup);

    highlights.forEach(h => {
        let text = typeof h === "object" && h.bullet ? h.bullet : (typeof h === "string" ? h : "");
        let isSub = false;

        if (hasExplicitTags) {
            if (text.startsWith("[SUBPROJECT]")) {
                isSub = true;
                text = text.substring(12);
            } else if (text.startsWith("\\[SUBPROJECT\\]")) {
                isSub = true;
                text = text.substring(14);
            }
        } else {
            isSub = isSubProjectHighlight(text);
        }

        if (isSub) {
            currentGroup = { subproject: text, bullets: [] };
            groups.push(currentGroup);
        } else {
            currentGroup.bullets.push(text);
        }
    });

    const filteredGroups = groups.filter(g => g.subproject !== null || g.bullets.length > 0);
    if (filteredGroups.length === 0) {
        filteredGroups.push({ subproject: null, bullets: [] });
    }

    filteredGroups.forEach(g => {
        html += `<div class="subproject-group" style="position:relative;margin-bottom:12px;">`;
        if (g.subproject !== null) {
            html += `<div class="entry-subproject"><span contenteditable="true" style="flex:1;outline:none;">${g.subproject}</span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove subproject">&times;</button></div>`;
        }
        
        html += `<ul class="entry-highlights" style="padding-left:var(--paper-bullet-indent);font-size:calc(var(--paper-body-size) * 0.95);display:flex;flex-direction:column;gap:2px;">`;
        g.bullets.forEach(bullet => {
            html += `<li style="display:flex;align-items:baseline;gap:4px;"><span class="bullet-dot" style="margin-right:8px;color:var(--paper-ink);opacity:0.8;user-select:none;">•</span><span contenteditable="true" style="flex:1;">${linkify(bullet)}</span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove bullet">&times;</button></li>`;
        });
        html += `</ul>`;
        
        html += `
        <div class="highlight-controls" style="display: flex; gap: 8px; align-items: center; margin-top: 4px; margin-bottom: 8px;">
            <button class="add-entry-btn" onclick="addHighlight(this)">+ Add bullet</button>
            <button class="add-entry-btn" onclick="addSubProject(this)">+ Add subproject</button>
        </div>`;
        html += `</div>`;
    });

    return html;
}


// ── Paper sheet renderer ──────────────────────────────────────────────────────
function renderPaperSheet(jsonObj, docType) {
    const isCV  = docType === "cv" && jsonObj.cv;
    const isDoc = !isCV && jsonObj.document;
    const data  = isCV ? jsonObj.cv : (isDoc ? jsonObj.document : null);
    if (!data) {
        paperSheet.innerHTML = `<div style="color:red;padding:20px;">Unrecognised YAML structure.</div>`;
        return;
    }

    const sections = data.sections || {};

    // ── Header ─────────────────────────────────────────────────────────────
    let html = `<div style="text-align:right;font-size:0.75rem;color:#999;font-style:italic;margin-bottom:6px;">
        Last updated in ${(() => {
            const d = state.activeVersion?.date ? new Date(state.activeVersion.date + "T00:00:00") : new Date();
            return d.toLocaleString("en", {month:"long"}) + " " + d.getFullYear();
        })()}
    </div>`;

    if (isCV) {
        html += `
        <div style="text-align:center;margin-bottom:14px;">
            <h1 style="font-size: var(--paper-name-size); font-weight: bold; color: var(--paper-name-color); margin: 0; display: inline-block;">
                <span id="paperName" contenteditable="true" data-placeholder="Your Name">${data.name || ""}</span>
            </h1>
        </div>
        <div id="paperContact" style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:22px;font-size:0.84rem;color:var(--paper-ink);opacity:0.85;">
            <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:18px;align-items:center;">
                ${data.location ? `<span style="display:inline-flex;align-items:center;gap:4px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--paper-ink)" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span id="paperLocation" contenteditable="true">${data.location}</span>
                </span>` : ""}
                ${data.email ? `<span style="display:inline-flex;align-items:center;gap:4px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--paper-ink)" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span id="paperEmail" contenteditable="true">${data.email}</span>
                </span>` : ""}
                ${data.phone ? `<span style="display:inline-flex;align-items:center;gap:4px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--paper-ink)" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    <span id="paperPhone" contenteditable="true">${data.phone}</span>
                </span>` : ""}
                <span id="paperSocialContainer"></span>
            </div>
            ${data.website ? `<div style="display:flex;align-items:center;gap:4px;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--paper-ink)" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span id="paperWebsite" contenteditable="true" style="color:inherit;">${data.website}</span>
            </div>` : ""}
        </div>`;
    } else {
        // Non-CV: just a centred title
        const typeLabel = DOC_META[docType]?.label || docType;
        html += `
        <div style="text-align:center;margin-bottom:6px;">
            <div style="font-size:0.75rem;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">${typeLabel}</div>
            <h1 style="font-size: var(--paper-name-size); font-weight: bold; color: var(--paper-name-color); margin: 0; display: inline-block;">
                <span id="paperDocTitle" contenteditable="true" data-placeholder="${typeLabel}">${data.title || ""}</span>
            </h1>
            <div style="font-size:0.85rem;color:var(--paper-ink);opacity:0.8;margin-top:6px;">
                <span id="paperDocAuthor" contenteditable="true" data-placeholder="Author Name">${data.author || ""}</span>
            </div>
            ${(docType === "brand" || data.tagline) ? `
            <div style="font-size:0.85rem;font-style:italic;color:#6b7280;margin-top:6px;">
                <span id="paperDocTagline" contenteditable="true" data-placeholder="Tagline / Motto">${data.tagline || ""}</span>
            </div>` : ""}
        </div>`;
        html += `<div style="border-bottom: var(--paper-rule-height) solid var(--paper-rule-color); margin: 14px 0 20px; opacity: var(--paper-rule-opacity);"></div>`;
    }

    // ── Sections ───────────────────────────────────────────────────────────
    html += `<div id="paperSections">`;
    for (const name in sections) {
        const content = sections[name];
        if (!content) continue;

        if (name === "Summary") {
            const summaryText = Array.isArray(content) ? content.join("\n") : content;
            html += `<div class="resume-section" data-section-name="Summary" data-section-type="summary">
                <h2><span class="title-text">Summary</span><span class="title-line"></span><button class="section-remove-btn" onclick="removeSection(this)" title="Remove section">&times;</button></h2>
                <div class="section-summary-text" contenteditable="true" data-placeholder="Write your professional summary here..." style="color:var(--paper-ink);white-space:pre-line;min-height:20px;font-size:var(--paper-body-size);margin-top:4px;">${linkify(summaryText)}</div>
            </div>`;
        } else if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object" && content[0].label !== undefined) {
            html += `<div class="resume-section" data-section-name="${name}" data-section-type="labels">
                <h2><span class="title-text">${name}</span><span class="title-line"></span><button class="section-remove-btn" onclick="removeSection(this)" title="Remove section">&times;</button></h2>
                <div style="color:var(--paper-ink);display:flex;flex-direction:column;gap:3px;font-size:var(--paper-body-size);margin-top:4px;">`;
            content.forEach(item => {
                html += `<div class="label-item" style="margin-bottom:2px;display:flex;align-items:baseline;gap:4px;">
                    <strong contenteditable="true" data-placeholder="Label">${item.label || ""}</strong>: <span contenteditable="true" data-placeholder="Details">${linkify(item.details || "")}</span>
                    <button class="item-remove-btn" onclick="removeItem(this)" title="Remove row">&times;</button>
                </div>`;
            });
            html += `</div>
                <button class="add-entry-btn" onclick="addLabelEntry(this,'${name}')">+ Add row</button>
            </div>`;
        } else if (Array.isArray(content) && content.length > 0 && (typeof content[0] === "string" || (typeof content[0] === "object" && content[0].bullet !== undefined))) {
            html += `<div class="resume-section" data-section-name="${name}" data-section-type="bullets">
                <h2><span class="title-text">${name}</span><span class="title-line"></span><button class="section-remove-btn" onclick="removeSection(this)" title="Remove section">&times;</button></h2>
                <ul style="padding-left:var(--paper-bullet-indent);color:var(--paper-ink);font-size:var(--paper-body-size);margin-top:4px;">`;
            content.forEach(item => {
                const txt = typeof item === "object" && item.bullet ? item.bullet : (typeof item === "string" ? item : "");
                html += `<li style="margin-bottom:4px;display:flex;align-items:baseline;gap:4px;"><span class="bullet-dot" style="margin-right:8px;color:var(--paper-ink);opacity:0.8;user-select:none;">•</span><span contenteditable="true" data-placeholder="Bullet item details" style="flex:1;">${linkify(txt)}</span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove bullet">&times;</button></li>`;
            });
            html += `</ul>
                <button class="add-entry-btn" onclick="addBulletEntry(this,'${name}')">+ Add bullet</button>
            </div>`;
        } else {
            html += `<div class="resume-section" data-section-name="${name}" data-section-type="entries">
                <h2><span class="title-text">${name}</span><span class="title-line"></span><button class="section-remove-btn" onclick="removeSection(this)" title="Remove section">&times;</button></h2>
                <div class="entries-list" style="display:flex;flex-direction:column;gap:12px;margin-top:4px;">`;
            if (Array.isArray(content)) {
                content.forEach(entry => {
                    const isEducation = name.toLowerCase().includes("education");
                    const company  = entry.company || entry.institution || entry.organization || entry.name || entry.title || "";
                    let position = entry.position || "";
                    if (!position) {
                        if (isEducation) {
                            position = entry.area || "";
                        } else {
                            position = entry.degree || entry.area || entry.journal || "";
                        }
                    }
                    if (!position && entry.authors) position = entry.authors.join(", ");
                    const dStart = entry.start_date || entry.date || "";
                    const dEnd   = entry.end_date || "";
                    const fmtStart = formatDate(dStart);
                    const fmtEnd   = formatDate(dEnd);
                    const dates  = fmtStart + (fmtEnd ? ` – ${fmtEnd}` : "");
                    const location = entry.location || "";
                    const highlights = entry.highlights || [];
                    const degree = isEducation && entry.degree ? entry.degree : "";
                    if (isEducation) {
                        html += `<div class="entry-item" style="margin-bottom:16px;font-size:var(--paper-body-size);color:var(--paper-ink);position:relative;">
                            <div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:bold;margin-bottom:2px;">
                                <span class="entry-company" contenteditable="true" data-placeholder="University / School" style="outline:none;">${company}</span>
                                <span class="entry-location" contenteditable="true" data-placeholder="Location (e.g. City, Country)" style="font-weight:normal;font-style:italic;outline:none;">${location}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:0.9em;margin-bottom:6px;">
                                <div style="display:flex;gap:4px;align-items:baseline;">
                                    <strong class="entry-degree" contenteditable="true" data-placeholder="Degree (e.g. B-Tech)" style="outline:none;min-height:1.2em;font-weight:bold;">${degree}</strong><span> in </span>
                                    <span class="entry-position" contenteditable="true" data-placeholder="Field of Study (e.g. E&C)" style="font-style:italic;outline:none;">${position}</span>
                                </div>
                                <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;">
                                    <span class="entry-dates" contenteditable="true" data-placeholder="Dates" data-start="${dStart}" data-end="${dEnd}" style="outline:none;font-weight:bold;">${dates}</span>
                                    ${dStart ? `<span class="entry-duration" style="font-size:0.8em;opacity:0.7;font-weight:normal;">${calcDuration(dStart, dEnd)}</span>` : ""}
                                </div>
                            </div>
                            <button class="item-remove-btn entry-block-remove" onclick="removeItem(this)" title="Remove entry block">&times;</button>
                            <div class="entry-highlights-container" style="margin-top:4px;">
                                ${renderHighlightsHtml(highlights)}
                            </div>
                        </div>`;
                    } else {
                        html += `<div class="entry-item" style="margin-bottom:16px;font-size:var(--paper-body-size);color:var(--paper-ink);position:relative;">
                            <div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:bold;margin-bottom:2px;">
                                <span class="entry-company" contenteditable="true" data-placeholder="Company / Organization" style="outline:none;">${company}</span>
                                <span class="entry-location" contenteditable="true" data-placeholder="Location" style="font-weight:normal;font-style:italic;outline:none;">${location}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:0.9em;margin-bottom:6px;">
                                <span class="entry-position" contenteditable="true" data-placeholder="Position / Role" style="font-style:italic;outline:none;">${position}</span>
                                <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;">
                                    <span class="entry-dates" contenteditable="true" data-placeholder="Dates" data-start="${dStart}" data-end="${dEnd}" style="outline:none;font-weight:bold;">${dates}</span>
                                    ${dStart ? `<span class="entry-duration" style="font-size:0.8em;opacity:0.7;font-weight:normal;">${calcDuration(dStart, dEnd)}</span>` : ""}
                                </div>
                            </div>
                            <button class="item-remove-btn entry-block-remove" onclick="removeItem(this)" title="Remove entry block">&times;</button>
                            <div class="entry-highlights-container" style="margin-top:4px;">
                                ${renderHighlightsHtml(highlights)}
                            </div>
                        </div>`;
                    }
                });
            }
            html += `</div>
                <button class="add-entry-btn" onclick="addEntryBlock(this, '${name}')" style="margin-top:8px;">+ Add entry block</button>
            </div>`;
        }
    }
    html += `</div>`; // closes paperSections

    // Add New Section Button
    html += `<div style="text-align: center; margin-top: 24px; margin-bottom: 24px;">
        <button class="btn-ghost-xs" onclick="promptAddSection()" style="font-size: 0.8rem; padding: 6px 12px; border: 1px dashed var(--border-light); border-radius: 6px;">+ Add New Section</button>
    </div>`;

    paperSheet.innerHTML = html;


    // Social networks (CV only)
    const socialContainer = document.getElementById("paperSocialContainer");
    if (isCV && socialContainer && data.social_networks) {
        data.social_networks.forEach((net, i) => {
            const span = document.createElement("span");
            span.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
            span.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--paper-ink)" stroke-width="2.5"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                <span id="paperSocial_${i}" class="paper-social" data-network="${net.network || "LinkedIn"}" contenteditable="true">${net.username || ""}</span>`;
            socialContainer.appendChild(span);
        });
    }

    paperSheet.addEventListener("input", e => {
        markDirty();
        if (e.target.id === "paperDocTitle" || e.target.id === "paperName") {
            const newTitle = e.target.innerText.trim();
            if (state.activeVersion) {
                state.activeVersion.title = newTitle;
            }
            if (state.activeJson) {
                const isCV = state.activeDocType === "cv" && state.activeJson.cv;
                const key = isCV ? "cv" : "document";
                if (state.activeJson[key]) {
                    if (isCV) {
                        state.activeJson[key].name = newTitle;
                    } else {
                        state.activeJson[key].title = newTitle;
                    }
                }
            }
            // Update top-bar title live as the user types
            activeCvTitle.textContent = newTitle || (state.activeVersion ? state.activeVersion.slug.replace(/-/g, " ") : "");

            const activeCard = timelineList.querySelector(".timeline-card.active");
            if (activeCard) {
                const cardTitle = activeCard.querySelector(".card-title");
                if (cardTitle) {
                    const isChild = cardTitle.textContent.startsWith("└ ");
                    const fallback = state.activeVersion ? state.activeVersion.slug.replace(/-/g, " ") : "";
                    cardTitle.textContent = (isChild ? "└ " : "") + (newTitle || fallback);
                }
            }
        } else if (e.target.id === "paperLocation") {
            const newLoc = e.target.innerText.trim();
            if (state.activeVersion) {
                state.activeVersion.location = newLoc;
            }
            if (state.activeJson && state.activeJson.cv) {
                state.activeJson.cv.location = newLoc;
            }
            // Update top-bar location live as the user types
            if (newLoc) {
                activeCvLocation.style.display = "inline-flex";
                activeCvLocation.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${newLoc}`;
            } else {
                activeCvLocation.style.display = "none";
                activeCvLocation.innerHTML = "";
            }
        }
        // Mirroring entry-degree to entry-position removed to allow independent editing of degree and area/field of study.
    });
}

// ── Add entry helpers ─────────────────────────────────────────────────────────
window.addBulletEntry = (btn, sn) => {
    pushUndo();
    const ul = btn.previousElementSibling;
    const li = document.createElement("li");
    li.style.cssText = "margin-bottom:4px;display:flex;align-items:baseline;gap:4px;";
    li.innerHTML = `<span class="bullet-dot" style="margin-right:8px;color:var(--paper-ink);opacity:0.8;user-select:none;">•</span><span contenteditable="true" style="flex:1;"></span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove bullet">&times;</button>`;
    ul.appendChild(li); li.querySelector("span").focus(); markDirty();
};
window.addLabelEntry = (btn, sn) => {
    pushUndo();
    const container = btn.previousElementSibling;
    const div = document.createElement("div"); div.className = "label-item";
    div.style.cssText = "margin-bottom:2px;display:flex;align-items:baseline;gap:4px;";
    div.innerHTML = `<strong contenteditable="true"></strong>: <span contenteditable="true"></span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove row">&times;</button>`;
    container.appendChild(div);
    const strong = div.querySelector("strong");
    if (strong) strong.focus();
    markDirty();
};
window.addHighlight = btn => {
    pushUndo();
    const container = btn.closest(".entry-highlights-container");
    if (!container) return;
    
    // Check if the element immediately preceding the buttons wrapper is a highlights list
    const btnWrapper = btn.parentElement;
    const prevEl = btnWrapper.previousElementSibling;
    
    let ul = null;
    if (prevEl && prevEl.classList.contains("entry-highlights")) {
        ul = prevEl;
    } else {
        // The preceding element is a sub-project or empty. Create a new list structure.
        ul = document.createElement("ul");
        ul.className = "entry-highlights";
        ul.style.cssText = "padding-left:var(--paper-bullet-indent);font-size:calc(var(--paper-body-size) * 0.95);display:flex;flex-direction:column;gap:2px;";
        container.insertBefore(ul, btnWrapper);
    }
    
    const li = document.createElement("li");
    li.style.cssText = "display:flex;align-items:baseline;gap:4px;";
    li.innerHTML = `<span class="bullet-dot" style="margin-right:8px;color:var(--paper-ink);opacity:0.8;user-select:none;">•</span><span contenteditable="true" style="flex:1;outline:none;"></span><button class="item-remove-btn" onclick="removeItem(this)" title="Remove bullet">&times;</button>`;
    ul.appendChild(li);
    const span = li.querySelector("span[contenteditable]");
    if (span) span.focus();
    markDirty();
};

window.addSubProject = btn => {
    pushUndo();
    const container = btn.closest(".entry-highlights-container");
    if (!container) return;
    
    const currentGroup = btn.closest(".subproject-group");
    if (!currentGroup) return;
    
    // Create a new subproject group container
    const nextGroup = document.createElement("div");
    nextGroup.className = "subproject-group";
    nextGroup.style.cssText = "position:relative;margin-bottom:12px;";
    
    nextGroup.innerHTML = `
        <div class="entry-subproject">
            <span contenteditable="true" style="flex:1;outline:none;"></span>
            <button class="item-remove-btn" onclick="removeItem(this)" title="Remove subproject" style="margin-left:8px;">&times;</button>
        </div>
        <ul class="entry-highlights" style="padding-left:var(--paper-bullet-indent);font-size:calc(var(--paper-body-size) * 0.95);display:flex;flex-direction:column;gap:2px;"></ul>
        <div class="highlight-controls" style="display: flex; gap: 8px; align-items: center; margin-top: 4px; margin-bottom: 8px;">
            <button class="add-entry-btn" onclick="addHighlight(this)">+ Add bullet</button>
            <button class="add-entry-btn" onclick="addSubProject(this)">+ Add subproject</button>
        </div>
    `;
    
    container.insertBefore(nextGroup, currentGroup.nextSibling);
    
    const span = nextGroup.querySelector(".entry-subproject span[contenteditable]");
    if (span) span.focus();
    markDirty();
};

window.addEntryBlock = (btn, sn) => {
    const list = btn.previousElementSibling;
    const div = document.createElement("div"); 
    div.className = "entry-item";
    div.style.cssText = "margin-bottom:16px;font-size:var(--paper-body-size);color:var(--paper-ink);position:relative;";
    
    const isEducation = sn && sn.toLowerCase().includes("education");
    
    if (isEducation) {
        div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:bold;margin-bottom:2px;">
                <span class="entry-company" contenteditable="true" data-placeholder="University / School" style="outline:none;"></span>
                <span class="entry-location" contenteditable="true" data-placeholder="Location (e.g. City, Country)" style="font-weight:normal;font-style:italic;outline:none;"></span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:0.9em;margin-bottom:6px;">
                <div style="display:flex;gap:4px;align-items:baseline;">
                    <strong class="entry-degree" contenteditable="true" data-placeholder="Degree (e.g. B-Tech)" style="outline:none;min-height:1.2em;font-weight:bold;"></strong><span> in </span>
                    <span class="entry-position" contenteditable="true" data-placeholder="Field of Study (e.g. E&C)" style="font-style:italic;outline:none;"></span>
                </div>
                <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;">
                    <span class="entry-dates" contenteditable="true" data-placeholder="Dates" data-start="2026-01" data-end="present" style="outline:none;font-weight:bold;">2026-01 – present</span>
                </div>
            </div>
            <button class="item-remove-btn entry-block-remove" onclick="removeItem(this)" title="Remove entry block">&times;</button>
            <div class="entry-highlights-container" style="margin-top:4px;">
                ${renderHighlightsHtml([])}
            </div>`;
    } else {
        div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;font-weight:bold;margin-bottom:2px;">
                <span class="entry-company" contenteditable="true" data-placeholder="Company / Organization" style="outline:none;"></span>
                <span class="entry-location" contenteditable="true" data-placeholder="Location" style="font-weight:normal;font-style:italic;outline:none;"></span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:0.9em;margin-bottom:6px;">
                <span class="entry-position" contenteditable="true" data-placeholder="Position / Role" style="font-style:italic;outline:none;"></span>
                <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;">
                    <span class="entry-dates" contenteditable="true" data-placeholder="Dates" data-start="2026-01" data-end="present" style="outline:none;font-weight:bold;">2026-01 – present</span>
                </div>
            </div>
            <button class="item-remove-btn entry-block-remove" onclick="removeItem(this)" title="Remove entry block">&times;</button>
            <div class="entry-highlights-container" style="margin-top:4px;">
                ${renderHighlightsHtml([])}
            </div>`;
    }
    pushUndo();
    list.appendChild(div);
    const focusEl = isEducation ? div.querySelector(".entry-degree") : div.querySelector(".entry-company");
    if (focusEl) focusEl.focus();
    markDirty();
};

window.promptAddSection = async () => {
    const res = await showAddSectionModal();
    if (!res) return;
    const { name, type: typeStr } = res;
    
    let newContent = [];
    if (typeStr === "2") {
        newContent = [""];
    } else if (typeStr === "3") {
        newContent = [{ label: "", details: "" }];
    } else {
        newContent = []; // Entries
    }
    
    if (state.activeJson) {
        const key = (state.activeDocType === "cv" && state.activeJson.cv) ? "cv" : "document";
        if (!state.activeJson[key].sections) state.activeJson[key].sections = {};
        state.activeJson[key].sections[name.trim()] = newContent;
        renderPaperSheet(state.activeJson, state.activeDocType);
        markDirty();
    }
};

window.removeSection = async (btn) => {
    const sec = btn.closest(".resume-section");
    if (!sec) return;
    const name = sec.getAttribute("data-section-name");
    const ok = await showConfirm(
        "Remove Section?",
        `Remove section "${name}"? This will delete it when you save.`,
        true
    );
    if (!ok) return;
    pushUndo();
    if (state.activeJson) {
        const key = (state.activeDocType === "cv" && state.activeJson.cv) ? "cv" : "document";
        if (state.activeJson[key].sections) {
            delete state.activeJson[key].sections[name];
        }
        renderPaperSheet(state.activeJson, state.activeDocType);
        markDirty();
    }
};

window.removeItem = (btn) => {
    const item = btn.parentElement;
    if (!item) return;
    pushUndo();
    
    // If we are removing a subproject header, we remove the entire group (header, bullets, controls)
    if (item.classList.contains("entry-subproject")) {
        const group = item.closest(".subproject-group");
        if (group) {
            const container = group.parentElement;
            group.remove();
            
            // If the highlights section is now empty of groups, add back a single empty base group
            if (container.querySelectorAll(".subproject-group").length === 0) {
                const emptyGroup = document.createElement("div");
                emptyGroup.className = "subproject-group";
                emptyGroup.style.cssText = "position:relative;margin-bottom:12px;";
                emptyGroup.innerHTML = `
                    <ul class="entry-highlights" style="padding-left:var(--paper-bullet-indent);font-size:calc(var(--paper-body-size) * 0.95);display:flex;flex-direction:column;gap:2px;"></ul>
                    <div class="highlight-controls" style="display: flex; gap: 8px; align-items: center; margin-top: 4px; margin-bottom: 8px;">
                        <button class="add-entry-btn" onclick="addHighlight(this)">+ Add bullet</button>
                        <button class="add-entry-btn" onclick="addSubProject(this)">+ Add subproject</button>
                    </div>
                `;
                container.appendChild(emptyGroup);
            }
            markDirty();
            return;
        }
    }
    
    item.remove();
    markDirty();
};

// ── Serializer ────────────────────────────────────────────────────────────────
function serializeSheet() {
    if (!state.activeJson) return null;
    const type   = state.activeDocType;
    const isCV   = type === "cv" && state.activeJson.cv;
    const key    = isCV ? "cv" : "document";
    const data   = state.activeJson[key];

    const getElText = id => { const el = document.getElementById(id); return el ? el.innerText.trim() : ""; };
    const getText   = (parent, sel) => { const el = parent.querySelector(sel); return el ? el.innerText.trim() : ""; };

    if (isCV) {
        data.name     = getElText("paperName");
        data.location = getElText("paperLocation");
        data.email    = getElText("paperEmail");
        data.phone    = getElText("paperPhone");
        data.website  = getElText("paperWebsite");
        
        if (!data.location) delete data.location;
        if (!data.email) delete data.email;
        if (!data.phone) delete data.phone;
        if (!data.website) delete data.website;
        const socialSpans = document.querySelectorAll(".paper-social");
        if (socialSpans.length && data.social_networks) {
            data.social_networks = Array.from(socialSpans).map(s => ({ network: s.dataset.network, username: s.innerText.trim() }));
        }
    } else {
        const titleEl = document.getElementById("paperDocTitle");
        const authEl  = document.getElementById("paperDocAuthor");
        const tagEl   = document.getElementById("paperDocTagline");
        if (titleEl) data.title  = titleEl.innerText.trim();
        if (authEl)  data.author = authEl.innerText.trim();
        if (tagEl) {
            data.tagline = tagEl.innerText.trim();
            if (!data.tagline) delete data.tagline;
        }
    }

    document.querySelectorAll(".resume-section").forEach(sec => {
        const name = sec.getAttribute("data-section-name");
        const stype = sec.getAttribute("data-section-type");

        if (stype === "summary") {
            data.sections[name] = getText(sec, ".section-summary-text").split("\n").map(l => l.trim()).filter(Boolean);
        } else if (stype === "bullets") {
            data.sections[name] = Array.from(sec.querySelectorAll("ul li"))
                .map(li => { const sp = li.querySelector("span[contenteditable]"); return { bullet: sp ? sp.innerText.trim() : li.innerText.trim() }; }).filter(b => b.bullet);
        } else if (stype === "labels") {
            data.sections[name] = Array.from(sec.querySelectorAll(".label-item")).map(item => {
                const s = getText(item, "strong");
                return { label: s.endsWith(":") ? s.slice(0,-1).trim() : s, details: getText(item, "span") };
            });
        } else if (stype === "entries") {
            const orig = (state.activeJson[key].sections[name] || []);
            data.sections[name] = Array.from(sec.querySelectorAll(".entry-item")).map((item, idx) => {
                const o = orig[idx] || {};
                const company  = getText(item, ".entry-company");
                const position = getText(item, ".entry-position");
                const location = getText(item, ".entry-location");
                const datesEl  = item.querySelector(".entry-dates");
                const dates    = datesEl ? datesEl.innerText.trim() : "";
                const degreeEl = item.querySelector(".entry-degree");
                const degree   = degreeEl ? degreeEl.innerText.trim() : "";
                const highlightsContainer = item.querySelector(".entry-highlights-container");
                let highlights = [];
                if (highlightsContainer) {
                    const children = highlightsContainer.querySelectorAll(".entry-subproject, .entry-highlights li");
                    highlights = Array.from(children).map(el => {
                        const isSub = el.classList.contains("entry-subproject");
                        const sp = el.querySelector("span[contenteditable]");
                        const val = sp ? sp.innerText.trim() : el.innerText.replace(/[\u2022\u25cf\u00d7]/g, "").trim();
                        if (isSub) {
                            return "[SUBPROJECT]" + val;
                        }
                        return val;
                    }).filter(Boolean);
                } else {
                    highlights = Array.from(item.querySelectorAll(".entry-highlights li")).map(li => {
                        const sp = li.querySelector("span[contenteditable]");
                        return sp ? sp.innerText.trim() : li.innerText.replace(/[\u2022\u25cf\u00d7]/g, "").trim();
                    }).filter(Boolean);
                }
                // Parse dates dynamically from text input
                let rawStart = dates;
                let rawEnd = "";
                for (const sp of [" – ", " - ", " to "]) {
                    if (dates.includes(sp)) {
                        [rawStart, rawEnd] = dates.split(sp).map(s => s.trim());
                        break;
                    }
                }
                const start_date = parseDateToYMD(rawStart);
                const end_date   = parseDateToYMD(rawEnd);
                const entry = Object.assign({}, o, { highlights });
                const isEducation = name.toLowerCase().includes("education");
                
                if (o.title !== undefined) { entry.title = company; if (o.journal !== undefined) entry.journal = position; else entry.authors = [position]; }
                else if (o.name !== undefined) { entry.name = company; entry.position = position; }
                else if (o.institution !== undefined) { 
                    entry.institution = company; 
                    entry.area = position;
                }
                else if (o.organization !== undefined) { entry.organization = company; entry.position = position; }
                else if (o.company !== undefined) { entry.company = company; entry.position = position; }
                else {
                    if (isEducation) { entry.institution = company; entry.area = position; }
                    else if (name.toLowerCase().includes("publication")) { entry.title = company; entry.authors = [position]; }
                    else if (name.toLowerCase().includes("award")) { entry.name = company; entry.position = position; }
                    else { entry.company = company; entry.position = position; }
                }

                if (isEducation) {
                    if (degree) entry.degree = degree;
                    else delete entry.degree;
                    
                    if (position) entry.area = position;
                    else delete entry.area;
                }

                if (o.date !== undefined && !end_date) { entry.date = start_date; }
                else {
                    if (start_date) entry.start_date = start_date;
                    if (end_date) entry.end_date = end_date;
                }
                if (location) entry.location = location;

                if (entry.start_date === "") delete entry.start_date;
                if (entry.end_date === "") delete entry.end_date;
                if (entry.date === "") delete entry.date;
                if (entry.location === "") delete entry.location;
                if (entry.position === "") delete entry.position;
                if (entry.company === "") delete entry.company;
                
                const lowerName = name.toLowerCase();
                if (lowerName.includes("publication")) {
                    delete entry.start_date; delete entry.end_date; delete entry.location; delete entry.position; delete entry.company;
                } else if (lowerName.includes("award")) {
                    delete entry.start_date; delete entry.end_date; delete entry.position; delete entry.company;
                } else if (lowerName.includes("education")) {
                    delete entry.position; delete entry.company;
                }
                return entry;
            });
        }
    });

    return state.activeJson;
}

// ── Submissions ───────────────────────────────────────────────────────────────
function renderSubmissions() {
    submissionList.innerHTML = "";
    if (!state.activeVersion) {
        submissionCountBadge.textContent = "0";
        return;
    }

    const docType = state.activeDocType;
    const subs = docType === "notes" ? (state.activeVersion.linked_to || []) : (state.activeVersion.submissions || []);
    submissionCountBadge.textContent = subs.length;
    
    // Manage addSubmissionForm visibility
    const addSubForm = document.getElementById("addSubmissionForm");
    if (addSubForm) {
        addSubForm.style.display = "flex";
    }

    if (!subs.length && docType !== "notes") {
        submissionList.innerHTML = `<div style="font-size:0.72rem;color:var(--text-3);padding:4px 0;">None yet.</div>`;
        return;
    }

    const notes = state.versions["notes"] || [];
    
    subs.forEach(s => {
        const el = document.createElement("div");
        el.className = "submission-item-row";

        const label = document.createElement("span");
        label.textContent = s;
        label.title = s;
        if (docType !== "notes") {
            label.style.cursor = "pointer";
            label.style.textDecoration = "underline";
            label.style.textDecorationColor = "var(--border-light)";
            label.addEventListener("click", () => openSubmissionDetails(s));
        }
        el.appendChild(label);

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.alignItems = "center";
        actions.style.gap = "4px";
        el.appendChild(actions);

        if (docType === "notes") {
            const jumpBtn = document.createElement("button");
            jumpBtn.className = "submission-action-btn";
            jumpBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
            jumpBtn.title = "Jump to linked document";
            jumpBtn.addEventListener("click", () => findAndJumpToSubmission(s));
            actions.appendChild(jumpBtn);

            const unlinkBtn = document.createElement("button");
            unlinkBtn.className = "submission-action-btn danger";
            unlinkBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`;
            unlinkBtn.title = "Disconnect Note";
            unlinkBtn.addEventListener("click", async () => {
                try {
                    await api.unlinkNote(state.activeVersion.filename, s);
                    showToast("Disconnected submission", "success");
                    await loadVersions("notes");
                    const refreshed = (state.versions["notes"] || []).find(n => n.filename === state.activeVersion.filename);
                    if (refreshed) { state.activeVersion = refreshed; renderSubmissions(); }
                } catch (err) {
                    showToast("Could not disconnect", "error");
                }
            });
            actions.appendChild(unlinkBtn);
        } else {
            const linkedNoteFile = state.activeVersion?.submission_links?.[s];
            if (linkedNoteFile) {
                const noteVer = notes.find(n => n.filename === linkedNoteFile);
                const noteTitle = noteVer ? (noteVer.title || noteVer.slug.replace(/-/g, " ")) : linkedNoteFile;

                const badge = document.createElement("button");
                badge.className = "submission-action-btn";
                badge.style.padding = "4px 8px";
                badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> <span class="linked-note-title" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${noteTitle}</span>`;
                badge.title = "Jump to linked Note: " + noteTitle;
                badge.addEventListener("click", () => jumpToDocument("notes", linkedNoteFile));
                actions.appendChild(badge);

                const unlinkBtn = document.createElement("button");
                unlinkBtn.className = "submission-action-btn danger";
                unlinkBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`;
                unlinkBtn.title = "Disconnect Note";
                unlinkBtn.addEventListener("click", async () => {
                    try {
                        await api.unlinkNote(linkedNoteFile, s);
                        showToast("Unlinked Note", "success");
                        await loadVersions(state.activeDocType);
                        await loadVersions("notes");
                        const refreshed = (state.versions[state.activeDocType] || []).find(v => v.filename === state.activeVersion.filename);
                        if (refreshed) {
                            state.activeVersion = refreshed;
                        }
                        renderSubmissions();
                    } catch(e) {
                        showToast("Failed to unlink", "error");
                    }
                });
                actions.appendChild(unlinkBtn);
            } else {
                const linkBtn = document.createElement("button");
                linkBtn.className = "submission-action-btn";
                linkBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
                linkBtn.title = "Link a note";

                const select = document.createElement("select");
                select.className = "modal-sel sm";
                select.style.fontSize = "0.7rem";
                select.style.padding = "2px";
                select.style.display = "none";
                select.style.maxWidth = "110px";

                const unlinkedNotes = notes.filter(n => !n.linked_to || n.linked_to.length === 0);
                select.innerHTML = '<option value="">-- Choose --</option>' +
                    unlinkedNotes.map(n => `<option value="${n.filename}">${n.date} — ${(n.title || n.slug.replace(/-/g, " "))}</option>`).join("");

                linkBtn.addEventListener("click", () => {
                    linkBtn.style.display = "none";
                    select.style.display = "inline-block";
                    select.focus();
                });

                select.addEventListener("change", async () => {
                    const noteFile = select.value;
                    if (!noteFile) {
                        select.style.display = "none";
                        linkBtn.style.display = "inline-block";
                        return;
                    }
                    try {
                        await api.linkNote(noteFile, s);
                        showToast("Linked note successfully", "success");
                        await loadVersions("notes");
                        await loadVersions(state.activeDocType);
                        const refreshed = (state.versions[state.activeDocType] || []).find(v => v.filename === state.activeVersion.filename);
                        if (refreshed) {
                            state.activeVersion = refreshed;
                            renderSubmissions();
                        }
                    } catch (err) {
                        showToast("Link failed", "error");
                    }
                });

                select.addEventListener("blur", () => {
                    setTimeout(() => {
                        if (select.style.display !== "none" && !select.value) {
                            select.style.display = "none";
                            linkBtn.style.display = "inline-block";
                        }
                    }, 200);
                });

                actions.appendChild(linkBtn);
                actions.appendChild(select);
            }
        }
        if (docType !== "notes") {
            const removeBtn = document.createElement("button");
            removeBtn.className = "submission-action-btn danger";
            removeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
            removeBtn.title = "Remove submission from document";
            removeBtn.style.marginLeft = "4px";
            removeBtn.addEventListener("click", async () => {
                const ok = await showConfirm("Remove Submission", `Remove "${s}"?`, true);
                if (!ok) return;
                try {
                    await api.removeSubmission(state.activeDocType, state.activeVersion.filename, s);
                    showToast("Removed submission", "success");
                    await loadVersions(state.activeDocType);
                    const refreshed = (state.versions[state.activeDocType] || []).find(v => v.filename === state.activeVersion.filename);
                    if (refreshed) { state.activeVersion = refreshed; renderSubmissions(); renderTimeline(state.activeDocType); }
                } catch (err) {
                    showToast("Could not remove", "error");
                }
            });
            actions.appendChild(removeBtn);
        }
        submissionList.appendChild(el);
    });

    if (docType === "notes") {
        if (!subs.length) {
            const emptyEl = document.createElement("div");
            emptyEl.style.cssText = "font-size:0.72rem;color:var(--text-3);padding:4px 0;";
            emptyEl.textContent = "None yet.";
            submissionList.appendChild(emptyEl);

            const linkContainer = document.createElement("div");
            linkContainer.style.cssText = "margin-top:10px;";
            
            const linkBtn = document.createElement("button");
            linkBtn.className = "btn-ghost-xs";
            linkBtn.style.cssText = "font-size:0.75rem;padding:6px;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--text-muted);border:1px dashed var(--border-light);border-radius:8px;background:none;cursor:pointer;transition:var(--transition-fast);";
            linkBtn.onmouseover = () => { linkBtn.style.color = "var(--text-main)"; linkBtn.style.borderColor = "var(--text-muted)"; };
            linkBtn.onmouseout = () => { linkBtn.style.color = "var(--text-muted)"; linkBtn.style.borderColor = "var(--border-light)"; };
            linkBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Link Submission`;
            
            const select = document.createElement("select");
            select.className = "modal-sel sm";
            select.style.cssText = "font-size:0.75rem;padding:4px;display:none;width:100%;margin-top:4px;";
            
            linkBtn.addEventListener("click", async () => {
                linkBtn.style.display = "none";
                select.style.display = "block";
                select.innerHTML = "<option value=''>-- Loading submissions... --</option>";
                try {
                    const allSubs = await api.fetchAllSubmissions();
                    const linksData = await api.getAllLinks().catch(() => ({ links: [] }));
                    const linkedSubs = new Set(linksData.links.map(l => l.submission));
                    
                    const availableSubs = allSubs.filter(s => !linkedSubs.has(s.submission));
                    
                    if (availableSubs.length === 0) {
                        select.innerHTML = "<option value=''>No unlinked submissions found</option>";
                    } else {
                        select.innerHTML = "<option value=''>-- Select Submission --</option>" + 
                            availableSubs.map(s => `<option value="${s.submission}">${s.submission} (${s.docType})</option>`).join("");
                    }
                } catch (err) {
                    select.innerHTML = "<option value=''>Failed to load</option>";
                }
                select.focus();
            });
            
            select.addEventListener("change", async () => {
                const sub = select.value;
                if (!sub) {
                    select.style.display = "none";
                    linkBtn.style.display = "block";
                    return;
                }
                try {
                    await api.linkNote(state.activeVersion.filename, sub);
                    showToast("Linked submission", "success");
                    await loadVersions("notes");
                    const refreshed = (state.versions["notes"] || []).find(n => n.filename === state.activeVersion.filename);
                    if (refreshed) { state.activeVersion = refreshed; renderSubmissions(); }
                } catch (err) {
                    showToast("Could not link", "error");
                }
            });

            select.addEventListener("blur", () => {
                setTimeout(() => {
                    if (select.style.display !== "none" && !select.value) {
                        select.style.display = "none";
                        linkBtn.style.display = "block";
                    }
                }, 200);
            });
            
            linkContainer.appendChild(linkBtn);
            linkContainer.appendChild(select);
            submissionList.appendChild(linkContainer);
        }
    }
}


// ── Save ──────────────────────────────────────────────────────────────────────
btnSaveDetails.addEventListener("click", async () => {
    if (!state.activeVersion || !state.activeJson) return;
    if (state.isRenaming) {
        setTimeout(() => btnSaveDetails.click(), 150);
        return;
    }
    const type = state.activeDocType;
    btnSaveDetails.disabled = true;
    try {
        const updated = serializeSheet();
        const newDate = selectedDateStr;
        const resJson = await api.saveDocumentJson(type, state.activeVersion.filename, updated, newDate);
        const savedFilename = resJson.filename || state.activeVersion.filename;
        markClean();
        showToast("Saved", "success");
        await loadVersions(type);
        const refreshed = (state.versions[type] || []).find(v => v.filename === savedFilename);
        if (refreshed) {
            await selectVersion(refreshed);
        }
    } catch (err) {
        showToast("Save failed: " + err.message, "error");
    } finally {
        btnSaveDetails.disabled = false;
    }
});

// ── Search ────────────────────────────────────────────────────────────────────
searchBar.addEventListener("input", e => { state.searchTerm = e.target.value; renderTimeline(state.activeDocType); });

// ── Add submission ────────────────────────────────────────────────────────────
addSubmissionForm.addEventListener("submit", async e => {
    e.preventDefault();
    const target = addSubmissionInput.value.trim();
    if (!target || !state.activeVersion) return;
    
    if (state.activeDocType === "notes") {
        try {
            await api.linkNote(state.activeVersion.filename, target);
            addSubmissionInput.value = "";
            showToast(`Note linked to: ${target}`, "success");
            await loadVersions("notes");
            const refreshed = (state.versions["notes"] || []).find(n => n.filename === state.activeVersion.filename);
            if (refreshed) { state.activeVersion = refreshed; renderSubmissions(); renderTimeline("notes"); }
        } catch (err) {
            showToast("Could not link note", "error");
        }
        return;
    }

    try {
        await api.addSubmission(state.activeDocType, state.activeVersion.filename, target);
        state.activeVersion.submissions.push(target);
        addSubmissionInput.value = "";
        renderSubmissions(); renderTimeline(state.activeDocType);
        showToast(`Added: ${target}`, "success");
    } catch (err) {
        showToast("Could not add submission", "error");
    }
});

// ── Export / PDF ──────────────────────────────────────────────────────────
btnDownloadPdf.addEventListener("click", async () => {
    if (!state.activeVersion) return;
    if (state.isRenaming) {
        setTimeout(() => btnDownloadPdf.click(), 150);
        return;
    }
    const type = state.activeDocType;
    
    if (state.isDirty) {
        const saveBefore = await showConfirm(
            "Unsaved Changes",
            "You have unsaved changes. Save changes before exporting PDF?",
            false
        );
        if (!saveBefore) return; // Abort export
        
        btnSaveDetails.disabled = true;
        try {
            const updated = serializeSheet();
            const newDate = selectedDateStr;
            const resJson = await api.saveDocumentJson(type, state.activeVersion.filename, updated, newDate);
            const savedFilename = resJson.filename || state.activeVersion.filename;
            markClean();
            showToast("Saved successfully. Compiling PDF...", "success");
            await loadVersions(type);
            const refreshed = (state.versions[type] || []).find(v => v.filename === savedFilename);
            if (refreshed) {
                await selectVersion(refreshed);
            }
        } catch (err) {
            showToast("Save failed: " + err.message, "error");
            btnSaveDetails.disabled = false;
            return; // Abort export on save failure
        } finally {
            btnSaveDetails.disabled = false;
        }
    }
    
    showToast("Compiling PDF…", "info", 5000);
    try {
        let typstCode = "";
        if (type === "cv") {
            typstCode = translateCvToTypst(state.activeJson);
        } else {
            typstCode = translateDocToTypst(state.activeJson);
        }

        // Call the globally loaded $typst compiler from the CDN script
        const pdfData = await window.$typst.pdf({ mainContent: typstCode });
        
        // Create a blob and trigger browser download
        const blob = new Blob([pdfData], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${state.activeVersion.slug}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast("PDF exported successfully", "success");
    } catch (err) {
        showToast("PDF generation failed: " + err.message, "error");
    }
});

activeCvTitle.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        e.preventDefault();
        activeCvTitle.blur();
    } else if (e.key === "Escape") {
        e.preventDefault();
        if (state.activeVersion) {
            activeCvTitle.textContent = state.activeVersion.title;
        }
        activeCvTitle.blur();
    }
});

activeCvTitle.addEventListener("focus", () => {
    if (state.activeVersion && activeCvTitle.classList.contains("renamable")) {
        activeCvTitle.textContent = state.activeVersion.title;
        const range = document.createRange();
        range.selectNodeContents(activeCvTitle);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
});

activeCvTitle.addEventListener("blur", async () => {
    if (!state.activeVersion || !activeCvTitle.classList.contains("renamable")) return;
    const oldFilename = state.activeVersion.filename;
    const oldStem = state.activeVersion.title;
    let newStem = activeCvTitle.textContent.trim();
    
    if (!newStem || newStem === oldStem) {
        activeCvTitle.textContent = oldStem;
        return;
    }
    
    newStem = newStem.replace(/[\\/*?:"<>|]/g, "-").trim();
    if (!newStem) {
        activeCvTitle.textContent = oldStem;
        return;
    }
    
    const newFilename = `${newStem}.yaml`;
    if (newFilename === oldFilename) {
        activeCvTitle.textContent = oldStem;
        return;
    }
    
    state.isRenaming = true;
    try {
        const type = state.activeDocType;
        const result = await api.renameDocument(type, oldFilename, newFilename);
        showToast("Document renamed successfully", "success");
        await loadVersions(type);
        const newVer = (state.versions[type] || []).find(v => v.filename === result.filename);
        if (newVer) {
            selectVersion(newVer);
        }
    } catch (err) {
        showToast("Rename failed: " + err.message, "error");
        activeCvTitle.textContent = oldStem;
    } finally {
        state.isRenaming = false;
    }
});

// ── Delete ────────────────────────────────────────────────────────────────────
btnDeleteCv.addEventListener("click", () => {
    if (!state.activeVersion) return;
    deleteModalBody.textContent = `"${state.activeVersion.title}" will be permanently deleted.`;
    deleteModal.style.display = "flex";
});
btnDeleteCancel.addEventListener("click", () => { deleteModal.style.display = "none"; });
$("btnDeleteClose").addEventListener("click", () => { deleteModal.style.display = "none"; });
btnDeleteConfirm.addEventListener("click", async () => {
    deleteModal.style.display = "none";
    const type = state.activeDocType;
    try {
        await api.deleteDocument(type, state.activeVersion.filename);
        showToast("Version deleted", "success");
        state.activeVersion = null; state.activeJson = null;
        paperSheet.innerHTML = `<div class="empty-state"><span style="font-size:2.5rem;">${DOC_META[type].icon}</span><p>Select a version from the sidebar</p></div>`;
        activeCvTitle.textContent = DOC_META[type].label;
        activeCvDate.style.display = "none";
        activeCvLocation.style.display = "none";
        activeCvLocation.innerHTML = "";
        const pickerVal = document.getElementById("datePickerValue");
        if (pickerVal) pickerVal.textContent = "";
        renderSubmissions();
        await loadVersions(type);
    } catch (err) {
        showToast("Delete failed: " + err.message, "error");
    }
});

// ── Promote Main ──────────────────────────────────────────────────────────────
btnPromoteMain.addEventListener("click", async () => {
    if (!state.activeVersion) return;
    try {
        await api.promoteDocument(state.activeDocType, state.activeVersion.filename);
        showToast("Promoted to Main Branch", "success");
        await loadVersions(state.activeDocType);
    } catch (err) {
        showToast("Promote failed: " + err.message, "error");
    }
});

// ── Branch modal / New Note creation ──────────────────────────────────────────
btnBranchNew.addEventListener("click", () => {
    if (state.activeDocType === "notes") {
        createTemplateNote();
    } else {
        branchOverlay.style.display = "flex";
        if (state.activeVersion) branchSelectBase.value = state.activeVersion.filename;
    }
});
btnCloseBranch.addEventListener("click", () => { branchOverlay.style.display = "none"; branchInputSlug.value = ""; });
$("btnBranchClose").addEventListener("click", () => { branchOverlay.style.display = "none"; branchInputSlug.value = ""; });
btnCreateBranchSubmit.addEventListener("click", async () => {
    const parent = branchSelectBase.value;
    const slug   = branchInputSlug.value.trim();
    const type   = state.activeDocType;
    if (!parent || !slug) { showToast("Fill in both fields", "error"); return; }
    btnCreateBranchSubmit.disabled = true; btnCreateBranchSubmit.textContent = "Creating…";
    try {
        const result = await api.createBranch(type, parent, slug);
        branchOverlay.style.display = "none"; branchInputSlug.value = "";
        showToast(`Branch created: ${result.filename.replace(/\.yaml$/, "")}`, "success");
        await loadVersions(type);
        const newVer = (state.versions[type] || []).find(v => v.filename === result.filename);
        if (newVer) selectVersion(newVer);
    } catch (err) {
        showToast("Branch failed: " + err.message, "error");
    } finally {
        btnCreateBranchSubmit.disabled = false; btnCreateBranchSubmit.textContent = "Create Branch";
    }
});

// ── Diff modal ────────────────────────────────────────────────────────────────
btnCompare.addEventListener("click", () => { diffOverlay.style.display = "flex"; calculateDiff(); });
btnCloseDiff.addEventListener("click", () => { diffOverlay.style.display = "none"; });
diffSelectV1.addEventListener("change", calculateDiff);
diffSelectV2.addEventListener("change", calculateDiff);

async function calculateDiff() {
    const type = state.activeDocType;
    diffContainer.innerHTML = `<div style="color:var(--text-3);">Loading diff…</div>`;
    try {
        const diffPatch = await api.fetchDiff(type, diffSelectV1.value, diffSelectV2.value);
        const data = { diff: diffPatch.split("\n") };
        diffContainer.innerHTML = "";
        if (!data.diff.length) {
            diffContainer.innerHTML = `<div style="color:var(--text-3);text-align:center;padding:40px;">Files are identical.</div>`;
            return;
        }
        data.diff.forEach(line => {
            const d = document.createElement("div");
            d.className = "diff-line" + (line.startsWith("+") ? " added" : line.startsWith("-") ? " removed" : "");
            d.textContent = line; diffContainer.appendChild(d);
        });
    } catch (err) {
        diffContainer.innerHTML = `<div style="color:var(--danger);">Error: ${err.message}</div>`;
    }
}

function populateDiffDropdowns(type) {
    [diffSelectV1, diffSelectV2].forEach(sel => {
        sel.innerHTML = "";
        (state.versions[type] || []).forEach(v => {
            const opt = document.createElement("option");
            opt.value = v.filename; opt.textContent = `${formatDateToUI(v.date)} — ${(v.title || v.slug.replace(/-/g, " "))}`;
            sel.appendChild(opt);
        });
    });
    if ((state.versions[type] || []).length > 1) { diffSelectV1.selectedIndex = 0; diffSelectV2.selectedIndex = 1; }
}

function populateBranchDropdown(type) {
    branchSelectBase.innerHTML = "<option value='__fresh__'>-- Fresh / Blank Document --</option>";
    (state.versions[type] || []).forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.filename; opt.textContent = `${formatDateToUI(v.date)} — ${(v.title || v.slug.replace(/-/g, " "))}`;
        branchSelectBase.appendChild(opt);
    });
}

// Close modals on veil click
[$("deleteModal"), $("branchOverlay"), $("diffOverlay"), noteTemplateModal, reminderSetModal].forEach(m =>
    m?.addEventListener("click", e => { if (e.target === m) m.style.display = "none"; })
);

// ── Navigation helper — jump to any doc tab and load target file ──────────────────
async function jumpToDocument(docType, filename) {
    state.activeDocType = docType;
    state.activeVersion = null;
    state.activeJson = null;
    updateReminderButtonState();

    // Highlight nav pill
    document.querySelectorAll(".nav-pill").forEach(p => p.classList.toggle("active", p.dataset.doc === docType));

    // Update color variables
    const meta = DOC_META[docType];
    document.documentElement.style.setProperty("--accent", meta.color);
    document.documentElement.style.setProperty("--accent-glow", meta.color + "38");
    document.documentElement.style.setProperty("--accent-dim",  meta.color + "1a");
    document.documentElement.style.setProperty("--border-hi",   meta.color + "66");

    // Hide/show Notes-specific template button section
    if (noteTemplateSection) {
        noteTemplateSection.style.display = (docType === "notes") ? "block" : "none";
    }

    // Remind button is shown for all types now
    if (btnSetReminder) {
        btnSetReminder.style.display = "inline-flex";
    }

    // Update the New button tooltip/title based on doc type
    if (btnBranchNew) {
        btnBranchNew.title = (docType === "notes") ? "New Note" : "New Version";
    }

    try {
        const versions = await api.fetchVersions(docType);
        state.versions[docType] = versions;

        if (NAV_BADGES[docType]) NAV_BADGES[docType].textContent = versions.length;
        if (docType === "cv") cvNavBadge.textContent = versions.length;

        renderTimeline(docType);
        if (docType === state.activeDocType) {
            populateDiffDropdowns(docType);
            populateBranchDropdown(docType);
        }

        const targetVer = versions.find(v => v.filename === filename);
        if (targetVer) {
            await selectVersion(targetVer);
        } else {
            paperSheet.innerHTML = `<div class="empty-state">
                <span style="font-size:2.5rem;">${meta.icon}</span>
                <p>Select a ${meta.label} version from the sidebar</p>
            </div>`;
            activeCvTitle.textContent = meta.label;
        }
    } catch (err) {
        showToast("Error jumping to document", "error");
    }
}

// ── Search and jump to the document containing a specific submission string ─────
async function findAndJumpToSubmission(subName) {
    if (!subName) return;
    try {
        const allSubs = await api.fetchAllSubmissions();
        const match = allSubs.find(s => s.submission === subName);
        if (match) {
            await jumpToDocument(match.docType, match.filename);
            showToast(`Jumped to submission: ${subName}`, "success");
        } else {
            showToast("Linked submission target not found", "error");
        }
    } catch (err) {
        showToast("Could not locate submission", "error");
    }
}

// ── Render inline note-to-submission linking panel on the notes canvas ──────────
// ── Reminder Banner & Note Reminders Logic ────────────────────────────────────
// ── Reminders Inbox Logic ───────────────────────────────────────────────────

let allReminders = [];

async function loadRemindersInbox() {
    try {
        allReminders = await api.fetchReminders();
        renderRemindersInbox();
        updateReminderButtonState();
    } catch (err) {
        console.error("Failed to load reminders", err);
    }
}

function renderRemindersInbox() {
    remindersInboxList.innerHTML = "";
    
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 10);
    
    const activeReminders = allReminders.filter(r => r.status !== "dismissed");
    
    if (activeReminders.length > 0) {
        globalReminderBadge.style.display = "flex";
        globalReminderBadge.textContent = activeReminders.length;
        btnOpenRemindersInbox.classList.add("btn-bell-shake");
    } else {
        globalReminderBadge.style.display = "none";
        globalReminderBadge.textContent = "";
        btnOpenRemindersInbox.classList.remove("btn-bell-shake");
    }
    
    if (activeReminders.length === 0) {
        remindersInboxList.innerHTML = `<div class="empty-state" style="margin-top:40px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <p>No active reminders</p>
        </div>`;
        return;
    }
    
    activeReminders.sort((a, b) => a.date.localeCompare(b.date));
    
    activeReminders.forEach(r => {
        const isOverdue = r.date < localISOTime;
        const isToday = r.date === localISOTime;
        
        const card = document.createElement("div");
        card.className = `reminder-card ${isOverdue ? 'overdue' : (isToday ? 'today' : '')}`;
        
        let headerLabel = r.date;
        let badgeClass = "upcoming";
        if (isOverdue) {
            headerLabel = "Overdue";
            badgeClass = "overdue";
        } else if (isToday) {
            headerLabel = "Today";
            badgeClass = "today";
        }
        
        const tab = activeTabs.find(t => t.type === r.docType) || { icon: "file-text", color: "var(--accent)" };
        const iconSvg = SVG_ICONS[tab.icon] || SVG_ICONS["file-text"];
        
        card.innerHTML = `
            <div class="reminder-card-header">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="color: ${tab.color}; display:inline-flex;">${iconSvg}</span>
                    <span style="font-weight:700; color:var(--text-muted); font-size:0.75rem;">${r.docType.toUpperCase()}</span>
                </div>
                <span class="status-badge ${badgeClass}">${headerLabel}</span>
            </div>
            <div class="reminder-card-doc">${r.filename.replace(".yaml", "").replace(/-/g, " ")}</div>
            <div class="reminder-card-msg">${r.msg || "Follow-up required."}</div>
            <div class="reminder-card-actions">
                <button class="btn btn-ghost-xs reminder-open-btn" data-doc-type="${r.docType}" data-filename="${r.filename}">Open</button>
                <button class="btn btn-ghost-xs reminder-dismiss-btn" data-reminder-id="${r.id}" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.2);">Dismiss</button>
            </div>
        `;
        // Wire up Open button — navigates to the linked document and closes the inbox
        card.querySelector(".reminder-open-btn").addEventListener("click", async () => {
            closeRemindersInbox();
            await jumpToDocument(r.docType, r.filename);
        });
        // Wire up Dismiss button
        card.querySelector(".reminder-dismiss-btn").addEventListener("click", () => {
            window.dismissReminderFromInbox(r.id);
        });
        remindersInboxList.appendChild(card);
    });
}

window.dismissReminderFromInbox = async function(id) {
    try {
        await api.dismissReminder(id);
        showToast("Reminder dismissed", "success");
        await loadRemindersInbox();
        updateReminderButtonState();
        if (state.activeVersion) {
            renderDocumentRemindersList(); // If the modal is open, update it
        }
        await loadVersions(state.activeDocType); // re-render cards
    } catch (err) {
        showToast("Could not dismiss reminder", "error");
    }
};

btnOpenRemindersInbox.addEventListener("click", () => {
    remindersInboxPanel.classList.add("open");
    const overlay = $("remindersOverlay");
    if(overlay) overlay.classList.add("show");
});

function closeRemindersInbox() {
    remindersInboxPanel.classList.remove("open");
    const overlay = $("remindersOverlay");
    if(overlay) overlay.classList.remove("show");
}

btnCloseRemindersInbox.addEventListener("click", closeRemindersInbox);

const remindersOverlay = $("remindersOverlay");
if (remindersOverlay) {
    remindersOverlay.addEventListener("click", closeRemindersInbox);
}

// ── Document Reminders UI Handlers ──
const documentRemindersList = $("documentRemindersList");

function renderDocumentRemindersList() {
    documentRemindersList.innerHTML = "";
    if (!state.activeVersion) return;
    
    const docReminders = allReminders.filter(r => 
        r.docType === state.activeDocType && 
        r.filename === state.activeVersion.filename && 
        r.status !== "dismissed"
    );
    
    if (docReminders.length === 0) {
        documentRemindersList.innerHTML = `<div style="font-size:0.8rem; color:var(--text-3); text-align:center; padding:10px;">No active reminders for this document.</div>`;
        return;
    }
    
    docReminders.forEach(r => {
        const item = document.createElement("div");
        item.className = "document-reminder-item";
        item.innerHTML = `
            <div>
                <div class="document-reminder-date">${r.date}</div>
                <div class="document-reminder-msg">${r.msg || "No message"}</div>
            </div>
            <button class="btn btn-ghost-xs" style="padding:4px 8px; font-size:0.75rem; color:var(--danger); border-color:rgba(239, 68, 68, 0.2);" onclick="dismissReminderFromModal('${r.id}')">Dismiss</button>
        `;
        documentRemindersList.appendChild(item);
    });
}

window.dismissReminderFromModal = async function(id) {
    try {
        await api.dismissReminder(id);
        showToast("Reminder dismissed", "success");
        await loadRemindersInbox();
        updateReminderButtonState();
        renderDocumentRemindersList(); // re-render the modal list
        await loadVersions(state.activeDocType); // re-render timeline cards
    } catch (err) {
        showToast("Could not dismiss reminder", "error");
    }
};

btnSetReminder.addEventListener("click", () => {
    if (!state.activeVersion) {
        showToast("Select a document first", "info");
        return;
    }
    reminderSetNoteLabel.textContent = `Reminders for: ${(state.activeVersion.title || state.activeVersion.slug.replace(/-/g, " "))}`;
    reminderDateInput.value = "";
    reminderMsgInput.value = "";
    
    renderDocumentRemindersList();
    reminderSetModal.style.display = "flex";
});

btnCloseReminderSet.addEventListener("click", () => { reminderSetModal.style.display = "none"; });
btnCancelReminderSet.addEventListener("click", () => { reminderSetModal.style.display = "none"; });

btnSaveReminderSet.addEventListener("click", async () => {
    const date = reminderDateInput.value;
    const msg = reminderMsgInput.value.trim();
    if (!date) {
        showToast("Please select a date", "error");
        return;
    }
    
    try {
        await api.setReminder(state.activeDocType, state.activeVersion.filename, date, msg, null); // null ID creates a new one
        showToast("Reminder added", "success");
        reminderDateInput.value = "";
        reminderMsgInput.value = "";
        
        await loadRemindersInbox();
        renderDocumentRemindersList(); // update list in modal instantly
        updateReminderButtonState();
        await loadVersions(state.activeDocType); // update timeline badge
    } catch (err) {
        showToast("Could not add reminder", "error");
    }
});

// ── Note template edit handlers ───────────────────────────────────────────────
btnEditTemplate.addEventListener("click", async () => {
    try {
        const templateText = await api.fetchNoteTemplate();
        noteTemplateEditor.value = templateText || "";
        noteTemplateModal.style.display = "flex";
    } catch (err) {
        showToast("Could not load template: " + err.message, "error");
    }
});

btnCloseNoteTemplate.addEventListener("click", () => { noteTemplateModal.style.display = "none"; });
btnCancelNoteTemplate.addEventListener("click", () => { noteTemplateModal.style.display = "none"; });

btnSaveNoteTemplate.addEventListener("click", async () => {
    const text = noteTemplateEditor.value;
    btnSaveNoteTemplate.disabled = true;
    try {
        await api.saveNoteTemplate(text);
        showToast("Template saved", "success");
        noteTemplateModal.style.display = "none";
    } catch (err) {
        showToast("Could not save template: " + err.message, "error");
    } finally {
        btnSaveNoteTemplate.disabled = false;
    }
});

// Note creator
async function createTemplateNote() {
    try {
        const result = await api.createNote();
        showToast("Note created from template", "success");
        await loadVersions("notes");
        const newVer = (state.versions["notes"] || []).find(v => v.filename === result.filename);
        if (newVer) selectVersion(newVer);
    } catch (err) {
        showToast("Could not create note: " + err.message, "error");
    }
}

// ── Custom Calendar Picker Logic ─────────────────────────────────────────────
let calendarViewDate = new Date();
let selectedDateStr = "";

// Inject calendar CSS styles
const calendarStyle = document.createElement("style");
calendarStyle.textContent = `
    .calendar-day-btn {
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 4px 0;
        border-radius: 4px;
        font-size: 0.75rem;
        transition: all 0.15s;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 24px;
        box-sizing: border-box;
    }
    .calendar-day-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-main);
    }
    .calendar-day-btn.selected {
        background: var(--accent) !important;
        color: #fff !important;
        font-weight: bold;
    }
    .calendar-day-btn.today {
        border: 1px solid var(--accent);
    }
    .calendar-day-btn.other-month {
        color: rgba(255, 255, 255, 0.15);
        pointer-events: none;
    }
`;
document.head.appendChild(calendarStyle);

function renderCalendarGrid() {
    const daysGrid = document.getElementById("calendarDaysGrid");
    const monthYearLabel = document.getElementById("calendarMonthYear");
    if (!daysGrid || !monthYearLabel) return;

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYearLabel.textContent = `${monthNames[month]} ${year}`;

    daysGrid.innerHTML = "";

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    // Trailing days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const daySpan = document.createElement("span");
        daySpan.className = "calendar-day-btn other-month";
        daySpan.textContent = prevTotalDays - i;
        daysGrid.appendChild(daySpan);
    }

    // Days of current month
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= totalDays; d++) {
        const dayButton = document.createElement("button");
        dayButton.className = "calendar-day-btn";
        dayButton.textContent = d;

        const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        if (currentDayStr === selectedDateStr) {
            dayButton.classList.add("selected");
        } else if (currentDayStr === todayStr) {
            dayButton.classList.add("today");
        }

        dayButton.addEventListener("click", () => {
            selectedDateStr = currentDayStr;
            const uiFormatted = formatDateToUI(selectedDateStr);
            const valSpan = document.getElementById("datePickerValue");
            if (valSpan) valSpan.textContent = uiFormatted;
            
            if (state.activeVersion && selectedDateStr !== state.activeVersion.date) {
                markDirty();
            }

            document.getElementById("calendarDropdown").style.display = "none";
        });

        daysGrid.appendChild(dayButton);
    }
}

// Bind custom date picker events
const btnDatePicker = document.getElementById("btnDatePicker");
const calendarDropdown = document.getElementById("calendarDropdown");
const btnPrevMonth = document.getElementById("btnPrevMonth");
const btnNextMonth = document.getElementById("btnNextMonth");

if (btnDatePicker && calendarDropdown) {
    btnDatePicker.addEventListener("click", (e) => {
        e.stopPropagation();
        const isShown = calendarDropdown.style.display === "block";
        calendarDropdown.style.display = isShown ? "none" : "block";
        if (!isShown) {
            if (selectedDateStr) {
                const parts = selectedDateStr.split("-");
                calendarViewDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
            } else {
                calendarViewDate = new Date();
            }
            renderCalendarGrid();
        }
    });

    btnPrevMonth.addEventListener("click", (e) => {
        e.stopPropagation();
        calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
        renderCalendarGrid();
    });

    btnNextMonth.addEventListener("click", (e) => {
        e.stopPropagation();
        calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
        renderCalendarGrid();
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest("#activeCvDate")) {
            calendarDropdown.style.display = "none";
        }
    });
}

// ── Auth & Init flow ──────────────────────────────────────────────────────────

async function bootstrapApp() {
    try {
        // Check if user has any documents. If not, seed default documents.
        const cvs = await api.fetchVersions("cv");
        if (cvs.length === 0) {
            showToast("Initializing workspace with sample data...", "info");
            await api.seedUserData();
            showToast("Workspace initialized!", "success");
        }
        await loadRemindersInbox();
        await initTabs();
    } catch (err) {
        console.error("Failed to bootstrap app data:", err);
    }
}

const authOverlay = $("authOverlay");
const btnGoogleSignIn = $("btnGoogleSignIn");
const btnLogout = $("btnLogout");

if (btnGoogleSignIn) {
    btnGoogleSignIn.addEventListener("click", async () => {
        try {
            showToast("Redirecting to Google...", "info");
            let redirectPath = window.location.pathname;
            if (redirectPath.endsWith("index.html")) {
                redirectPath = redirectPath.slice(0, -10);
            }
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: window.location.origin + redirectPath
                }
            });
            if (error) throw error;
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            showToast("Signed out successfully", "success");
            window.location.reload();
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

// ── Remove Intro Loading Overlay ──
async function removeSplash() {
    const intro = document.getElementById("introLoadingOverlay");
    if (!intro) return;

    let authenticated = false;
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session && !error) {
            authenticated = true;
        }
    } catch (err) {
        console.error("Auth check failed:", err);
    }

    // Wait an extra 3.5s to let the animation play out nicely and motto be readable
    setTimeout(async () => {
        if (authenticated) {
            await bootstrapApp();
            intro.classList.add("fade-out");
            setTimeout(() => intro.remove(), 1000);
        } else {
            authOverlay.style.display = "flex";
            intro.classList.add("fade-out");
            setTimeout(() => intro.remove(), 1000);
        }
    }, 3500);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
    removeSplash();
} else {
    window.addEventListener("load", removeSplash);
}

// ── Link Helper Tooltip and Parser ───────────────────────────────────────────
function linkify(text) {
    if (!text) return "";
    const urlPattern = /(\b(https?):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, (url) => {
        let href = url;
        if (!/^https?:\/\//i.test(url)) {
            href = 'https://' + url;
        }
        return `<a href="${href}" target="_blank" class="paper-link" style="color:var(--paper-heading-color);text-decoration:underline;">${url}</a>`;
    });
}

// Create a single floating link helper popup
const linkHelper = document.createElement("div");
linkHelper.id = "linkHelper";
linkHelper.style.cssText = "position:absolute;display:none;background:var(--bg-app);border:1px solid var(--border-light);padding:6px 10px;border-radius:8px;font-size:0.75rem;z-index:9999;box-shadow:var(--shadow-md);align-items:center;gap:6px;font-family:Inter,sans-serif;";
linkHelper.innerHTML = `<span style="color:var(--text-muted);">Go to link:</span> <a href="#" target="_blank" id="linkHelperUrl" style="color:var(--accent);text-decoration:underline;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">link</a>`;
document.body.appendChild(linkHelper);

let activeLinkEl = null;
let hideTimeout = null;

// Show helper on hovering over links
document.addEventListener("mouseover", e => {
    const helper = e.target.closest("#linkHelper");
    const a = e.target.closest(".paper-link, #paperWebsite, #paperEmail");
    
    if (helper || a) {
        if (hideTimeout) clearTimeout(hideTimeout);
    }
    
    if (a) {
        activeLinkEl = a;
        let url = a.getAttribute("href") || a.innerText.trim();
        if (!url) return;
        if (a.id === "paperEmail") {
            url = "mailto:" + url;
        } else if (!/^https?:\/\//i.test(url) && !url.startsWith("mailto:")) {
            url = "https://" + url;
        }
        const helperUrl = document.getElementById("linkHelperUrl");
        helperUrl.href = url;
        helperUrl.textContent = url.replace("mailto:", "");
        
        const rect = a.getBoundingClientRect();
        linkHelper.style.left = `${rect.left + window.scrollX}px`;
        linkHelper.style.top = `${rect.bottom + window.scrollY}px`;
        linkHelper.style.display = "flex";
    }
});

// Hide helper when moving away
document.addEventListener("mouseout", e => {
    const related = e.relatedTarget;
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        if (related && (related.closest("#linkHelper") || related.closest(".paper-link") || related.id === "paperWebsite" || related.id === "paperEmail")) {
            return;
        }
        linkHelper.style.display = "none";
    }, 250);
});

window.showConfirm = (title, message, isDanger = true) => {
    return new Promise(resolve => {
        const modal = document.getElementById("customConfirmModal");
        const titleEl = document.getElementById("customConfirmTitle");
        const msgEl = document.getElementById("customConfirmMessage");
        const cancelBtn = document.getElementById("customConfirmCancelBtn");
        const okBtn = document.getElementById("customConfirmOkBtn");
        const iconEl = document.getElementById("customConfirmIcon");

        titleEl.textContent = title;
        msgEl.textContent = message;

        if (isDanger) {
            iconEl.className = "modal-icn danger";
            okBtn.className = "btn btn-danger";
            iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else {
            iconEl.className = "modal-icn primary";
            okBtn.className = "btn btn-primary";
            iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }

        modal.style.display = "flex";

        const cleanup = (val) => {
            modal.style.display = "none";
            cancelBtn.removeEventListener("click", onCancel);
            okBtn.removeEventListener("click", onOk);
            resolve(val);
        };

        const onCancel = () => cleanup(false);
        const onOk = () => cleanup(true);

        cancelBtn.addEventListener("click", onCancel);
        okBtn.addEventListener("click", onOk);
    });
};

window.showAddSectionModal = () => {
    return new Promise(resolve => {
        const modal = document.getElementById("addSectionModal");
        const nameInput = document.getElementById("addSectionNameInput");
        const typeSelect = document.getElementById("addSectionTypeSelect");
        const cancelBtn = document.getElementById("addSectionCancelBtn");
        const confirmBtn = document.getElementById("addSectionConfirmBtn");

        nameInput.value = "";
        typeSelect.value = "1";
        modal.style.display = "flex";
        nameInput.focus();

        const cleanup = (val) => {
            modal.style.display = "none";
            cancelBtn.removeEventListener("click", onCancel);
            confirmBtn.removeEventListener("click", onConfirm);
            resolve(val);
        };

        const onCancel = () => cleanup(null);
        const onConfirm = () => {
            const name = nameInput.value.trim();
            if (!name) {
                showToast("Section name cannot be empty", "error");
                return;
            }
            cleanup({ name, type: typeSelect.value });
        };

        cancelBtn.addEventListener("click", onCancel);
        confirmBtn.addEventListener("click", onConfirm);

        const onKeyPress = (e) => {
            if (e.key === "Enter") {
                onConfirm();
                nameInput.removeEventListener("keypress", onKeyPress);
            }
        };
        nameInput.addEventListener("keypress", onKeyPress);
    });
};


function updateReminderButtonState() {
    if (!btnSetReminder) return;
    
    if (!state.activeVersion) {
        btnSetReminder.classList.remove("has-reminders");
        btnSetReminder.style.background = "";
        btnSetReminder.style.borderColor = "";
        btnSetReminder.style.color = "";
        btnSetReminder.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Remind
        `;
        return;
    }
    
    const docReminders = allReminders.filter(r => 
        r.docType === state.activeDocType && 
        r.filename === state.activeVersion.filename && 
        r.status !== "dismissed"
    );
    
    if (docReminders.length > 0) {
        btnSetReminder.classList.add("has-reminders");
        btnSetReminder.style.background = "var(--accent-dim)";
        btnSetReminder.style.borderColor = "var(--accent)";
        btnSetReminder.style.color = "var(--text-main)";
        btnSetReminder.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" class="pulsing-bell"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Remind <span class="badge sm-badge" style="background:var(--accent); color:var(--bg-app); border-radius:50%; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; font-size:0.65rem; margin-left:4px; font-weight:700; border:none; box-shadow:none;">${docReminders.length}</span>
        `;
    } else {
        btnSetReminder.classList.remove("has-reminders");
        btnSetReminder.style.background = "";
        btnSetReminder.style.borderColor = "";
        btnSetReminder.style.color = "";
        btnSetReminder.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Remind
        `;
    }
}


