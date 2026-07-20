import { supabase } from "./supabase-client.js";

// Fetch currently logged in user from Supabase session
export async function fetchCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Not authenticated");
    return {
        id: user.id,
        email: user.email,
        role: "user"
    };
}

// Fetch all document versions for a given document type
export async function fetchVersions(type) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("doc_type", type)
        .order("created_at", { ascending: false });
    if (error) throw error;
    
    return Promise.all(data.map(async doc => {
        // Fetch submissions for this document
        const { data: subs } = await supabase
            .from("submissions")
            .select("id, name")
            .eq("document_id", doc.id);
        const submissionsList = subs ? subs.map(s => s.name) : [];

        // Build submission_links map: submission_name -> linked note slug
        const submission_links = {};
        if (subs && subs.length > 0) {
            const subIds = subs.map(s => s.id);
            const { data: noteLinks } = await supabase
                .from("note_links")
                .select("submission_id, note_id")
                .in("submission_id", subIds);
                
            if (noteLinks && noteLinks.length > 0) {
                const noteIds = noteLinks.map(nl => nl.note_id);
                const { data: notes } = await supabase
                    .from("documents")
                    .select("id, slug")
                    .in("id", noteIds);
                    
                if (notes && notes.length > 0) {
                    const noteSlugMap = Object.fromEntries(notes.map(n => [n.id, n.slug]));
                    noteLinks.forEach(nl => {
                        const sub = subs.find(s => s.id === nl.submission_id);
                        const noteSlug = noteSlugMap[nl.note_id];
                        if (sub && noteSlug) {
                            submission_links[sub.name] = noteSlug;
                        }
                    });
                }
            }
        }
        
        // Fetch note links for this document if it is a notes document
        const { data: noteLinks } = await supabase
            .from("note_links")
            .select("submission_id")
            .eq("note_id", doc.id);
        let linkedTo = [];
        if (noteLinks && noteLinks.length > 0) {
            const subIds = noteLinks.map(nl => nl.submission_id);
            const { data: linkedSubs } = await supabase
                .from("submissions")
                .select("name")
                .in("id", subIds);
            linkedTo = linkedSubs ? linkedSubs.map(ls => ls.name) : [];
        }

        // Fetch reminder
        const { data: rems } = await supabase
            .from("reminders")
            .select("*")
            .eq("document_id", doc.id)
            .maybeSingle();
        
        // Get parent slug
        let parentSlug = null;
        if (doc.parent_id) {
            const { data: pDoc } = await supabase
                .from("documents")
                .select("slug")
                .eq("id", doc.parent_id)
                .maybeSingle();
            if (pDoc) parentSlug = pDoc.slug;
        }

        const docData = doc.doc_data || {};
        let title = doc.slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        let name = "";
        let location = "";
        let summary = [];

        if (type === "cv" && docData.cv) {
            name = docData.cv.name || "";
            location = docData.cv.location || "";
            if (docData.cv.sections && docData.cv.sections.Summary) {
                summary = docData.cv.sections.Summary;
            }
        } else if (docData.document) {
            title = docData.document.title || title;
            name = docData.document.author || "";
        }

        // Strip timezone for date display
        const createdDate = doc.created_at.split("T")[0];

        return {
            filename: doc.slug,
            id: doc.id,
            date: createdDate,
            slug: doc.slug,
            title: title,
            name: name,
            location: location,
            summary: summary,
            submissions: submissionsList,
            linked_to: linkedTo,
            submission_links: submission_links,
            reminder_date: rems ? rems.reminder_date : null,
            reminder_msg: rems ? rems.reminder_msg : null,
            reminder_dismissed: rems ? (rems.status === "dismissed") : false,
            reminder_id: rems ? rems.id : null,
            parent: parentSlug,
            docType: doc.doc_type
        };
    }));
}

// Fetch document JSON
export async function fetchDocumentJson(type, filename) {
    const { data, error } = await supabase
        .from("documents")
        .select("doc_data")
        .eq("doc_type", type)
        .eq("slug", filename)
        .single();
    if (error) throw error;
    return data.doc_data;
}

