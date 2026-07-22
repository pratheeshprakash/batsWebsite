import { store, markClean, DOC_META } from '../store.js';
import { $, showToast } from '../utils.js';
import { loadVersions } from './timeline.js';

export function setupNav() {
    document.querySelectorAll(".nav-pill").forEach(pill =>
        pill.addEventListener("click", () => switchDocType(pill.dataset.doc))
    );
}

export function switchDocType(type) {
    if (store.isDirty && !confirm("Unsaved changes — switch anyway?")) return;
    markClean();
    store.activeDocType = type;
    store.activeVersion = null;
    store.activeJson = null;

    // Nav pill highlight
    document.querySelectorAll(".nav-pill").forEach(p => p.classList.toggle("active", p.dataset.doc === type));

    // Topbar colour accent
    const meta = DOC_META[type];
    document.documentElement.style.setProperty("--accent", meta.color);
    document.documentElement.style.setProperty("--accent-glow", meta.color + "38");
    document.documentElement.style.setProperty("--accent-dim",  meta.color + "1a");
    document.documentElement.style.setProperty("--border-hi",   meta.color + "66");

    // Show/hide Notes-specific template button section
    const noteTemplateSection = $("noteTemplateSection");
    if (noteTemplateSection) {
        noteTemplateSection.style.display = (type === "notes") ? "block" : "none";
    }

    // Remind button
    const btnSetReminder = $("btnSetReminder");
    if (btnSetReminder) {
        btnSetReminder.style.display = "inline-flex";
    }

    // Update the New button tooltip/title based on doc type
    const btnBranchNew = $("btnBranchNew");
    if (btnBranchNew) {
        btnBranchNew.title = (type === "notes") ? "New Note" : "New Version";
    }

    // Reset paper
    $("paperSheet").innerHTML = `<div class="empty-state">
        <span style="display:inline-flex;color:var(--accent);margin-bottom:12px;">${meta.icon}</span>
        <p>Select a ${meta.label} version from the sidebar</p>
    </div>`;
    $("activeCvTitle").textContent = meta.label;
    $("activeCvDate").style.display = "none";
    const pickerVal = $("datePickerValue");
    if (pickerVal) pickerVal.textContent = "";
    $("activeCvLocation").textContent = "";
    
    // Hide unsaved dot
    $("unsavedDot").style.display = "none";

    // Load versions for this type
    loadVersions(type);

    // Auto-close mobile drawer if open
    if (typeof window.closeMobileDrawer === "function") {
        window.closeMobileDrawer();
    }
}
