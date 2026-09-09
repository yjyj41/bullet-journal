// Pure data operations shared by the app and regression tests.
export const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Lists are deliberately atomic: ambiguous edits to the same day's list need a choice.
// Separate days and independent map fields merge without losing either device's work.
export function mergeJournal(base, local, remote, path = [], conflicts = []) {
  if (equal(local, base)) return {value: clone(remote), conflicts};
  if (equal(remote, base) || equal(local, remote)) return {value: clone(local), conflicts};
  if (object(local) && object(remote) && (object(base) || base === undefined)) {
    const value = {};
    for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)])) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('잘못된 데이터 키');
      const child = mergeJournal(base?.[key], local[key], remote[key], [...path, key], conflicts).value;
      if (child !== undefined) value[key] = child;
    }
    return {value, conflicts};
  }
  conflicts.push({path, local: clone(local), remote: clone(remote)});
  return {value: clone(local), conflicts};
}

export function resolveJournal(merged, conflicts, choice) {
  let result = clone(merged);
  if (choice === 'local') return result;
  for (const conflict of conflicts) {
    if (!conflict.path.length) { result = clone(conflict.remote); continue; }
    let target = result;
    for (const key of conflict.path.slice(0, -1)) target = target[key];
    const key = conflict.path.at(-1);
    if (conflict.remote === undefined) delete target[key];
    else target[key] = clone(conflict.remote);
  }
  return result;
}

export function emptyJournal() {
  return {lists:{daily:[],monthly:[]}, days:{}, months:{}, sched:{}, notes:{}, habit:{},
    habitLog:{}, habits:null, journal:{}, reflections:{}, photos:{}, cal:{}, cal2:{}, future:{}};
}

export function validateJournal(data) {
  if (!object(data) || !object(data.days) || !object(data.journal)) throw new Error('불렛저널 백업 형식이 아니에요.');
  const scan = value => {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('잘못된 데이터 키');
      scan(value[key]);
    }
  };
  scan(data);
  for (const key of ['lists','days','months','sched','notes','habit','habitLog','journal','reflections','photos','cal','cal2','future']) {
    if (data[key] !== undefined && !object(data[key])) throw new Error('잘못된 백업 항목: '+key);
  }
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const item = it => object(it) && ['task','event','note'].includes(it.type) && typeof it.text === 'string'
    && ['open','done','migrated','scheduled','strike'].includes(it.status)
    && (it.from == null || validDay(it.from)) && (it.to == null || validDay(it.to))
    && (it._mid == null || safeId(it._mid)) && (it._child == null || safeId(it._child));
  for (const map of [data.days, data.months, data.lists]) {
    for (const list of Object.values(map || {})) if (!Array.isArray(list) || !list.every(item)) throw new Error('할 일 목록 형식 오류');
  }
  for (const list of Object.values(data.sched || {})) {
    if (!Array.isArray(list) || !list.every(b => object(b) && safeId(b.id) && Number.isInteger(b.s) && Number.isInteger(b.e) && b.s >= 0 && b.e >= b.s && b.e < 36 && typeof b.text === 'string' && (b.color == null || (Number.isInteger(b.color) && b.color >= 0)))) throw new Error('시간표 형식 오류');
  }
  for (const map of [data.notes, data.journal, data.reflections, data.cal, data.cal2, data.future]) {
    if (Object.values(map || {}).some(v => typeof v !== 'string')) throw new Error('메모 형식 오류');
  }
  if (data.habits != null && (!Array.isArray(data.habits) || !data.habits.every(h => object(h) && safeId(h.id) && typeof h.name === 'string'))) throw new Error('습관 형식 오류');
  if (Object.values(data.photos || {}).some(ids => !Array.isArray(ids) || ids.some(id => !safeId(id)))) throw new Error('사진 목록 형식 오류');
  return clone(data);
}

export function moveTask(data, source, target, index, makeId) {
  if (source === target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return false;
  const item = data.days[source]?.[index];
  if (!item || item.type !== 'task' || !['open','scheduled'].includes(item.status)) return false;
  const copy = {type:'task', status:'open', text:item.text, pri:!!item.pri, from:source, _mid:makeId()};
  (data.days[target] ||= []).push(copy);
  item.status = 'migrated'; item._child = copy._mid; item.to = target;
  return true;
}

export function previousOpenTasks(data, before) {
  return Object.keys(data.days).filter(k => k < before).sort().flatMap(day =>
    data.days[day].flatMap((item,index) => item.type === 'task' && ['open','scheduled'].includes(item.status) ? [{day,index,item}] : []));
}

export function journalEntryDates(data) {
  return [...new Set([...Object.keys(data.journal || {}), ...Object.keys(data.reflections || {}), ...Object.keys(data.photos || {})])]
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) &&
      ((data.journal?.[key] || '').trim() || (data.reflections?.[key] || '').trim() || data.photos?.[key]?.length))
    .sort();
}