// Save document JSON
export async function saveDocumentJson(docType, filename, data, newDate = null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    const { data: doc } = await supabase
        .from("documents")
        .select("*")
        .eq("doc_type", docType)
        .eq("slug", filename)
        .maybeSingle();

    if (!doc) {
        throw new Error("Document not found");
    }

    let newSlug = filename;
    let createdAt = doc.created_at;

    if (newDate && docType === "notes") {
        const match = filename.match(/^\d{4}-\d{2}-\d{2}/);
        if (match) {
            const datePart = match[0];
            if (datePart !== newDate) {
                newSlug = filename.replace(datePart, newDate);
                createdAt = new Date(newDate).toISOString();
            }
        }
    }

    const { error } = await supabase
        .from("documents")
        .update({
            doc_data: data,
            slug: newSlug,
            created_at: createdAt,
            updated_at: new Date().toISOString()
        })
        .eq("id", doc.id);
    if (error) throw error;
    return { status: "success", filename: newSlug };
}

// Delete document version
export async function deleteDocument(docType, filename) {
    const { error } = await supabase
        .from("documents")
        .delete()
        .eq("doc_type", docType)
        .eq("slug", filename);
    if (error) throw error;
    return { status: "success" };
}

// Branch a new version
export async function createBranch(docType, parent, slug) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    let docData = {};
    let parentId = null;

    if (parent === "__fresh__") {
        const templates = {
            cv: { cv: { name: "Your Name", location: "Your Location", email: "you@example.com", phone: "+00 00 00 00", website: "https://yourwebsite.com", social_networks: [], sections: { Summary: ["Professional summary."], Experience: [], Education: [] } } },
            notes: { document: { type: "notes", title: "Interview Notes", author: "Your Name", sections: {} } },
            bio: { document: { type: "bio", title: "Professional Biography", author: "Your Name", sections: {} } },
            brand: { document: { type: "brand", title: "Personal Operating Manual", author: "Your Name", sections: {} } },
            cover_letters: { document: { type: "cover_letters", title: "Cover Letter", author: "Your Name", sections: {} } },
            portfolio: { document: { type: "portfolio", title: "Project Case Study", author: "Your Name", sections: {} } },
            credentials: { document: { type: "credentials", title: "Certificates & Awards", author: "Your Name", sections: {} } },
            testimonials: { document: { type: "testimonials", title: "References & Testimonials", author: "Your Name", sections: {} } }
        };
        docData = templates[docType] || { document: { title: "Fresh Document", author: "Your Name", sections: {} } };
        // If there is a note template stored in user_settings, use that for notes!
        if (docType === "notes") {
            const { data: templateSetting } = await supabase
                .from("user_settings")
                .select("value")
                .eq("key", "note_template")
                .maybeSingle();
            if (templateSetting) docData = templateSetting.value;
        }
    } else {
        const { data: parentDoc } = await supabase
            .from("documents")
            .select("id, doc_data")
            .eq("doc_type", docType)
            .eq("slug", parent)
            .single();
        if (parentDoc) {
            parentId = parentDoc.id;
            docData = parentDoc.doc_data;
        }
    }

    const { error } = await supabase
        .from("documents")
        .insert({
            user_id: user.id,
            doc_type: docType,
            slug: slug,
            parent_id: parentId,
            doc_data: docData
        });
    if (error) throw error;
    return { status: "success", filename: slug };
}

// Compute YAML diff completely client-side in the browser
export async function fetchDiff(type, v1, v2) {
    const d1 = await fetchDocumentJson(type, v1);
    const d2 = await fetchDocumentJson(type, v2);
    
    const yaml1 = window.jsyaml.dump(d1, { noRefs: true, skipInvalid: true });
    const yaml2 = window.jsyaml.dump(d2, { noRefs: true, skipInvalid: true });
    
    const patch = window.Diff.createTwoFilesPatch(v1, v2, yaml1, yaml2);
    return patch;
}

// Fetch all submissions
export async function fetchAllSubmissions() {
    const { data, error } = await supabase
        .from("submissions")
        .select("*, documents(slug, created_at)")
        .order("name");
    if (error) throw error;
    return data.map(s => ({
        submission: s.name,
        docType: "cv",
        filename: s.documents ? s.documents.slug : "",
        date: s.documents ? s.documents.created_at.split("T")[0] : ""
    }));
}

// Add submission
export async function addSubmission(docType, filename, target) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: doc } = await supabase
        .from("documents")
        .select("id")
        .eq("doc_type", docType)
        .eq("slug", filename)
        .single();

    const { error } = await supabase
        .from("submissions")
        .insert({
            user_id: user.id,
            document_id: doc.id,
            name: target
        });
    if (error) throw error;
    return { status: "success" };
}

