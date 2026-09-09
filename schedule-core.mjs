export const SLOT_COUNT=36;
export const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function weekDates(day){const d=new Date(day+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(x.getDate()+i);return dateKey(x)})}
export const slotTime=i=>`${String(6+Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`;
export function scheduleList(data,date,kind){return data[kind==='plan'?'schedPlans':'sched']?.[date]||[]}
export function putBlock(data,date,kind,block){const key=kind==='plan'?'schedPlans':'sched';data[key]??={};data[key][date]=[...scheduleList(data,date,kind).filter(b=>b.id!==block.id),{...block}]}
export function deleteBlock(data,date,kind,id){const key=kind==='plan'?'schedPlans':'sched';data[key]??={};data[key][date]=scheduleList(data,date,kind).filter(b=>b.id!==id)}
export function shiftedBlock(block,delta,mode){let {s,e}=block;const duration=e-s;if(mode==='move'){s=Math.max(0,Math.min(SLOT_COUNT-1-duration,s+delta));e=s+duration}else if(mode==='top')s=Math.max(0,Math.min(e,s+delta));else e=Math.min(SLOT_COUNT-1,Math.max(s,e+delta));return {...block,s,e}}
export function layoutBlocks(blocks){const sorted=blocks.slice().sort((a,b)=>a.s-b.s||a.e-b.e);const output=[];let group=[],end=-1;function flush(){const lanes=[];const placed=group.map(block=>{let lane=lanes.findIndex(e=>e<block.s);if(lane<0)lane=lanes.length;lanes[lane]=block.e;return {block,lane}});output.push(...placed.map(p=>({...p,count:lanes.length})));group=[]}for(const block of sorted){if(block.s>end){flush();end=-1}group.push(block);end=Math.max(end,block.e)}flush();return output}
