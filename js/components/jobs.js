/**
 * Jobs Discovery Tab — handles the jobs panel UI, site management sidebar,
 * job cards feed, filtering, and the Application Wizard flow.
 */
import * as api from "../api.js";
import { $, showToast } from "../utils.js";
import { DOC_META, store as state } from "../store.js";

// ── State ─────────────────────────────────────────────────────────────────
let jobSites = [];
let jobListings = [];
let jobStats = { total: 0, new: 0, viewed: 0, saved: 0, applied: 0, rejected: 0, archived: 0 };
let activeFilter = "all";
let searchQuery = "";
let companyFilter = "";
let siteFilter = "";
let expandedJobId = null;
let userCountryCode = "GLOBAL";

// Wizard state
let wizardStep = 1;
let wizardJob = null;
let wizardSelectedCvId = null;
let wizardSelectedCvSlug = null;
let wizardBranchSlug = null;
let wizardTailoring = false;
let wizardApplicationStatus = "applied";

// ── DOM refs ──────────────────────────────────────────────────────────────
const jobsPanel = $("jobsPanel");
const jobsFeed = $("jobsFeed");
const jobsStatsBar = $("jobsStatsBar");
const jobsSearchInput = $("jobsSearchInput");
const jobsCompanyFilter = $("jobsCompanyFilter");
const jobsSiteFilter = $("jobsSiteFilter");
const cvEditorView = $("cvEditorView");

// Wizard refs
const applyWizardOverlay = $("applyWizardOverlay");
const wizardBody = $("wizardBody");
const wizardStepsBar = $("wizardStepsBar");
const wizardBtnBack = $("wizardBtnBack");
const wizardBtnNext = $("wizardBtnNext");
const wizardTitle = $("wizardTitle");
const btnCloseWizard = $("btnCloseWizard");

// ── Initialization ────────────────────────────────────────────────────────