// Fetch notes linked to a submission name
export async function fetchLinkedNotes(submission) {
    const { data: sub } = await supabase
        .from("submissions")
        .select("id")
        .eq("name", submission)
        .maybeSingle();
    if (!sub) return [];

    const { data: links } = await supabase
        .from("note_links")
        .select("note_id")
        .eq("submission_id", sub.id);
    if (!links || links.length === 0) return [];

    const noteIds = links.map(l => l.note_id);
    const { data: notes, error } = await supabase
        .from("documents")
        .select("*")
        .in("id", noteIds);
    if (error) throw error;

    return Promise.all(notes.map(async doc => {
        const { data: subs } = await supabase
            .from("submissions")
            .select("name")
            .eq("document_id", doc.id);
        const submissionsList = subs ? subs.map(s => s.name) : [];
        
        const { data: rems } = await supabase
            .from("reminders")
            .select("*")
            .eq("document_id", doc.id)
            .maybeSingle();

        return {
            filename: doc.slug,
            id: doc.id,
            date: doc.created_at.split("T")[0],
            slug: doc.slug,
            title: (doc.doc_data && doc.doc_data.document) ? (doc.doc_data.document.title || doc.slug) : doc.slug,
            name: (doc.doc_data && doc.doc_data.document) ? (doc.doc_data.document.author || "") : "",
            location: "",
            summary: [],
            submissions: submissionsList,
            linked_to: [],
            submission_links: {},
            reminder_date: rems ? rems.reminder_date : null,
            reminder_msg: rems ? rems.reminder_msg : null,
            reminder_dismissed: rems ? (rems.status === "dismissed") : false,
            parent: null,
            docType: doc.doc_type
        };
    }));
}

// Link a note to a submission
export async function linkNote(noteFile, submission) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: note } = await supabase
        .from("documents")
        .select("id")
        .eq("doc_type", "notes")
        .eq("slug", noteFile)
        .single();

    const { data: sub } = await supabase
        .from("submissions")
        .select("id")
        .eq("name", submission)
        .single();

    const { error } = await supabase
        .from("note_links")
        .insert({
            user_id: user.id,
            note_id: note.id,
            submission_id: sub.id
        });
    if (error) throw error;
    return { status: "success" };
}

// Unlink a note from a submission
export async function unlinkNote(noteFile, submission) {
    const { data: note } = await supabase
        .from("documents")
        .select("id")
        .eq("doc_type", "notes")
        .eq("slug", noteFile)
        .single();

    const { data: sub } = await supabase
        .from("submissions")
        .select("id")
        .eq("name", submission)
        .single();

    const { error } = await supabase
        .from("note_links")
        .delete()
        .eq("note_id", note.id)
        .eq("submission_id", sub.id);
    if (error) throw error;
    return { status: "success" };
}

// Fetch notes template (customized or default) in YAML format
export async function fetchNoteTemplate() {
    const { data } = await supabase
        .from("user_settings")
        .select("value")
        .eq("key", "note_template")
        .maybeSingle();
    if (data && data.value) {
        return window.jsyaml.dump(data.value, { noRefs: true, skipInvalid: true });
    }
    // Fallback template
    const defaultTemplate = {
        document: {
            type: "notes",
            title: "Interview Notes",
            author: "Your Name",
            sections: {
                "Company Overview": [
                    { bullet: "Company: " },
                    { bullet: "Role / Level: " }
                ]
            }
        }
    };
    return window.jsyaml.dump(defaultTemplate);
}

// Save notes template in YAML format
export async function saveNoteTemplate(template) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const parsed = window.jsyaml.load(template);
    const { error } = await supabase
        .from("user_settings")
        .upsert({
            user_id: user.id,
            key: "note_template",
            value: parsed
        });
    if (error) throw error;
    return { status: "success" };
}

// Create a new note from the template
export async function createNote() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const today = new Date().toISOString().split("T")[0];
    const baseSlug = `${today}-interview-notes`;
    let slug = baseSlug;
    let counter = 1;

    while (true) {
        const { data } = await supabase
            .from("documents")
            .select("id")
            .eq("doc_type", "notes")
            .eq("slug", slug)
            .maybeSingle();
        if (!data) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
    }

    let noteData = { document: { type: "notes", title: "Interview Notes", author: "Your Name", sections: {} } };
    const { data: templateSetting } = await supabase
        .from("user_settings")
        .select("value")
        .eq("key", "note_template")
        .maybeSingle();
    if (templateSetting && templateSetting.value) {
        noteData = templateSetting.value;
    }

    const { error } = await supabase
        .from("documents")
        .insert({
            user_id: user.id,
            doc_type: "notes",
            slug: slug,
            doc_data: noteData
        });
    if (error) throw error;
    return { status: "created", filename: slug };
}

