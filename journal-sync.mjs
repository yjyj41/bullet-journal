import {clone, mergeJournal, resolveJournal} from './journal-core.mjs';

// The adapter performs a Firestore transaction against the existing journals/{uid}.
// No collection migration or security-rule change is required.
export function createJournalSync({read, commit, storage, key, onData, onState, onConflict, delay = 600}) {
  let base, current, ready = false, stopped = false, timer, flight, conflict, localSafe = true, refreshNeeded = false;
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const dirty = () => ready && !same(base,current);
  function persist() {
    if (!ready) return;
    try {
      if (dirty()) storage.setItem(key, JSON.stringify({base, current}));
      else storage.removeItem(key);
      localSafe = true;
    } catch { localSafe = false; }
  }
  function status(label) {
    if (!stopped) onState(label, {dirty:dirty(), localSafe, conflict:!!conflict});
  }
  function queue(ms = delay) { clearTimeout(timer); if (!stopped && !conflict) timer = setTimeout(flush, ms); }
  function receive(remote) {
    if (!ready || stopped || conflict) return;
    if (flight) { refreshNeeded = true; return; }
    const merged = mergeJournal(base,current,remote);
    if (merged.conflicts.length) {
      conflict = {remote:clone(remote), ...merged}; persist();
      status('conflict'); onConflict(merged.conflicts); return;
    }
    const changed = !same(current,merged.value);
    base = clone(remote); current = merged.value; persist();
    if (changed) onData(clone(current));
    status(dirty() ? 'pending' : 'saved');
    if (dirty()) queue();
  }
  async function start(fallback) {
    status('loading');
    try {
      const remote = (await read()) ?? clone(fallback);
      if (stopped) return;
      base = clone(remote); current = clone(remote); ready = true;
      let draft;
      try { const raw = storage.getItem(key); if (raw) draft = JSON.parse(raw); } catch { /* cloud remains authoritative */ }
      if (draft?.base && draft?.current) {
        base = draft.base; current = draft.current;
        onData(clone(current)); receive(remote);
      } else { onData(clone(current)); status('saved'); }
    } catch (error) { if (!stopped) { ready = false; status('load-error'); } }
  }
  function edit(value) {
    if (!ready || stopped) return;
    current = clone(value); persist();
    status(conflict ? 'conflict' : dirty() ? 'pending' : 'saved'); if (dirty()) queue();
  }
  async function flush() {
    clearTimeout(timer);
    if (flight) return flight;
    if (!ready || stopped || conflict) return false;
    if (!dirty()) return true;
    const sentBase = clone(base), sent = clone(current);
    status('saving');
    flight = (async () => {
      try {
        const result = await commit(sentBase,sent);
        if (stopped) return false;
        if (result.conflicts?.length) {
          // Recompute with edits made during the request before presenting choices.
          const merged = mergeJournal(base,current,result.remote);
          if (merged.conflicts.length) {
            conflict = {remote:result.remote,...merged}; persist(); status('conflict'); onConflict(merged.conflicts);
          } else { base = clone(result.remote); current = merged.value; persist(); onData(clone(current)); queue(); }
          return false;
        }
        const merged = mergeJournal(sent,current,result.value);
        if (merged.conflicts.length) {
          // The sent snapshot is the common ancestor for edits made during this save.
          // Keep it for explicit resolution and crash recovery, not the new remote value.
          base = clone(sent);
          conflict = {remote:result.value,...merged}; persist(); status('conflict'); onConflict(merged.conflicts); return false;
        }
        base = clone(result.value);
        const changed = !same(current,merged.value);
        current = merged.value; persist();
        if (changed) onData(clone(current));
        status(dirty() ? 'pending' : 'saved');
        if (dirty()) queue();
        return !dirty();
      } catch { if (!stopped) { persist(); status('error'); queue(5000); } return false; }
      finally {
        flight = null;
        if (refreshNeeded && !stopped && !conflict) {
          refreshNeeded = false;
          try { receive((await read()) ?? {}); } catch { /* reconnect will retry */ }
        }
      }
    })();
    return flight;
  }
  function resolve(choice) {
    if (!conflict || !['local','remote'].includes(choice)) return;
    // Current may have changed after the conflict dialog opened.
    const merged = mergeJournal(base,current,conflict.remote);
    current = resolveJournal(merged.value,merged.conflicts,choice);
    base = clone(conflict.remote); conflict = null; persist(); onData(clone(current));
    status(dirty() ? 'pending' : 'saved'); if (dirty()) queue(0);
  }
  return {start,edit,flush,receive,resolve, dirty, isReady:() => ready,
    getData:() => clone(current), getConflict:() => clone(conflict),
    stop(){ persist(); stopped = true; clearTimeout(timer); }};
}
