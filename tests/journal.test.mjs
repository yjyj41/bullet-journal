import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clone,emptyJournal,mergeJournal,resolveJournal,validateJournal,moveTask,previousOpenTasks,journalEntryDates} from '../journal-core.mjs';
import {createJournalSync} from '../journal-sync.mjs';
import {weekDates,scheduleKind,scheduleItems,saveSchedule,slotTime,randomScheduleColor} from '../schedule.mjs';
import {parseTimelineExport,routePointCount,routeSummary,routeTrack,validateRoutes} from '../timeline.mjs';

test('Google Timeline arrays become compact daily routes',()=>{
  const routes=parseTimelineExport([
    {startTime:'2026-09-09T08:00:00+01:00',endTime:'2026-09-09T08:30:00+01:00',activity:{start:'geo:51.5,-0.1',end:'geo:51.51,-0.11',distanceMeters:'1250',topCandidate:{type:'WALKING'}}},
    {startTime:'2026-09-09T09:00:00+01:00',endTime:'2026-09-09T10:00:00+01:00',visit:{topCandidate:{semanticType:'WORK',placeLocation:'geo:51.51,-0.11'}}}
  ]);
  const route=routes['2026-09-09'];
  assert.equal(route.segments.length,1);assert.equal(route.visits.length,1);assert.equal(route.distanceMeters,1250);
  assert.equal(routePointCount(route),3);assert.equal(routeSummary(route),'방문 1곳 · 1.3km 이동 · 이동 1구간');
  assert.deepEqual(routeTrack(route),[[51.5,-0.1],[51.51,-0.11]]);
  assert.deepEqual(validateRoutes(routes),routes);
});

test('Timeline parser accepts semanticSegments wrapper and rejects non-location exports',()=>{
  const routes=parseTimelineExport({semanticSegments:[{startTime:'2026-09-10T12:00:00Z',endTime:'2026-09-10T12:05:00Z',timelinePath:[{point:'geo:37.5,127.0'},{point:'invalid'}]}]});
  assert.equal(Object.keys(routes).length,1);assert.equal(Object.values(routes)[0].segments[0].points.length,1);
  assert.throws(()=>parseTimelineExport({items:[]}));assert.throws(()=>parseTimelineExport([]));
});

const dateKey=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
test('new actual schedule colors cover the five-color palette and remain in range',()=>{
  assert.deepEqual([0,.2,.4,.6,.8,.999999].map(value=>randomScheduleColor(()=>value)),[0,1,2,3,4,4]);
  assert.equal(randomScheduleColor(()=>1),4);
  assert.equal(randomScheduleColor(()=>Number.NaN),0);
  for(let i=0;i<100;i++)assert.ok(randomScheduleColor()>=0&&randomScheduleColor()<=4);
});
test('Weekly is Monday to Sunday across a year boundary, including Sunday selection',()=>{
  const expected=['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04'];
  assert.deepEqual(weekDates(new Date(2026,0,1)).map(dateKey),expected);
  assert.deepEqual(weekDates(new Date(2026,0,4)).map(dateKey),expected);
});
test('Weekly includes leap day and stays consecutive through daylight-saving week',()=>{
  assert.ok(weekDates(new Date(2024,1,29)).map(dateKey).includes('2024-02-29'));
  assert.deepEqual(weekDates(new Date(2026,2,29)).map(dateKey),['2026-03-23','2026-03-24','2026-03-25','2026-03-26','2026-03-27','2026-03-28','2026-03-29']);
});
test('legacy schedule is actual without migration or duplicate entries',()=>{
  const data=emptyJournal();const legacy={id:'legacy',s:2,e:3,text:'지난 기록',color:0};data.sched['2026-09-09']=[legacy];
  assert.equal(scheduleKind(legacy),'actual');assert.equal(scheduleItems(data,'2026-09-09','actual')[0],legacy);
  assert.equal(scheduleItems(data,'2026-09-09','plan').length,0);assert.equal(legacy.kind,undefined);assert.deepEqual(validateJournal(data),data);
});
test('daily and weekly share edits, lane changes, deletion and backup records',()=>{
  const data=emptyJournal(),key='2026-09-09';
  saveSchedule(data,key,{id:'one',kind:'plan',s:0,e:1,text:'계획',color:2});
  const weekly=scheduleItems(data,key,'plan');assert.equal(weekly[0].text,'계획');
  saveSchedule(data,key,{...weekly[0],kind:'actual',s:2,e:4,text:'실제'});
  assert.equal(scheduleItems(data,key,'plan').length,0);assert.equal(scheduleItems(data,key,'actual')[0].text,'실제');
  const restored=validateJournal(JSON.parse(JSON.stringify(data)));assert.equal(scheduleItems(restored,key,'actual')[0].e,4);
  data.sched[key]=data.sched[key].filter(b=>b.id!=='one');assert.equal(scheduleItems(data,key,'actual').length,0);
});
test('schedule range rejects reversed times and supports midnight endpoint',()=>{
  const data=emptyJournal(),block={id:'end',kind:'actual',s:35,e:35,text:'마무리',color:0};
  saveSchedule(data,'2026-09-09',block);assert.equal(slotTime(36),'24:00');
  assert.throws(()=>saveSchedule(data,'2026-09-09',{...block,s:5,e:4}));
  assert.throws(()=>saveSchedule(data,'2026-09-09',{...block,e:36}));
  assert.throws(()=>validateJournal({...data,sched:{today:[{...block,kind:'other'}]}}));
});