// Fetch all reminders
export async function fetchReminders() {
    const { data, error } = await supabase
        .from("reminders")
        .select("*, documents(slug)")
        .order("reminder_date");
    if (error) throw error;
    return data.map(r => ({
        id: r.id,
        docType: r.doc_type,
        filename: r.documents ? r.documents.slug : "",
        date: r.reminder_date,
        msg: r.reminder_msg,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at
    }));
}

// Set or update reminder
export async function setReminder(docType, filename, date, msg, id = null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: doc } = await supabase
        .from("documents")
        .select("id")
        .eq("doc_type", docType)
        .eq("slug", filename)
        .single();

    const payload = {
        user_id: user.id,
        document_id: doc.id,
        doc_type: docType,
        reminder_date: date,
        reminder_msg: msg,
        status: "active",
        updated_at: new Date().toISOString()
    };

    if (id) {
        const { error } = await supabase
            .from("reminders")
            .update(payload)
            .eq("id", id);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from("reminders")
            .insert(payload);
        if (error) throw error;
    }
    return { status: "success" };
}

// Dismiss reminder
export async function dismissReminder(id) {
    const { error } = await supabase
        .from("reminders")
        .update({
            status: "dismissed",
            updated_at: new Date().toISOString()
        })
        .eq("id", id);
    if (error) throw error;
    return { status: "success" };
}

// Fetch tabs layout configuration
export async function fetchTabs() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data } = await supabase
        .from("user_settings")
        .select("value")
        .eq("key", "tabs_config")
        .maybeSingle();

    if (data && data.value) {
        return data.value;
    }

    const defaultTabs = {
        active_tabs: [
            { type: "cv", label: "CV Vault", icon: "file-text", color: "#4f8ef7", isDefault: true, theme: "professional-navy" },
            { type: "notes", label: "Notes", icon: "edit-3", color: "#fbbf24", isDefault: true, theme: "minimal-clean" }
        ],
        suggestions: [
            { type: "bio", label: "Biography", icon: "user", color: "#22d3a0", theme: "classic-serif" },
            { type: "brand", label: "Brand Manual", icon: "star", color: "#a78bfa", theme: "modern-sans" },
            { type: "cover_letters", label: "Cover Letters", icon: "file-text", color: "#06b6d4", theme: "classic-serif" },
            { type: "portfolio", label: "Project Portfolio", icon: "briefcase", color: "#f97316", theme: "modern-sans" },
            { type: "credentials", label: "Certificates & Awards", icon: "award", color: "#f43f5e", theme: "monochrome" },
            { type: "testimonials", label: "References & Testimonials", icon: "message-square", color: "#6366f1", theme: "minimal-clean" }
        ]
    };
    
    // Seed default settings row in background
    await supabase.from("user_settings").insert({
        user_id: user.id,
        key: "tabs_config",
        value: defaultTabs
    });
    
    return defaultTabs;
}

// Save tabs layout configuration
export async function saveTabs(tabsData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
        .from("user_settings")
        .upsert({
            user_id: user.id,
            key: "tabs_config",
            value: tabsData
        });
    if (error) throw error;
    return { status: "success" };
}

// Promote child version (clear parent)
export async function promoteDocument(docType, filename) {
    const { data: doc } = await supabase
        .from("documents")
        .select("id")
        .eq("doc_type", docType)
        .eq("slug", filename)
        .single();

    const { error } = await supabase
        .from("documents")
        .update({ parent_id: null, updated_at: new Date().toISOString() })
        .eq("id", doc.id);
    if (error) throw error;
    return { status: "success" };
}

// Rename document version slug
export async function renameDocument(docType, oldFilename, newFilename) {
    const { data: doc } = await supabase
        .from("documents")
        .select("id")
        .eq("doc_type", docType)
        .eq("slug", oldFilename)
        .single();

    const { error } = await supabase
        .from("documents")
        .update({ slug: newFilename, updated_at: new Date().toISOString() })
        .eq("id", doc.id);
    if (error) throw error;
    return { status: "success", filename: newFilename };
}

