/* ============================================================
 * 展示模式（SPEC-demo-mode-v1.md）— 網址加 ?demo=1 才生效
 *  - 拿掉 5 位外部打法顧問、清掉別人說明裡的黑名單字與獲利字眼
 *  - 只改記憶體裡的 EMPIRE_DATA 複本，data.js 檔案不動；不寫 localStorage
 *  - 月台卡由 dock-overlay.js 呼叫 filterDock() 過濾
 *  - 必須在 data.js 之後、office3d 主程式之前載入
 * ============================================================ */
(function(){
const BLOCK_CODES=['futures-advisor','range-advisor','intraday-advisor','us-supply-advisor','tw-stock-advisor'];
/* 名字、code、獲利字眼；展示資料裡一筆都不准出現（自測掃這個） */
const BLOCK_RE=/us-supply-advisor|tw-stock-advisor|futures-advisor|range-advisor|intraday-advisor|會賺|真倉|勝率|獲利/i;
/* 先做精準替換保住句子其他部分；替換完還中黑名單的字串整條清空 */
const REPLACE=[
  [/[；;]\s*OI 報單已驗證會賺/g,''],
  [/\s*·?\s*⚠️?\s*交易所\s*真倉\s*live\s*·?\s*/gi,' · '],
  [/\s*·\s*交易所\s*真倉/g,'']
];

function isDemo(search){
  try{return new URLSearchParams(search||'').get('demo')==='1';}catch(e){return false;}
}
function scrub(s){
  if(typeof s!=='string')return s;
  let o=s;REPLACE.forEach(([re,to])=>{o=o.replace(re,to);});
  return BLOCK_RE.test(o)?'':o;
}
function deep(v){
  if(Array.isArray(v))return v.map(deep);
  if(v&&typeof v==='object'){const o={};for(const k in v)o[k]=deep(v[k]);return o;}
  return scrub(v);
}
function sanitizeData(data){
  /* 先用原始 code 過濾，再清文字（反過來 code 會先被清成空字串、逃過過濾） */
  const keep=a=>!BLOCK_CODES.includes(a.code);
  const d={...data,
    departments:data.departments.map(x=>({...x,agents:x.agents.filter(keep)})),
    ops:data.ops.filter(keep),
    personal:data.personal.filter(keep),
    projects:(data.projects||[]).map(p=>({...p,agents:(p.agents||[]).filter(c=>!BLOCK_CODES.includes(c))}))};
  return deep(d);
}
const hitEv=e=>[e.name,e.path,e.gen,e.agent].some(v=>typeof v==='string'&&BLOCK_RE.test(v));
function filterDock(d){
  if(!d||!Array.isArray(d.events))return d;
  const drop=d.events.filter(hitEv);
  if(!drop.length)return d;
  const n=ok=>drop.filter(e=>!!e.ok===ok).length; // 兩個計數都是卡片張數（dock.py）
  return {...d,events:d.events.filter(e=>!hitEv(e)),
    ok_count:Math.max(0,d.ok_count-n(true)),fail_count:Math.max(0,d.fail_count-n(false))};
}

/* 監控面板（monitor-overlay.js）：服務名稱等字串同樣套黑名單 */
const scrubMonitor=d=>(d&&typeof d==='object')?deep(d):d;

const on=!window.__DEMO_TEST__&&isDemo(location.search);
window.DEMO_MODE={on,BLOCK_CODES,BLOCK_RE,isDemo,scrub,sanitizeData,filterDock,scrubMonitor};
if(on&&window.EMPIRE_DATA){
  window.EMPIRE_DATA=sanitizeData(window.EMPIRE_DATA);
  const b=document.getElementById('bTodo');
  if(b){b.style.display='none';const sep=b.previousElementSibling;if(sep&&sep.classList.contains('sep'))sep.style.display='none';}
}
})();
