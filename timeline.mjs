const dayPattern=/^\d{4}-\d{2}-\d{2}$/;

function point(value) {
  if(typeof value!=='string') return null;
  const match=value.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if(!match) return null;
  const lat=Number(match[1]),lng=Number(match[2]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) return null;
  return [Number(lat.toFixed(6)),Number(lng.toFixed(6))];
}

function localDay(value) {
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return null;
  const pad=n=>String(n).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
}

function clock(value) {
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
}

function spaced(points,max=240) {
  if(points.length<=max) return points;
  const result=[];
  for(let index=0;index<max;index++) result.push(points[Math.round(index*(points.length-1)/(max-1))]);
  return result;
}

function addUnique(list,value) {
  if(!value) return;
  const last=list.at(-1);
  if(!last||last[0]!==value[0]||last[1]!==value[1]) list.push(value);
}

export function parseTimelineExport(value) {
  const source=Array.isArray(value)?value:value?.semanticSegments;
  if(!Array.isArray(source)) throw new Error('Google Timeline JSON 형식을 찾지 못했어요.');
  const routes={};
  for(const item of source) {
    if(!item||typeof item!=='object') continue;
    const day=localDay(item.startTime);
    if(!dayPattern.test(day||'')) continue;
    const route=routes[day] ||= {segments:[],visits:[],distanceMeters:0};
    const start=clock(item.startTime),end=clock(item.endTime);
    if(item.visit?.topCandidate) {
      const candidate=item.visit.topCandidate,location=point(candidate.placeLocation);
      if(location) route.visits.push({start,end,point:location,type:String(candidate.semanticType||'').slice(0,30)});
    }
    const points=[];
    addUnique(points,point(item.activity?.start));
    for(const step of item.timelinePath||[]) addUnique(points,point(step?.point));
    addUnique(points,point(item.activity?.end));
    if(points.length) route.segments.push({start,end,mode:String(item.activity?.topCandidate?.type||'').slice(0,40),points:spaced(points)});
    const distance=Number(item.activity?.distanceMeters);
    if(Number.isFinite(distance)&&distance>0) route.distanceMeters+=Math.round(distance);
  }
  for(const [day,route] of Object.entries(routes)) {
    route.distanceMeters=Math.min(route.distanceMeters,10000000);
    if(!route.segments.length&&!route.visits.length) delete routes[day];
  }
  if(!Object.keys(routes).length) throw new Error('표시할 수 있는 위치 기록이 없어요.');
  return routes;
}

export function validateRoutes(routes) {
  if(routes==null) return {};
  if(!routes||typeof routes!=='object'||Array.isArray(routes)) throw new Error('동선 기록 형식 오류');
  const clean={};
  for(const [day,route] of Object.entries(routes)) {
    if(!dayPattern.test(day)||!route||typeof route!=='object') throw new Error('동선 기록 형식 오류');
    const segments=Array.isArray(route.segments)?route.segments:[],visits=Array.isArray(route.visits)?route.visits:[];
    if(segments.length>500||visits.length>500) throw new Error('동선 기록이 너무 커요.');
    const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
    const short=(value,max)=>typeof value==='string'&&value.length<=max;
    if(segments.some(s=>!s||typeof s!=='object'||!Array.isArray(s.points)||s.points.length>240||!s.points.every(validPoint)||!short(s.start||'',5)||!short(s.end||'',5)||!short(s.mode||'',40))) throw new Error('동선 경로 형식 오류');
    if(visits.some(v=>!v||typeof v!=='object'||!validPoint(v.point)||!short(v.start||'',5)||!short(v.end||'',5)||!short(v.type||'',30))) throw new Error('동선 방문 기록 형식 오류');
    const distance=Number(route.distanceMeters)||0;
    if(!Number.isFinite(distance)||distance<0||distance>10000000) throw new Error('동선 거리 형식 오류');
    clean[day]={segments:segments.map(s=>({start:s.start||'',end:s.end||'',mode:s.mode||'',points:s.points.map(p=>[p[0],p[1]])})),visits:visits.map(v=>({start:v.start||'',end:v.end||'',type:v.type||'',point:[v.point[0],v.point[1]]})),distanceMeters:distance};
  }
  return clean;
}

export function routePointCount(route) {
  return (route?.segments||[]).reduce((sum,segment)=>sum+segment.points.length,0)+(route?.visits||[]).length;
}

export function routeSummary(route) {
  if(!route) return '이 날짜에는 불러온 동선이 없어요.';
  const parts=[];
  if(route.visits?.length) parts.push('방문 '+route.visits.length+'곳');
  const distance=Number(route.distanceMeters)||0;
  if(distance>=1000) parts.push((distance/1000).toFixed(distance>=10000?0:1)+'km 이동');
  else if(distance>0) parts.push(distance+'m 이동');
  if(route.segments?.length) parts.push('이동 '+route.segments.length+'구간');
  return parts.join(' · ')||'위치 점만 기록된 날이에요.';
}