export function initJobs() {
    // Stat chips filtering
    if (jobsStatsBar) {
        jobsStatsBar.addEventListener("click", (e) => {
            const chip = e.target.closest(".jobs-stat-chip");
            if (!chip) return;
            document.querySelectorAll(".jobs-stat-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            activeFilter = chip.dataset.filter;
            renderJobCards();
        });
    }

    // Search
    if (jobsSearchInput) {
        jobsSearchInput.addEventListener("input", () => {
            searchQuery = jobsSearchInput.value.trim();
            renderJobCards();
        });
    }

    // Company filter
    if (jobsCompanyFilter) {
        jobsCompanyFilter.addEventListener("change", () => {
            companyFilter = jobsCompanyFilter.value;
            renderJobCards();
        });
    }

    // Site filter
    if (jobsSiteFilter) {
        jobsSiteFilter.addEventListener("change", () => {
            siteFilter = jobsSiteFilter.value;
            renderJobCards();
        });
    }

    // Wizard controls
    if (btnCloseWizard) {
        btnCloseWizard.addEventListener("click", closeWizard);
    }
    if (wizardBtnBack) {
        wizardBtnBack.addEventListener("click", () => {
            if (wizardStep > 1) {
                wizardStep--;
                renderWizardStep();
            }
        });
    }
    if (wizardBtnNext) {
        wizardBtnNext.addEventListener("click", handleWizardNext);
    }

    // Detect user location
    detectUserLocation();
}

// ── Tab Switching ─────────────────────────────────────────────────────────

export function showJobsPanel() {
    if (jobsPanel) jobsPanel.style.display = "flex";
    if (cvEditorView) cvEditorView.style.display = "none";
    // Hide document-specific topbar and submissions — not relevant for Jobs
    const docTopbar = document.getElementById("docTopbar");
    const submissionsPanel = document.getElementById("submissionsPanel");
    const remindersPanel = document.getElementById("remindersInboxPanel");
    const searchWrap = document.querySelector("#sidePanel > .search-wrap");
    const versionsLabel = document.querySelector("#sidePanel > .panel-section-label");
    if (docTopbar) docTopbar.style.display = "none";
    if (submissionsPanel) submissionsPanel.style.display = "none";
    if (searchWrap) searchWrap.style.display = "none";
    if (versionsLabel) versionsLabel.style.display = "none";
    loadJobsData();
}

export function hideJobsPanel() {
    if (jobsPanel) jobsPanel.style.display = "none";
    if (cvEditorView) cvEditorView.style.display = "";
    // Restore document-specific UI
    const docTopbar = document.getElementById("docTopbar");
    const submissionsPanel = document.getElementById("submissionsPanel");
    const searchWrap = document.querySelector("#sidePanel > .search-wrap");
    const versionsLabel = document.querySelector("#sidePanel > .panel-section-label");
    if (docTopbar) docTopbar.style.display = "";
    if (submissionsPanel) submissionsPanel.style.display = "";
    if (searchWrap) searchWrap.style.display = "";
    if (versionsLabel) versionsLabel.style.display = "";
}

export function isJobsTab(type) {
    return type === "jobs";
}

// ── Location Detection ────────────────────────────────────────────────────

function detectUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    // Use a free reverse geocoding service
                    const resp = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=3`,
                        { headers: { "Accept-Language": "en" } }
                    );
                    const data = await resp.json();
                    const cc = data.address?.country_code?.toUpperCase();
                    if (cc) {
                        userCountryCode = cc;
                    }
                } catch (err) {
                    console.warn("Location detection failed:", err);
                }
            },
            () => {
                console.info("Geolocation permission denied — using GLOBAL defaults");
            },
            { timeout: 10000 }
        );
    }
}

// ── Data Loading ──────────────────────────────────────────────────────────

async function loadJobsData() {
    try {
        [jobSites, jobListings, jobStats] = await Promise.all([
            api.fetchJobSites().catch(() => []),
            api.fetchJobs().catch(() => []),
            api.fetchJobStats().catch(() => ({ total: 0, new: 0, viewed: 0, saved: 0, applied: 0, rejected: 0, archived: 0 })),
        ]);
        updateStats();
        updateFilters();
        renderJobCards();
    } catch (err) {
        console.error("Failed to load jobs data:", err);
    }
}

function updateStats() {
    const all = $("jobStatAll");
    const nw = $("jobStatNew");
    const sv = $("jobStatSaved");
    const ap = $("jobStatApplied");
    const rj = $("jobStatRejected");
    if (all) all.textContent = jobStats.total || jobListings.length;
    if (nw) nw.textContent = jobStats.new || 0;
    if (sv) sv.textContent = jobStats.saved || 0;
    if (ap) ap.textContent = jobStats.applied || 0;
    if (rj) rj.textContent = jobStats.rejected || 0;
}

function updateFilters() {
    // Populate company filter
    if (jobsCompanyFilter) {
        const companies = [...new Set(jobListings.map(j => j.company).filter(Boolean))].sort();
        jobsCompanyFilter.innerHTML = `<option value="">All Companies</option>` +
            companies.map(c => `<option value="${c}">${c}</option>`).join("");
    }
    // Populate site filter
    if (jobsSiteFilter) {
        const siteNames = [...new Set(jobListings.map(j => j.site_name).filter(Boolean))].sort();
        jobsSiteFilter.innerHTML = `<option value="">All Sources</option>` +
            siteNames.map(s => `<option value="${s}">${s}</option>`).join("");
    }
}

// ── Job Cards Rendering ───────────────────────────────────────────────────

function renderJobCards() {
    if (!jobsFeed) return;

    let filtered = [...jobListings];

    // Status filter
    if (activeFilter !== "all") {
        filtered = filtered.filter(j => j.status === activeFilter);
    }

    // Search
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(j =>
            (j.title && j.title.toLowerCase().includes(q)) ||
            (j.company && j.company.toLowerCase().includes(q)) ||
            (j.location && j.location.toLowerCase().includes(q))
        );
    }

    // Company
    if (companyFilter) {
        filtered = filtered.filter(j => j.company === companyFilter);
    }

    // Site
    if (siteFilter) {
        filtered = filtered.filter(j => j.site_name === siteFilter);
    }

    if (filtered.length === 0) {
        jobsFeed.innerHTML = `
            <div class="jobs-empty">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <p>${jobListings.length === 0
                    ? 'No jobs yet. Add career sites in the sidebar and click <strong>Scrape Now</strong> to discover job listings.'
                    : 'No jobs match your current filters.'}</p>
            </div>`;
        return;
    }

    jobsFeed.innerHTML = filtered.map(job => {
        const initial = (job.company || "?")[0].toUpperCase();
        const expanded = expandedJobId === job.id;
        const postedAgo = job.date_posted ? formatRelativeDate(job.date_posted) : "";
        const salary = job.salary_range || "";

        return `
        <div class="job-card ${expanded ? 'expanded' : ''}" data-job-id="${job.id}">
            <div class="job-card-avatar">${initial}</div>
            <div class="job-card-body">
                <div class="job-card-title">${escHtml(job.title)}</div>
                <div class="job-card-meta">
                    <span>🏢 ${escHtml(job.company)}</span>
                    ${job.location ? `<span>📍 ${escHtml(job.location)}</span>` : ""}
                    ${postedAgo ? `<span>🕐 ${postedAgo}</span>` : ""}
                    ${salary ? `<span>💰 ${escHtml(salary)}</span>` : ""}
                </div>
                ${job.tags && job.tags.length ? `
                    <div class="job-card-tags">
                        ${job.tags.map(t => `<span class="job-card-tag">${escHtml(t)}</span>`).join("")}
                    </div>` : ""}
                <div class="job-card-actions">
                    <button class="job-action-btn primary" data-action="apply" data-job-id="${job.id}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Apply & Tailor
                    </button>
                    <button class="job-action-btn" data-action="quick-track" data-job-id="${job.id}">
                        ⚡ Quick Track
                    </button>
                    <button class="job-action-btn" data-action="save" data-job-id="${job.id}">
                        ${job.status === "saved" ? "★ Saved" : "☆ Save"}
                    </button>
                    <button class="job-action-btn" data-action="toggle-detail" data-job-id="${job.id}">
                        ${expanded ? "▲ Less" : "▼ More"}
                    </button>
                </div>
                ${expanded && job.description ? `
                    <div class="job-detail-panel">
                        <div class="job-detail-desc">${escHtml(job.description)}</div>
                        ${job.url ? `<div style="margin-top:10px;"><a href="${escHtml(job.url)}" target="_blank" rel="noopener" style="font-size:0.75rem;color:var(--accent);">🔗 Open application page ↗</a></div>` : ""}
                    </div>` : ""}
            </div>
            <span class="job-status-badge ${job.status}">${job.status}</span>
        </div>`;
    }).join("");

    // Event delegation for job card actions
    jobsFeed.addEventListener("click", handleJobCardAction, { once: false });
}

async function handleJobCardAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const jobId = parseInt(btn.dataset.jobId);
    const job = jobListings.find(j => j.id === jobId);
    if (!job) return;

    switch (action) {
        case "toggle-detail":
            expandedJobId = expandedJobId === jobId ? null : jobId;
            renderJobCards();
            break;

        case "save":
            try {
                const newStatus = job.status === "saved" ? "new" : "saved";
                await api.updateJobStatus(jobId, newStatus);
                job.status = newStatus;
                await loadJobsData();
                showToast(newStatus === "saved" ? "Job saved!" : "Job unsaved", "success");
            } catch (err) {
                showToast("Failed to update status", "error");
            }
            break;

        case "apply":
            openWizard(job, true);
            break;

        case "quick-track":
            openWizard(job, false);
            break;
    }
}

// ── Sidebar: Site Manager ─────────────────────────────────────────────────

export function renderJobsSidebar(sidePanel) {
    // Replace the VERSIONS section content with Job Sites manager
    const timelineList = sidePanel.querySelector("#timelineList");
    if (!timelineList) return;

    let html = `
        <div class="site-manager-list" id="jobSitesList">
            ${jobSites.length === 0
                ? `<div style="font-size:0.72rem;color:var(--text-3);padding:8px 0;">No sites tracked yet. Click "Add Site" below.</div>`
                : jobSites.map(site => `
                    <div class="site-item" data-site-id="${site.id}">
                        <span class="site-status-dot ${site.crawl_status}"></span>
                        <span class="site-item-name" title="${escHtml(site.url)}">${escHtml(site.name)}</span>
                        <button class="site-toggle ${site.enabled ? 'active' : ''}" data-site-id="${site.id}" data-action="toggle-site" title="${site.enabled ? 'Disable' : 'Enable'}"></button>
                        <button class="site-item-delete" data-site-id="${site.id}" data-action="delete-site" title="Remove">×</button>
                    </div>`).join("")}
        </div>
        <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">
            <button id="btnAddJobSite" class="btn-scrape" style="background:transparent; border:1px dashed var(--border-light); color:var(--text-muted);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Site
            </button>
            <button id="btnScrapeAll" class="btn-scrape" ${jobSites.filter(s => s.enabled).length === 0 ? 'disabled' : ''}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Scrape Now
            </button>
        </div>
        <div style="margin-top:12px;">
            <button id="btnDetectLocation" class="location-pill">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${userCountryCode === "GLOBAL" ? "Detect Location" : userCountryCode}
            </button>
        </div>
    `;

    timelineList.innerHTML = html;

    // Bind events
    const addBtn = sidePanel.querySelector("#btnAddJobSite");
    if (addBtn) addBtn.addEventListener("click", showAddSiteDialog);

    const scrapeBtn = sidePanel.querySelector("#btnScrapeAll");
    if (scrapeBtn) scrapeBtn.addEventListener("click", handleScrapeAll);

    const locBtn = sidePanel.querySelector("#btnDetectLocation");
    if (locBtn) locBtn.addEventListener("click", handleLocationDetect);

    // Toggle and delete events
    timelineList.addEventListener("click", async (e) => {
        const toggle = e.target.closest("[data-action='toggle-site']");
        if (toggle) {
            const siteId = parseInt(toggle.dataset.siteId);
            const site = jobSites.find(s => s.id === siteId);
            if (site) {
                try {
                    await api.updateJobSite(siteId, { enabled: !site.enabled });
                    site.enabled = !site.enabled;
                    renderJobsSidebar(sidePanel);
                } catch (err) {
                    showToast("Failed to toggle site", "error");
                }
            }
        }

        const del = e.target.closest("[data-action='delete-site']");
        if (del) {
            const siteId = parseInt(del.dataset.siteId);
            if (confirm("Remove this career site and all its scraped listings?")) {
                try {
                    await api.deleteJobSite(siteId);
                    jobSites = jobSites.filter(s => s.id !== siteId);
                    renderJobsSidebar(sidePanel);
                    showToast("Site removed", "success");
                    await loadJobsData();
                } catch (err) {
                    showToast("Failed to remove site", "error");
                }
            }
        }
    });
}

async function showAddSiteDialog() {
    const url = prompt("Enter career page URL:\n\nExamples:\n• https://boards.greenhouse.io/openai\n• https://jobs.lever.co/stripe\n• https://careers.siemens.com");
    if (!url) return;

    const name = prompt("Site name (e.g., 'OpenAI', 'Stripe', 'Siemens'):");
    if (!name) return;

    try {
        const result = await api.addJobSite({ name, url });
        showToast(`Added ${name} (detected: ${result.site_type})`, "success");
        await loadJobsData();
        // Re-render sidebar
        const sidePanel = document.getElementById("sidePanel");
        if (sidePanel) renderJobsSidebar(sidePanel);
    } catch (err) {
        showToast("Failed to add site: " + err.message, "error");
    }
}

async function handleScrapeAll() {
    const scrapeBtn = document.getElementById("btnScrapeAll");
    if (!scrapeBtn) return;

    scrapeBtn.disabled = true;
    scrapeBtn.classList.add("loading");
    scrapeBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Scraping…`;

    try {
        const result = await api.scrapeAllSites();
        const msg = `Found ${result.total_new} new jobs (${result.total_scraped} scraped, ${result.total_duplicates} duplicates)`;
        showToast(msg, "success");
        await loadJobsData();
        const sidePanel = document.getElementById("sidePanel");
        if (sidePanel) renderJobsSidebar(sidePanel);
    } catch (err) {
        showToast("Scrape failed: " + err.message, "error");
    } finally {
        scrapeBtn.disabled = false;
        scrapeBtn.classList.remove("loading");
        scrapeBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Scrape Now`;
    }
}

function handleLocationDetect() {
    if (navigator.geolocation) {
        showToast("Detecting location…", "info");
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const resp = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&zoom=3`,
                        { headers: { "Accept-Language": "en" } }
                    );
                    const data = await resp.json();
                    const cc = data.address?.country_code?.toUpperCase();
                    if (cc) {
                        userCountryCode = cc;
                        showToast(`Location detected: ${cc}`, "success");
                        const sidePanel = document.getElementById("sidePanel");
                        if (sidePanel) renderJobsSidebar(sidePanel);
                    }
                } catch (err) {
                    showToast("Location detection failed", "error");
                }
            },
            () => showToast("Geolocation permission denied", "error"),
            { timeout: 10000 }
        );
    }
}

