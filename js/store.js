export const DOC_META = {};

const internalState = {
    activeDocType: "cv",
    versions: {},          // { cv: [...], bio: [...], brand: [...], notes: [...] }
    activeVersion: null,
    activeJson: null,
    searchTerm: "",
    isDirty: false,
};

const listeners = [];

export function subscribe(listener) {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
    };
}

export const store = new Proxy(internalState, {
    set(target, prop, value) {
        target[prop] = value;
        listeners.forEach(l => l(prop, value, target));
        return true;
    }
});

export function markDirty() {
    if (!store.isDirty) store.isDirty = true;
}

export function markClean() {
    store.isDirty = false;
}
