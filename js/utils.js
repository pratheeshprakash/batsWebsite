export const $ = id => document.getElementById(id);

export function showToast(msg, type = "success", duration = 3500) {
    const icons = { success: "✓", error: "✕", info: "ℹ" };
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type] || "·"}</span><span>${msg}</span>`;
    $("toastContainer").appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("show")));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, duration);
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function formatDateToUI(dateStr) {
    if (!dateStr) return "";
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return dateStr;
}

export function parseDateFromUI(dateStr) {
    if (!dateStr) return "";
    const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return dateStr;
}