// ── Application Wizard ────────────────────────────────────────────────────

function openWizard(job, tailoring) {
    wizardJob = job;
    wizardTailoring = tailoring;
    wizardStep = tailoring ? 1 : 3; // Quick Track skips to confirm
    wizardSelectedCvId = null;
    wizardSelectedCvSlug = null;
    wizardBranchSlug = null;
    wizardApplicationStatus = "applied";

    if (applyWizardOverlay) {
        applyWizardOverlay.classList.add("open");
    }
    renderWizardStep();
}

function closeWizard() {
    if (applyWizardOverlay) {
        applyWizardOverlay.classList.remove("open");
    }
    wizardJob = null;
}

function renderWizardStep() {
    renderWizardStepIndicators();

    switch (wizardStep) {
        case 1: renderStep1_ChooseCV(); break;
        case 2: renderStep2_SplitEditor(); break;
        case 3: renderStep3_Confirm(); break;
        case 4: renderStep4_Done(); break;
    }
}

function renderWizardStepIndicators() {
    if (!wizardStepsBar) return;
    const steps = [
        { num: 1, label: "Choose CV" },
        { num: 2, label: "Tailor" },
        { num: 3, label: "Confirm" },
        { num: 4, label: "Done" },
    ];

    wizardStepsBar.innerHTML = steps.map((s, i) => {
        const cls = wizardStep > s.num ? "completed" : (wizardStep === s.num ? "active" : "");
        const lineCls = wizardStep > s.num ? "completed" : "";
        return `
            ${i > 0 ? `<div class="wizard-step-line ${lineCls}"></div>` : ""}
            <div class="wizard-step-indicator ${cls}">
                <div class="wizard-step-dot">${wizardStep > s.num ? "✓" : s.num}</div>
                <span>${s.label}</span>
            </div>`;
    }).join("");
}