// Remove submission
export async function removeSubmission(docType, filename, target) {
    const { data: doc } = await supabase
        .from("documents")
        .select("id")
        .eq("doc_type", docType)
        .eq("slug", filename)
        .single();
    if (!doc) throw new Error("Document not found");

    const { error } = await supabase
        .from("submissions")
        .delete()
        .eq("document_id", doc.id)
        .eq("name", target);
    if (error) throw error;
    return { status: "success" };
}

// Fetch all note-submission links
export async function getAllLinks() {
    const { data, error } = await supabase
        .from("note_links")
        .select("note_id, submission_id, documents(slug), submissions(name)");
    if (error) throw error;
    
    return {
        links: data.map(l => ({
            note: l.documents ? l.documents.slug : "",
            submission: l.submissions ? l.submissions.name : ""
        }))
    };
}

// ── Default configurations and Seeding ──
const DEFAULT_TABS_CONFIG = {
    active_tabs: [
        { type: "cv", label: "CV Vault", icon: "file-text", color: "#4f8ef7", isDefault: true, theme: "professional-navy" },
        { type: "notes", label: "Notes", icon: "edit-3", color: "#fbbf24", isDefault: true, theme: "minimal-clean" }
    ],
    suggestions: [
        { type: "bio", label: "Biography", icon: "user", color: "#22d3a0", theme: "classic-serif" },
        { type: "brand", label: "Brand Manual", icon: "star", color: "#a78bfa", theme: "modern-sans" },
        { type: "cover_letters", label: "Cover Letters", icon: "file-text", color: "#06b6d4", theme: "classic-serif" },
        { type: "portfolio", label: "Project Portfolio", icon: "briefcase", color: "#f97316", theme: "modern-sans" },
        { type: "credentials", label: "Certificates & Awards", icon: "award", color: "#f43f5e", theme: "monochrome" },
        { type: "testimonials", label: "References & Testimonials", icon: "message-square", color: "#6366f1", theme: "minimal-clean" }
    ]
};

const DEFAULT_NOTE_TEMPLATE = {
    document: {
        type: "notes",
        title: "Interview Notes",
        author: "Your Name",
        sections: {
            "Company Overview": [
                { bullet: "Company: " },
                { bullet: "Role / Level: " },
                { bullet: "Team / Department: " },
                { bullet: "Hiring Manager: " },
                { bullet: "Source (LinkedIn / referral / job board): " },
                { bullet: "Job posting URL: " }
            ],
            "Contact Information": [
                { bullet: "Primary contact name: " },
                { bullet: "Email: " },
                { bullet: "Phone: " },
                { bullet: "LinkedIn: " },
                { bullet: "Best time to reach: " }
            ],
            "Round 1 — Phone Screen": [
                { bullet: "Interviewer name & title: " },
                { bullet: "Format (duration, style): " },
                { bullet: "Questions asked: " },
                { bullet: "My responses: " },
                { bullet: "Their interest signals: " },
                { bullet: "My questions to them: " },
                { bullet: "Follow-up agreed: " }
            ],
            "Salary & Compensation": [
                { bullet: "Base salary discussed: " },
                { bullet: "Bonus / equity: " },
                { bullet: "Benefits / perks: " },
                { bullet: "Relocation package: " },
                { bullet: "My counteroffer / expectations: " }
            ],
            "Reminder / Next Action": [
                { bullet: "Next action: " },
                { bullet: "Follow-up date (YYYY-MM-DD): " },
                { bullet: "Who to contact: " }
            ]
        }
    }
};

