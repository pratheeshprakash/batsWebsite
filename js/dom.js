export const $ = id => document.getElementById(id);

// ── DOM refs ──────────────────────────────────────────────────────────────────
export const timelineList       = $("timelineList");
export const searchBar          = $("searchBar");
export const activeCvTitle      = $("activeCvTitle");
export const activeCvDate       = $("activeCvDate");
export const activeCvLocation   = $("activeCvLocation");
export const submissionCountBadge = $("submissionCountBadge");
export const submissionList     = $("submissionList");
export const addSubmissionForm  = $("addSubmissionForm");
export const addSubmissionInput = $("addSubmissionInput");
export const previewIframe      = $("previewIframe");
export const previewLoader      = $("previewLoader");
export const paperSheet         = $("paperSheet");
export const cvNavBadge         = $("cvCountBadge");
export const bioNavBadge        = $("bioCountBadge");
export const brandNavBadge      = $("brandCountBadge");
export const notesNavBadge      = $("notesCountBadge");
export const NAV_BADGES         = { cv: cvNavBadge, bio: bioNavBadge, brand: brandNavBadge, notes: notesNavBadge };
export const unsavedDot         = $("unsavedDot");
export const btnSaveDetails     = $("btnSaveDetails");
export const btnBranchNew       = $("btnBranchNew");
export const btnCompare         = $("btnCompare");
export const btnDownloadPdf     = $("btnDownloadPdf");
export const btnDeleteCv        = $("btnDeleteCv");
// cvOnlyActions no longer exists — PDF is its own button now
export const submissionsPanel   = $("submissionsPanel");
export const diffOverlay        = $("diffOverlay");
export const btnCloseDiff       = $("btnCloseDiff");
export const diffSelectV1       = $("diffSelectV1");
export const diffSelectV2       = $("diffSelectV2");
export const diffContainer      = $("diffContainer");
export const branchOverlay      = $("branchOverlay");
export const btnCloseBranch     = $("btnCloseBranch");
export const branchSelectBase   = $("branchSelectBase");
export const branchInputSlug    = $("branchInputSlug");
export const btnCreateBranchSubmit = $("btnCreateBranchSubmit");
export const deleteModal        = $("deleteModal");
export const deleteModalBody    = $("deleteModalBody");
export const btnDeleteCancel    = $("btnDeleteCancel");
export const btnDeleteConfirm   = $("btnDeleteConfirm");


// Note template refs
export const noteTemplateSection  = $("noteTemplateSection");
export const btnEditTemplate      = $("btnEditTemplate");
export const noteTemplateModal    = $("noteTemplateModal");
export const noteTemplateEditor   = $("noteTemplateEditor");
export const btnCloseNoteTemplate = $("btnCloseNoteTemplate");
export const btnCancelNoteTemplate= $("btnCancelNoteTemplate");
export const btnSaveNoteTemplate  = $("btnSaveNoteTemplate");

// Reminder banner refs
export const reminderBanner       = $("reminderBanner");
export const reminderTitle        = $("reminderTitle");
export const reminderMsg          = $("reminderMsg");
export const btnReminderJump      = $("btnReminderJump");
export const btnReminderSnooze1   = $("btnReminderSnooze1");
export const btnReminderSnooze3   = $("btnReminderSnooze3");
export const btnReminderDismiss   = $("btnReminderDismiss");

// Set reminder modal refs
export const btnSetReminder       = $("btnSetReminder");
export const reminderSetModal     = $("reminderSetModal");
export const reminderSetNoteLabel = $("reminderSetNoteLabel");
export const reminderDateInput    = $("reminderDateInput");
export const reminderMsgInput     = $("reminderMsgInput");
export const btnCloseReminderSet  = $("btnCloseReminderSet");
export const btnClearReminder     = $("btnClearReminder");
export const btnCancelReminderSet = $("btnCancelReminderSet");
export const btnSaveReminderSet   = $("btnSaveReminderSet");