// Step 1: Choose CV
async function renderStep1_ChooseCV() {
    if (wizardTitle) wizardTitle.textContent = "Choose CV";
    if (wizardBtnBack) wizardBtnBack.style.display = "none";
    if (wizardBtnNext) {
        wizardBtnNext.textContent = wizardTailoring ? "Tailor & Apply →" : "Use As-Is →";
        wizardBtnNext.disabled = true;
    }

    // Load CV versions
    let cvVersions = [];
    try {
        cvVersions = await api.fetchVersions("cv");
    } catch (err) {
        console.error("Failed to load CVs:", err);
    }

    if (!wizardBody) return;

    wizardBody.innerHTML = `
        <div class="wizard-job-summary">
            <h3>🏢 ${escHtml(wizardJob?.title || "")}</h3>
            <div class="meta">
                <span>${escHtml(wizardJob?.company || "")}</span>
                ${wizardJob?.location ? `<span>· ${escHtml(wizardJob.location)}</span>` : ""}
            </div>
        </div>
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:14px;">Select a CV version to use for this application:</p>
        <div class="wizard-cv-list" id="wizardCvList">
            ${cvVersions.length === 0
                ? `<p style="color:var(--text-subtle);font-size:0.8rem;">No CV versions found. Create one in the CV Vault first.</p>`
                : cvVersions.map(cv => `
                    <div class="wizard-cv-option" data-cv-id="${cv.id}" data-cv-slug="${cv.slug}">
                        <div class="cv-radio"></div>
                        <div class="wizard-cv-info">
                            <div class="cv-name">${escHtml(cv.slug)}</div>
                            <div class="cv-detail">${cv.parent ? `branched from: ${cv.parent}` : "Main version"} · ${cv.date || ""}</div>
                        </div>
                    </div>`).join("")}
        </div>
    `;

    // Bind CV selection
    const cvList = wizardBody.querySelector("#wizardCvList");
    if (cvList) {
        cvList.addEventListener("click", (e) => {
            const opt = e.target.closest(".wizard-cv-option");
            if (!opt) return;
            document.querySelectorAll(".wizard-cv-option").forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
            wizardSelectedCvId = parseInt(opt.dataset.cvId);
            wizardSelectedCvSlug = opt.dataset.cvSlug;
            if (wizardBtnNext) wizardBtnNext.disabled = false;
        });
    }
}