const SAMPLE_CV = {
    cv: {
        name: "Jane Doe",
        location: "Copenhagen, Denmark",
        email: "jane.doe@example.com",
        phone: "+45 12 34 56 78",
        website: "https://janedoe.dev",
        social_networks: [
            { network: "LinkedIn", username: "janedoe" },
            { network: "GitHub", username: "janedoe" }
        ],
        sections: {
            Summary: [
                "Experienced software engineer with 8+ years in distributed systems, cloud infrastructure, and full-stack web development. Passionate about building scalable, user-centered products."
            ],
            Experience: [
                {
                    company: "Acme Robotics",
                    position: "Senior Software Engineer",
                    location: "Copenhagen, Denmark",
                    start_date: "2022-03",
                    end_date: "present",
                    highlights: [
                        "Architected a real-time sensor fusion pipeline processing 10k+ messages/sec.",
                        "Led migration from monolith to microservices, reducing deployment time by 60%.",
                        "Mentored a team of 4 junior engineers on best practices and code review."
                    ]
                },
                {
                    company: "NovaTech Solutions",
                    position: "Software Engineer",
                    location: "Berlin, Germany",
                    start_date: "2019-01",
                    end_date: "2022-02",
                    highlights: [
                        "Developed a customer-facing analytics dashboard serving 50k+ monthly users.",
                        "Implemented CI/CD pipelines with GitHub Actions, cutting release cycle from weeks to hours.",
                        "Designed RESTful APIs consumed by mobile and web clients."
                    ]
                }
            ],
            Education: [
                {
                    institution: "Technical University of Denmark",
                    area: "M.Sc. Computer Science",
                    start_date: "2017",
                    end_date: "2019"
                },
                {
                    institution: "University of Hamburg",
                    area: "B.Sc. Software Engineering",
                    start_date: "2014",
                    end_date: "2017"
                }
            ],
            Skills: [
                "Python, TypeScript, Go, Rust",
                "FastAPI, React, PostgreSQL, Redis",
                "Docker, Kubernetes, AWS, Terraform",
                "ROS2, Computer Vision, SLAM"
            ]
        }
    }
};

const SAMPLE_NOTE = {
    document: {
        type: "notes",
        title: "Interview Notes",
        author: "Jane Doe",
        sections: {
            "Company Overview": [
                { bullet: "Company: Stellar Dynamics" },
                { bullet: "Role / Level: Lead Platform Engineer" },
                { bullet: "Team / Department: Infrastructure & DevOps" },
                { bullet: "Hiring Manager: Alex Chen, VP Engineering" },
                { bullet: "Source (LinkedIn / referral / job board): LinkedIn" },
                { bullet: "Job posting URL: https://stellardynamics.io/careers/lead-platform" }
            ],
            "Contact Information": [
                { bullet: "Primary contact name: Sarah Kim, Technical Recruiter" },
                { bullet: "Email: sarah.kim@stellardynamics.io" },
                { bullet: "Phone: +45 98 76 54 32" },
                { bullet: "LinkedIn: linkedin.com/in/sarahkim" },
                { bullet: "Best time to reach: Weekdays 10:00–12:00 CET" }
            ],
            "Round 1 — Phone Screen": [
                { bullet: "Interviewer name & title: Sarah Kim, Technical Recruiter" },
                { bullet: "Format (duration, style): 30 min, conversational" },
                { bullet: "Questions asked: Background, motivation, salary expectations" },
                { bullet: "My responses: Emphasized distributed systems experience, mentioned salary range" },
                { bullet: "Their interest signals: Scheduled technical round immediately" },
                { bullet: "My questions to them: Team size, tech stack, remote policy" },
                { bullet: "Follow-up agreed: Technical interview next week" }
            ],
            "Salary & Compensation": [
                { bullet: "Base salary discussed: 650k–750k DKK" },
                { bullet: "Bonus / equity: 10% annual bonus + stock options" },
                { bullet: "Benefits / perks: Health insurance, lunch scheme, commuter pass" },
                { bullet: "Relocation package: N/A (local)" },
                { bullet: "My counteroffer / expectations: Targeting 720k base" }
            ],
            "Reminder / Next Action": [
                { bullet: "Next action: Prepare system design examples for Round 2" },
                { bullet: "Follow-up date (YYYY-MM-DD): 2026-07-25" },
                { bullet: "Who to contact: Sarah Kim" }
            ]
        }
    }
};

// Client-side seed executor for fresh user signups
export async function seedUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // 1. Seed user settings
    await supabase.from("user_settings").insert([
        { user_id: user.id, key: "tabs_config", value: DEFAULT_TABS_CONFIG },
        { user_id: user.id, key: "note_template", value: DEFAULT_NOTE_TEMPLATE }
    ]);

    // 2. Seed default documents
    await supabase.from("documents").insert([
        { user_id: user.id, doc_type: "cv", slug: "base", doc_data: SAMPLE_CV },
        { user_id: user.id, doc_type: "notes", slug: "2026-07-20-stellar-dynamics", doc_data: SAMPLE_NOTE }
    ]);
}
