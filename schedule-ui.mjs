import {weekDates,slotTime,scheduleList,putBlock,deleteBlock,shiftedBlock,layoutBlocks} from './schedule-core.mjs';
const HEIGHT=26, COUNT=36;
const colors=['#a8443a','#6f8a52','#4f7d8f','#a07a3c','#8a5f86'];
const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n};
export function createSchedule({getData,getDay,onChange,onSelectDay,isReady}){
 let weekAnchor=null,editor=null;
 const dialog=node('dialog','schedule-dialog');dialog.setAttribute('aria-label','시간 기록 수정');document.body.append(dialog);
 function changed(){onChange();render()}
 const read=(date,kind,id)=>scheduleList(getData(),date,kind).find(b=>b.id===id);
 function edit(date,kind,block){
  if(!isReady())return;const original=block?JSON.stringify(block):null, id=block?.id||crypto.randomUUID();
  editor={date,kind,id,original};dialog.replaceChildren();const heading=node('h2','',`${date} · ${kind==='plan'?'계획':'실제'}`);const form=node('form');
  const label=node('label','schedule-field','내용');const text=node('input');text.value=block?.text||'';text.maxLength=1000;text.placeholder=kind==='plan'?'무엇을 할 예정인가요?':'무엇을 했나요?';label.append(text);
  const fields=node('div','schedule-fields');const start=node('select'),end=node('select');
  for(let i=0;i<COUNT;i++){const opt=node('option','',slotTime(i));opt.value=i;start.append(opt)}
  for(let i=1;i<=COUNT;i++){const opt=node('option','',slotTime(i));opt.value=i;end.append(opt)}
  start.value=block?.s??0;end.value=(block?.e??1)+1;
  for(const [title,control] of [['시작',start],['종료',end]]){const l=node('label','schedule-field',title);l.append(control);fields.append(l)}
  const color=node('select');['빨강','초록','파랑','갈색','보라'].forEach((name,i)=>{const option=node('option','',name);option.value=i;color.append(option)});color.value=(block?.color||0)%colors.length;const colorLabel=node('label','schedule-field','색상');colorLabel.append(color);fields.append(colorLabel);
  const error=node('p','load-error');error.setAttribute('role','alert');
  const actions=node('div','dialog-actions');const cancel=node('button','authbtn','취소');cancel.type='button';cancel.onclick=()=>dialog.close();const submit=node('button','authbtn','저장');submit.type='submit';
  const check=()=>{if(!isReady()){error.textContent='로그인과 저장 상태를 확인하세요.';return false}const current=read(date,kind,id);if(original!==null&&JSON.stringify(current)!==original){error.textContent='이 기록이 변경되었습니다. 창을 닫고 최신 기록을 다시 열어주세요.';return false}return true};
  if(block){const del=node('button','authbtn','삭제');del.type='button';del.onclick=()=>{if(!check())return;deleteBlock(getData(),date,kind,id);dialog.close();changed()};actions.append(del)}
  actions.append(cancel,submit);form.append(label,fields,error,actions);dialog.append(heading,form);
  form.onsubmit=e=>{e.preventDefault();if(+end.value<=+start.value){error.textContent='종료는 시작보다 늦어야 해요.';return}if(!check())return;putBlock(getData(),date,kind,{id,s:+start.value,e:+end.value-1,text:text.value,color:+color.value});dialog.close();changed()};
  dialog.showModal();text.focus();
 }
 function grid(host,dates,weekly){
  host.replaceChildren();const scroller=node('div','schedule-scroll');const table=node('div','schedule-grid'+(weekly?' schedule-week':' schedule-day'));table.style.setProperty('--days',dates.length);const corner=node('div','schedule-corner','시간');table.append(corner);
  dates.forEach(date=>{const day=node('div','schedule-date');const d=new Date(date+'T12:00:00');const title=node('button','reset',`${['일','월','화','수','목','금','토'][d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`);title.onclick=()=>onSelectDay(date);day.append(title);table.append(day)});
  table.append(node('div','schedule-corner'));
  dates.forEach(date=>['plan','actual'].forEach(kind=>{const head=node('div','schedule-lane-title '+kind);head.append(node('span','',kind==='plan'?'계획':'실제'));const add=node('button','reset','+');add.setAttribute('aria-label',`${date} ${kind==='plan'?'계획':'실제'} 추가`);add.onclick=()=>edit(date,kind);head.append(add);table.append(head)}));
  const axis=node('div','schedule-axis');axis.style.height=COUNT*HEIGHT+'px';for(let i=0;i<COUNT;i+=2){const tick=node('span','',slotTime(i));tick.style.top=i*HEIGHT+'px';axis.append(tick)}table.append(axis);
  dates.forEach(date=>['plan','actual'].forEach(kind=>{
   const lane=node('div','schedule-lane '+kind);lane.style.height=COUNT*HEIGHT+'px';lane.setAttribute('aria-label',`${date} ${kind==='plan'?'계획':'실제'} 시간표`);
   const selection=node('div','schedule-selection');selection.hidden=true;lane.append(selection);let drag=null;
   const at=e=>Math.max(0,Math.min(COUNT-1,Math.floor((e.clientY-lane.getBoundingClientRect().top)/HEIGHT)));
   lane.onpointerdown=e=>{if(e.target!==lane||e.button!==0||!isReady())return;drag={s:at(e),e:at(e),x:e.clientX,y:e.clientY,touch:e.pointerType==='touch',moved:false};if(!drag.touch){lane.setPointerCapture(e.pointerId);selection.hidden=false;selection.style.top=drag.s*HEIGHT+'px';selection.style.height=HEIGHT+'px'}};
   lane.onpointermove=e=>{if(!drag)return;drag.moved ||= Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>5;if(!drag.touch){drag.e=at(e);selection.style.top=Math.min(drag.s,drag.e)*HEIGHT+'px';selection.style.height=(Math.abs(drag.e-drag.s)+1)*HEIGHT+'px'}};
   lane.onpointercancel=()=>{drag=null;selection.hidden=true};lane.onpointerup=()=>{const d=drag;drag=null;selection.hidden=true;if(!d||(d.touch&&d.moved))return;const s=Math.min(d.s,d.e),e=d.moved?Math.max(d.s,d.e):Math.min(s+1,COUNT-1);edit(date,kind);dialog.querySelectorAll('select')[0].value=s;dialog.querySelectorAll('select')[1].value=e+1};
   layoutBlocks(scheduleList(getData(),date,kind)).forEach(({block,lane:col,count})=>{
    const item=node('div','schedule-block');item.style.cssText=`top:${block.s*HEIGHT}px;height:${(block.e-block.s+1)*HEIGHT-2}px;left:calc(${col/count*100}% + 2px);width:calc(${100/count}% - 4px);--block-color:${colors[(block.color||0)%colors.length]}`;
    const body=node('button','schedule-block-body');body.title=`${slotTime(block.s)}–${slotTime(block.e+1)} ${block.text}`;body.append(node('small','',`${slotTime(block.s)}–${slotTime(block.e+1)}`),node('span','',block.text||'내용 입력'));body.onclick=()=>edit(date,kind,block);item.append(body);
    for(const [mode,title] of [['move','이동'],['top','시작 조절'],['bottom','종료 조절']]){const handle=node('span','schedule-handle '+mode,mode==='move'?'⠿':'');handle.title=title;item.append(handle);handle.onpointerdown=e=>{if(e.button!==0||!isReady())return;e.preventDefault();e.stopPropagation();const y=e.clientY,original=JSON.stringify(block);let next=block;handle.setPointerCapture(e.pointerId);const move=ev=>{next=shiftedBlock(block,Math.round((ev.clientY-y)/HEIGHT),mode);item.style.top=next.s*HEIGHT+'px';item.style.height=(next.e-next.s+1)*HEIGHT-2+'px';body.querySelector('small').textContent=`${slotTime(next.s)}–${slotTime(next.e+1)}`};const end=ev=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);if(ev.type==='pointerup'&&isReady()&&JSON.stringify(read(date,kind,block.id))===original){putBlock(getData(),date,kind,next);changed()}else render()};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end)}}
    lane.append(item);
   });table.append(lane);
  }));scroller.append(table);host.append(scroller);
 }
 function render(){const date=getDay();if(!date)return;grid(document.getElementById('dailySchedule'),[date],false);weekAnchor ||= date;const dates=weekDates(weekAnchor);document.getElementById('weeklyRange').textContent=`${dates[0]} — ${dates[6]}`;grid(document.getElementById('weeklySchedule'),dates,true)}
 for(const [id,amount] of [['weekPrev',-7],['weekNext',7]])document.getElementById(id).onclick=()=>{const d=new Date((weekAnchor||getDay())+'T12:00:00');d.setDate(d.getDate()+amount);weekAnchor=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;render()};
 document.getElementById('weekToday').onclick=()=>{const d=new Date();weekAnchor=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;render()};
 return {render,showWeek(){weekAnchor=getDay();render()},reset(){weekAnchor=null;editor=null;dialog.close()}};
}