const task = text => ({type:'task',status:'open',text,pri:false});
test('journal calendar finds text, reflection, photo and route-only dates without empty drafts',()=>{
  const data=emptyJournal();data.journal={'2026-09-09':'일기','2026-09-08':'  ','2026-09-07':''};
  data.reflections={'2026-09-09':'같은 날','2024-02-29':'윤년 기록'};data.photos={'2025-12-31':['photo'],'2026-01-01':[]};data.routes={'2026-02-03':{segments:[],visits:[{point:[37.5,127],start:'',end:'',type:''}],distanceMeters:0}};
  const before=JSON.stringify(data);
  assert.deepEqual(journalEntryDates(data),['2024-02-29','2025-12-31','2026-02-03','2026-09-09']);
  assert.equal(JSON.stringify(data),before);
});
test('journal calendar supports old data without reflection or photo maps',()=>{
  assert.deepEqual(journalEntryDates({journal:{'2026-01-01':'새해'}}),['2026-01-01']);
});
const memory = () => {const map=new Map(); return {getItem:k=>map.get(k) ?? null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};};
function harness(initial=emptyJournal(), options={}) {
  let remote=clone(initial), failRead=false, failSave=false, release=null;
  const storage=options.storage || memory(), states=[], rendered=[], conflicts=[];
  const engine=createJournalSync({delay:100000,key:options.key || 'account:a',storage,
    read:async()=>{if(failRead) throw Error('offline'); return clone(remote);},
    commit:async(base,local)=>{if(release) await new Promise(r=>{release=r;}); if(failSave) throw Error('offline'); const merged=mergeJournal(base,local,remote); if(merged.conflicts.length) return {...merged,remote:clone(remote)}; remote=clone(merged.value); return merged;},
    onData:value=>rendered.push(value),onState:(state,info)=>states.push({state,...info}),onConflict:value=>conflicts.push(value)});
  return {engine,storage,states,rendered,conflicts,get remote(){return remote;},set remote(value){remote=clone(value);},set failRead(v){failRead=v;},set failSave(v){failSave=v;},
    pause(){release=true;},resume(){const fn=release;release=null;fn();}};
}