// Step 2: Split-Screen Editor
async function renderStep2_SplitEditor() {
    if (wizardTitle) wizardTitle.textContent = "Tailor Your CV";
    if (wizardBtnBack) { wizardBtnBack.style.display = ""; wizardBtnBack.textContent = "← Back"; }
    if (wizardBtnNext) { wizardBtnNext.textContent = "Save & Continue →"; wizardBtnNext.disabled = false; }

    if (!wizardBody) return;

    // Branch the CV
    const today = new Date().toISOString().split("T")[0];
    const companySlug = (wizardJob?.company || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 20);
    const roleSlug = (wizardJob?.title || "role").toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 30);
    wizardBranchSlug = `${today}-${companySlug}-${roleSlug}`;

    try {
        await api.createBranch("cv", wizardSelectedCvSlug, wizardBranchSlug);
    } catch (err) {
        // Might already exist, use it
        console.warn("Branch creation:", err.message);
    }

    // Fetch the CV data
    let cvData = {};
    try {
        cvData = await api.fetchDocumentJson("cv", wizardBranchSlug);
    } catch {
        cvData = await api.fetchDocumentJson("cv", wizardSelectedCvSlug);
        wizardBranchSlug = wizardSelectedCvSlug;
    }

    wizardBody.innerHTML = `
        <div class="wizard-split-screen">
            <div class="wizard-job-pane">
                <div class="wizard-pane-header">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Job Description
                </div>
                <div class="wizard-pane-body">
                    <div class="wizard-job-desc-content">${escHtml(wizardJob?.description || "No description available.")}</div>
                    ${wizardJob?.url ? `<div style="margin-top:12px;"><a href="${escHtml(wizardJob.url)}" target="_blank" rel="noopener" style="font-size:0.75rem;color:var(--accent);">🔗 Open application page ↗</a></div>` : ""}
                </div>
            </div>
            <div class="wizard-cv-pane">
                <div class="wizard-pane-header">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Editing: ${escHtml(wizardBranchSlug)}
                </div>
                <div class="wizard-pane-body" id="wizardCvEditor">
                    <p style="font-size:0.8rem;color:var(--text-muted);padding:20px;">CV editor will render here. Edit your CV sections, then click "Save & Continue" when ready.</p>
                    <pre style="font-size:0.72rem;color:var(--text-muted);white-space:pre-wrap;padding:12px;background:var(--bg-panel);border-radius:8px;max-height:400px;overflow-y:auto;">${escHtml(JSON.stringify(cvData, null, 2))}</pre>
                </div>
            </div>
        </div>
    `;
}

