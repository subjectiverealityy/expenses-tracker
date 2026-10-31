// The prototype was written for Claude artifacts, which provide `window.storage`.
// This reproduces that small API on top of localStorage so the app behaves the same
// in a normal browser. If localStorage is unavailable (private mode, blocked), it
// falls back to memory, so the app still works but won't remember anything.
const PREFIX = 'ledgerlog-demo:';
const memory = new Map();

const read = (key) => {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    return v === null ? null : v;
  } catch {
    return memory.has(key) ? memory.get(key) : null;
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    memory.set(key, value);
  }
};

const remove = (key) => {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    memory.delete(key);
  }
};

export function installStorage() {
  if (window.storage) return;
  window.storage = {
    get: async (key) => {
      const value = read(key);
      return value === null ? null : { key, value };
    },
    set: async (key, value) => {
      write(key, value);
      return { key, value };
    },
    delete: async (key) => {
      remove(key);
      return { key, deleted: true };
    },
  };
}