test('separate days, reflections and habit checks merge without losing either device',()=>{
  const base=emptyJournal(), local=clone(base), remote=clone(base);
  local.days['2026-09-09']=[task('집')]; remote.days['2026-09-10']=[task('회사')];
  local.reflections['2026-09-09']='좋은 하루'; remote.habitLog['2026-09-09|water']=true;
  const merged=mergeJournal(base,local,remote);
  assert.equal(merged.conflicts.length,0); assert.deepEqual(merged.value.days,{...local.days,...remote.days});
  assert.equal(merged.value.reflections['2026-09-09'],'좋은 하루'); assert.equal(merged.value.habitLog['2026-09-09|water'],true);
});
test('same-day conflict requires a choice and preserves non-conflicting changes',()=>{
  const base=emptyJournal(); base.days['2026-09-09']=[task('원래')];
  const local=clone(base),remote=clone(base); local.days['2026-09-09'][0].text='집';remote.days['2026-09-09'][0].text='회사';remote.journal['2026-09-10']='새 일기';
  const result=mergeJournal(base,local,remote); assert.equal(result.conflicts.length,1);
  assert.equal(resolveJournal(result.value,result.conflicts,'remote').days['2026-09-09'][0].text,'회사');
  assert.equal(resolveJournal(result.value,result.conflicts,'local').journal['2026-09-10'],'새 일기');
});
test('remote deletion and unrelated local change both survive',()=>{
  const base=emptyJournal();base.journal.a='old'; const local=clone(base),remote=clone(base);local.journal.b='new';delete remote.journal.a;
  assert.deepEqual(mergeJournal(base,local,remote).value.journal,{b:'new'});
});
test('migration crosses month/year and does not duplicate an already migrated item',()=>{
  const data=emptyJournal();data.days['2026-12-31']=[task('계획')];
  assert.equal(moveTask(data,'2026-12-31','2027-01-01',0,()=> 'child'),true);
  assert.equal(data.days['2026-12-31'][0].to,'2027-01-01');
  assert.equal(data.days['2027-01-01'][0].from,'2026-12-31');
  assert.equal(moveTask(data,'2026-12-31','2027-01-01',0,()=> 'duplicate'),false);
  assert.equal(data.days['2027-01-01'].length,1);
  data.days['2027-01-01'][0].text='옮긴 후 수정';data.days['2026-12-31'].splice(0,1);
  assert.equal(data.days['2027-01-01'][0].text,'옮긴 후 수정');
});
test('backlog excludes completed, migrated, future and non-task records',()=>{
  const data=emptyJournal();data.days['2026-09-08']=[task('남음'),{...task('완료'),status:'done'},{...task('메모'),type:'note'}];data.days['2026-09-10']=[task('미래')];
  assert.deepEqual(previousOpenTasks(data,'2026-09-09').map(x=>x.item.text),['남음']);
});
test('legacy data validates; malformed or prototype-polluting backups fail',()=>{
  const legacy=emptyJournal(); delete legacy.reflections; assert.deepEqual(validateJournal(legacy),legacy);
  assert.throws(()=>validateJournal({...legacy,days:{x:'oops'}}));
  assert.throws(()=>validateJournal(JSON.parse('{"days":{},"journal":{},"__proto__":{"polluted":true}}')));
  assert.throws(()=>validateJournal({...legacy,habits:[{name:42}]}));
});
test('successful save clears the account draft only after cloud acknowledgement',async t=>{
  const h=harness();t.after(()=>h.engine.stop());await h.engine.start(emptyJournal());
  const data=clone(h.remote);data.journal.today='기록';h.engine.edit(data);
  assert.ok(h.storage.getItem('account:a'));assert.equal(h.states.at(-1).state,'pending');
  await h.engine.flush();assert.equal(h.remote.journal.today,'기록');assert.equal(h.storage.getItem('account:a'),null);assert.equal(h.states.at(-1).state,'saved');
});
test('failed save retains draft and retry saves it',async t=>{
  const h=harness();t.after(()=>h.engine.stop());await h.engine.start(emptyJournal());
  const data=clone(h.remote);data.journal.today='offline';h.engine.edit(data);h.failSave=true;
  assert.equal(await h.engine.flush(),false);assert.ok(h.storage.getItem('account:a'));assert.equal(h.states.at(-1).state,'error');
  h.failSave=false;assert.equal(await h.engine.flush(),true);assert.equal(h.remote.journal.today,'offline');
});
test('reload recovers unsaved draft and merges newer independent cloud changes',async t=>{
  const storage=memory(), first=harness(undefined,{storage});await first.engine.start(emptyJournal());
  const local=clone(first.remote);local.journal.local='draft';first.engine.edit(local);first.engine.stop();
  const remote=emptyJournal();remote.journal.remote='new';const next=harness(remote,{storage});t.after(()=>next.engine.stop());await next.engine.start(emptyJournal());
  assert.deepEqual(next.engine.getData().journal,{local:'draft',remote:'new'});await next.engine.flush();assert.deepEqual(next.remote.journal,{local:'draft',remote:'new'});
});
test('failed initial load never enables editing, reports saved, or deletes an existing draft',async()=>{
  const storage=memory();storage.setItem('account:a','existing');const h=harness(undefined,{storage});h.failRead=true;
  await h.engine.start(emptyJournal());assert.equal(h.engine.isReady(),false);assert.equal(h.states.at(-1).state,'load-error');assert.equal(h.states.some(s=>s.state==='saved'),false);
  h.engine.edit(emptyJournal());h.engine.stop();assert.equal(storage.getItem('account:a'),'existing');
});
test('account switch cannot restore another account draft or deliver stale callbacks',async()=>{
  const storage=memory(), a=harness(undefined,{storage,key:'account:a'});await a.engine.start(emptyJournal());const local=clone(a.remote);local.journal.secret='private';a.engine.edit(local);
  a.pause();const pending=a.engine.flush();const before=a.rendered.length;a.engine.stop();a.resume();await pending;assert.equal(a.rendered.length,before);
  const b=harness(undefined,{storage,key:'account:b'});await b.engine.start(emptyJournal());assert.equal(b.engine.getData().journal.secret,undefined);b.engine.stop();
});
test('edits while a save is in flight stay dirty and are sent on the next save',async t=>{
  const h=harness();t.after(()=>h.engine.stop());await h.engine.start(emptyJournal());
  const one=clone(h.remote);one.journal.today='first';h.engine.edit(one);h.pause();const pending=h.engine.flush();
  const two=clone(one);two.journal.today='second';h.engine.edit(two);h.resume();await pending;
  assert.equal(h.engine.getData().journal.today,'second');assert.equal(h.engine.dirty(),true);assert.ok(h.storage.getItem('account:a'));
  await h.engine.flush();assert.equal(h.remote.journal.today,'second');assert.equal(h.engine.dirty(),false);
});
test('transaction conflict never writes remote and resolution keeps other cloud fields',async t=>{
  const base=emptyJournal();base.journal.today='original';const h=harness(base);t.after(()=>h.engine.stop());await h.engine.start(emptyJournal());
  const local=clone(base);local.journal.today='local';h.engine.edit(local);const remote=clone(base);remote.journal.today='remote';remote.journal.other='keep';h.remote=remote;
  assert.equal(await h.engine.flush(),false);assert.equal(h.remote.journal.today,'remote');assert.equal(h.states.at(-1).state,'conflict');
  h.engine.resolve('local');await h.engine.flush();assert.deepEqual(h.remote.journal,{today:'local',other:'keep'});
});
test('storage quota failure is surfaced while cloud saving can still succeed',async t=>{
  const h=harness(undefined,{storage:{getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}}});t.after(()=>h.engine.stop());await h.engine.start(emptyJournal());
  const data=clone(h.remote);data.journal.a='entry';h.engine.edit(data);assert.equal(h.states.at(-1).localSafe,false);await h.engine.flush();assert.equal(h.remote.journal.a,'entry');
});
test('page references existing modules and has no duplicate static IDs',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const markup=html.slice(0,html.indexOf('<script type="module">'));
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  assert.ok(html.includes("!e.isComposing"));assert.ok(html.includes("getDocFromServer"));assert.ok(!html.includes('taskCycle'));
  for(const name of ['journal-core.mjs','journal-sync.mjs']) assert.ok(fs.existsSync(new URL('../'+name,import.meta.url)));
});

test('undo back to the acknowledged state reports saved instead of remaining pending',async t=>{
  const h=harness();t.after(()=>h.engine.stop());await h.engine.start(emptyJournal());
  const data=clone(h.remote);data.journal.today='temporary';h.engine.edit(data);h.engine.edit(h.remote);
  assert.equal(h.engine.dirty(),false);assert.equal(h.states.at(-1).state,'saved');
});
test('conflict caused by a new edit during save still honors the cloud choice',async t=>{
  const base=emptyJournal();base.journal.today='original';const h=harness(base);t.after(()=>h.engine.stop());await h.engine.start(emptyJournal());
  const local=clone(base);local.journal.other='first';h.engine.edit(local);h.pause();const pending=h.engine.flush();
  const during=clone(local);during.journal.today='typed while saving';h.engine.edit(during);
  const remote=clone(base);remote.journal.today='other device';h.remote=remote;h.resume();await pending;
  assert.ok(h.engine.getConflict());assert.equal(h.remote.journal.today,'other device');
  h.engine.resolve('remote');await h.engine.flush();assert.equal(h.engine.getData().journal.today,'other device');assert.equal(h.engine.getData().journal.other,'first');
});
