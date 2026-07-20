import { store, DOC_META } from "../store.js";
import * as dom from "../dom.js";
import * as api from "../api.js";
import { showToast, formatDateToUI } from "../utils.js";
import { renderEditor } from "./editor.js";

async function loadVersions(type) {
    try {
        const versions = await api.fetchVersions(type);
        state.versions[type] = versions;

        // Update the badge for this tab (always display count, even if 0)
        if (NAV_BADGES[type]) NAV_BADGES[type].textContent = versions.length;
        // Legacy alias kept for anything that still references cvNavBadge directly
        if (type === "cv") cvNavBadge.textContent = versions.length;

        renderTimeline(type);
        if (type === state.activeDocType) {
            populateDiffDropdowns(type);
            populateBranchDropdown(type);
        }
        // If notes have loaded, verify if any reminders are due
        if (type === "notes") {
            checkReminders();
        }
        // Only auto-select first version when loading the currently active tab
        if (versions.length > 0 && !state.activeVersion && type === state.activeDocType) {
            selectVersion(versions[0]);
        }
    } catch (err) {
        showToast(`Could not load ${DOC_META[type]?.label} versions`, "error");
    }
}

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
        const subs = (v.submissions || []).length;
        const subsText = subs ? `${subs} submission${subs !== 1 ? "s" : ""}` : "";
        const hasLink = v.linked_to && v.linked_to.length > 0;
        const displayTitle = v.title || v.slug.replace(/-/g, " ");
        card.innerHTML = `
            <div class="card-header">
                <span class="card-date">${formatDateToUI(v.date)}</span>
                ${folderBadge}
            </div>
            <div class="card-title">${(isChild ? "└ " : "") + displayTitle}</div>
            <div class="card-footer-row">
                ${subsText ? `<div class="card-meta">${subsText}</div>` : ""}
                ${state.activeDocType === "notes"
                    ? `<button class="card-link-chip ${hasLink ? "active" : ""}" data-file="${v.filename}" title="${hasLink ? "Go to linked submission: " + v.linked_to[0] : "Select note to link inline"}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0 7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        ${hasLink ? "Linked" : "Link"}
                      </button>`
                    : ""}
            </div>
        `;
        card.addEventListener("click", e => {
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

async function selectVersion(v) {
    state.activeVersion = v;
    const type = state.activeDocType;

    document.querySelectorAll(".timeline-card").forEach(c =>
        c.classList.toggle("active", c.dataset.filename === v.filename)
    );

    activeCvTitle.textContent  = v.title || v.slug.replace(/-/g, " ");
    activeCvDate.style.display = "inline-flex";
    const pickerVal = document.getElementById("datePickerValue");
    if (pickerVal) pickerVal.textContent = formatDateToUI(v.date);
    if (v.location) {
        activeCvLocation.style.display = "inline-flex";
        activeCvLocation.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${v.location}`;
    } else {
        activeCvLocation.style.display = "none";
        activeCvLocation.innerHTML = "";
    }

    renderSubmissions(); // all tabs show the linked-to panel

    try {
        state.activeJson = await api.fetchDocumentJson(type, v.filename);
        renderPaperSheet(state.activeJson, type);
        markClean();
    } catch (err) {
        paperSheet.innerHTML = `<div style="color:red;padding:20px;">Error: ${err.message}</div>`;
        showToast("Failed to load document", "error");
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
    branchSelectBase.innerHTML = "";
    (state.versions[type] || []).forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.filename; opt.textContent = `${formatDateToUI(v.date)} — ${(v.title || v.slug.replace(/-/g, " "))}`;
        branchSelectBase.appendChild(opt);
    });
}