// Step 3: Confirm
function renderStep3_Confirm() {
    if (wizardTitle) wizardTitle.textContent = "Confirm Application";
    if (wizardBtnBack) { wizardBtnBack.style.display = wizardTailoring ? "" : "none"; }
    if (wizardBtnNext) { wizardBtnNext.textContent = "Confirm & Track ✓"; wizardBtnNext.disabled = false; }

    const cvUsed = wizardBranchSlug || wizardSelectedCvSlug || "Default CV";
    const submissionName = `${wizardJob?.company || "Company"} – ${wizardJob?.title || "Role"}`;

    if (!wizardBody) return;

    wizardBody.innerHTML = `
        <div class="wizard-confirm-summary">
            <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:2rem;margin-bottom:8px;">📋</div>
                <h3 style="font-size:1rem;font-weight:700;color:var(--text-main);">Ready to Track Application</h3>
            </div>
            <div class="confirm-row">
                <span class="confirm-label">Job</span>
                <span class="confirm-value">${escHtml(wizardJob?.title || "")}</span>
            </div>
            <div class="confirm-row">
                <span class="confirm-label">Company</span>
                <span class="confirm-value">${escHtml(wizardJob?.company || "")}</span>
            </div>
            <div class="confirm-row">
                <span class="confirm-label">Location</span>
                <span class="confirm-value">${escHtml(wizardJob?.location || "—")}</span>
            </div>
            <div class="confirm-row">
                <span class="confirm-label">CV Used</span>
                <span class="confirm-value">${escHtml(cvUsed)}</span>
            </div>
            <div class="confirm-row" style="border-bottom:none;">
                <span class="confirm-label">Status</span>
                <div class="wizard-status-options" id="wizardStatusOptions">
                    ${["applied", "saved", "new"].map(s => `
                        <button class="wizard-status-option ${s === wizardApplicationStatus ? 'selected' : ''}" data-status="${s}">
                            ${s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>`).join("")}
                </div>
            </div>
            <div style="margin-top:16px;font-size:0.76rem;color:var(--text-muted);line-height:1.6;">
                This will:<br>
                ✓ Add "<strong>${escHtml(submissionName)}</strong>" to the Linked To list on your CV<br>
                ✓ Update the job card status<br>
                ✓ Create a timestamp record
            </div>
        </div>
    `;

    // Status selection
    const statusOpts = wizardBody.querySelector("#wizardStatusOptions");
    if (statusOpts) {
        statusOpts.addEventListener("click", (e) => {
            const opt = e.target.closest(".wizard-status-option");
            if (!opt) return;
            document.querySelectorAll(".wizard-status-option").forEach(o => o.classList.remove("selected"));
            opt.classList.add("selected");
            wizardApplicationStatus = opt.dataset.status;
        });
    }
}

// Step 4: Done
function renderStep4_Done() {
    if (wizardTitle) wizardTitle.textContent = "Application Tracked!";
    if (wizardBtnBack) wizardBtnBack.style.display = "none";
    if (wizardBtnNext) { wizardBtnNext.textContent = "Done — Back to Jobs"; wizardBtnNext.disabled = false; }

    const submissionName = `${wizardJob?.company || "Company"} – ${wizardJob?.title || "Role"}`;

    if (!wizardBody) return;

    wizardBody.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:3rem;margin-bottom:8px;">🎉</div>
            <h3 style="font-size:1.1rem;font-weight:700;color:var(--text-main);">Application Tracked!</h3>
            <p style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;">${escHtml(submissionName)}</p>
        </div>
        <div class="wizard-done-actions">
            <div class="wizard-done-action" data-done-action="open-url">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                <div>
                    <div class="action-label">Open Application Page</div>
                    <div class="action-desc">Opens the career page in a new tab</div>
                </div>
            </div>
            <div class="wizard-done-action" data-done-action="create-note">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <div>
                    <div class="action-label">Create Interview Prep Note</div>
                    <div class="action-desc">Pre-filled with job details & company info</div>
                </div>
            </div>
        </div>
    `;

    // Bind done actions
    wizardBody.addEventListener("click", async (e) => {
        const action = e.target.closest("[data-done-action]");
        if (!action) return;

        switch (action.dataset.doneAction) {
            case "open-url":
                if (wizardJob?.url) window.open(wizardJob.url, "_blank");
                break;
            case "create-note":
                try {
                    const result = await api.createNote();
                    showToast(`Created note: ${result.filename}`, "success");
                } catch (err) {
                    showToast("Failed to create note", "error");
                }
                break;
        }
    });
}

async function handleWizardNext() {
    switch (wizardStep) {
        case 1:
            if (!wizardSelectedCvSlug) {
                showToast("Please select a CV version", "error");
                return;
            }
            if (wizardTailoring) {
                wizardStep = 2;
            } else {
                wizardStep = 3;
            }
            break;

        case 2:
            // Save the CV (in a full implementation we'd save the contenteditable changes)
            wizardStep = 3;
            break;

        case 3:
            // Execute the application tracking
            try {
                if (wizardBtnNext) { wizardBtnNext.disabled = true; wizardBtnNext.textContent = "Tracking…"; }

                const submissionName = `${wizardJob?.company || "Company"} – ${wizardJob?.title || "Role"}`;
                const cvSlug = wizardBranchSlug || wizardSelectedCvSlug;

                // 1. Add submission to the CV
                await api.addSubmission("cv", cvSlug, submissionName);

                // 2. Update job status
                if (wizardJob?.id) {
                    await api.updateJobStatus(wizardJob.id, wizardApplicationStatus);
                }

                showToast("Application tracked!", "success");
                wizardStep = 4;
            } catch (err) {
                showToast("Failed to track: " + err.message, "error");
                if (wizardBtnNext) { wizardBtnNext.disabled = false; wizardBtnNext.textContent = "Confirm & Track ✓"; }
                return;
            }
            break;

        case 4:
            closeWizard();
            await loadJobsData();
            return;
    }

    renderWizardStep();
}

// ── Utilities ─────────────────────────────────────────────────────────────

function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return "";
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return `${Math.floor(diffDays / 30)}mo ago`;
    } catch {
        return dateStr;
    }
}
