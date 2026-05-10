import { useState, useEffect, useCallback, useRef } from “react”;
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from “recharts”;

const GOAL_FAT_PCT = 18;
const STORAGE_KEY = “body-transform-v2”;

const DEFAULT_PLAN = [
{ day:“月”, type:“rest”,     tag:“休息”,     focus:“アクティブリカバリー”, exercises:[“ウォーキング 20〜30分（任意）”,“前日のストレッチ 10分”] },
{ day:“火”, type:“training”, tag:“筋トレ”,   focus:“下半身”,             exercises:[“スクワット 4×8〜10”,“ルーマニアンデッドリフト 3×10”,“レッグプレス 3×12”,“カーフレイズ 3×15”] },
{ day:“水”, type:“cardio”,   tag:“ランニング”,focus:“有酸素”,             exercises:[“ウォームアップ歩行 5分”,“ゆっくりジョグ 20〜25分”,“クールダウン歩行 5分”] },
{ day:“木”, type:“training”, tag:“筋トレ”,   focus:“上半身（押す）”,     exercises:[“ベンチプレス 4×8〜10”,“ダンベルショルダープレス 3×10”,“ダンベルフライ 3×12”,“トライセプスプッシュダウン 3×12”] },
{ day:“金”, type:“rest”,     tag:“休息”,     focus:“リカバリー”,         exercises:[“完全オフ or 軽いウォーキング”,“翌日に向けて睡眠をしっかり確保”] },
{ day:“土”, type:“training”, tag:“筋トレ”,   focus:“上半身（引く）”,     exercises:[“ベントオーバーロウ 4×8〜10”,“ラットプルダウン 3×10”,“ダンベルカール 3×12”,“フェイスプル 3×15”] },
{ day:“日”, type:“rest”,     tag:“完全休養”, focus:“リカバリー”,         exercises:[“完全オフ”,“睡眠7〜8時間を確保”] },
];

const TS = {
training:{ bg:”#052e16”, border:”#16a34a”, text:”#4ade80”, icon:“💪” },
cardio:  { bg:”#431407”, border:”#ea580c”, text:”#fb923c”, icon:“🏃” },
rest:    { bg:”#0f172a”, border:”#334155”, text:”#94a3b8”, icon:“😴” },
};

const BADGE_DEFS = [
{ id:“first_log”,    icon:“📝”, name:“初記録！”,   desc:“体組成を初めて記録” },
{ id:“log_5”,        icon:“📊”, name:“計測5回”,    desc:“体組成を5回記録” },
{ id:“log_10”,       icon:“🗓️”, name:“計測10回”,   desc:“体組成を10回記録” },
{ id:“first_workout”,icon:“🏋️”, name:“初トレ！”,   desc:“初めてのトレーニング完了” },
{ id:“workout_5”,    icon:“⭐”, name:“5回完了”,    desc:“トレーニング5回完了” },
{ id:“workout_10”,   icon:“🌟”, name:“10回完了”,   desc:“トレーニング10回完了” },
{ id:“workout_30”,   icon:“💎”, name:“30回完了”,   desc:“トレーニング30回完了” },
{ id:“streak_3”,     icon:“🔥”, name:“3日連続”,    desc:“3日連続でアクティブ” },
{ id:“streak_7”,     icon:“🚀”, name:“7日連続”,    desc:“1週間連続でアクティブ” },
{ id:“fat_minus1”,   icon:“📉”, name:“脂肪-1%”,    desc:“体脂肪率1%減少達成” },
{ id:“fat_minus3”,   icon:“🎯”, name:“脂肪-3%”,    desc:“体脂肪率3%減少達成” },
{ id:“fat_minus5”,   icon:“🏆”, name:“脂肪-5%”,    desc:“体脂肪率5%減少達成！” },
];

const PRESETS = [
“今の進捗を評価して、アドバイスをください”,
“停滞しています。打開策を教えてください”,
“今週のトレーニングメニューについてアドバイスをください”,
“食事で気をつけるべきことを教えてください”,
“モチベーションが下がっています。励ましてください”,
];

// ── Date Helpers ───────────────────────────────────────────────────────────
const todayStr = () => {
const d = new Date();
return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const fmtDate = s => { const [,m,d]=s.split(”-”); return `${+m}/${+d}`; };
const nextDateStr = s => {
const [y,m,d]=s.split(”-”).map(Number), nd=new Date(y,m-1,d+1);
return `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}-${String(nd.getDate()).padStart(2,"0")}`;
};
const getDateForDow = dow => {
const now=new Date(), td=now.getDay()===0?6:now.getDay()-1;
const nd=new Date(now.getFullYear(),now.getMonth(),now.getDate()+(dow-td));
return `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}-${String(nd.getDate()).padStart(2,"0")}`;
};

// ── Math ───────────────────────────────────────────────────────────────────
const leanMass  = (w,fp) => w*(1-fp/100);
const targetW   = lm    => lm/(1-GOAL_FAT_PCT/100);
const fatToLose = (w,fp) => Math.max(0, w-targetW(leanMass(w,fp)));
const progPct   = (cur,st) => {
const tot=fatToLose(st.weight,st.fatPct); if(!tot) return 100;
return Math.min(100,Math.max(0,Math.round(((tot-fatToLose(cur.weight,cur.fatPct))/tot)*100)));
};
const predictDate = logs => {
if(logs.length<3) return null;
const t0=new Date(logs[0].date).getTime();
const xs=logs.map(l=>(new Date(l.date).getTime()-t0)/86400000), ys=logs.map(l=>l.fatPct);
const n=logs.length, xm=xs.reduce((a,b)=>a+b,0)/n, ym=ys.reduce((a,b)=>a+b,0)/n;
const sl=xs.reduce((s,x,i)=>s+(x-xm)*(ys[i]-ym),0)/xs.reduce((s,x)=>s+(x-xm)**2,0);
const ic=ym-sl*xm;
if(sl>=0) return null;
return new Date(t0+((GOAL_FAT_PCT-ic)/sl)*86400000);
};
const countWO  = wl => Object.values(wl).filter(d=>Object.values(d).some(v=>v===true)).length;
const calcStreak = (wl,logs) => {
const act=new Set([…Object.keys(wl).filter(d=>Object.values(wl[d]).some(v=>v)),…logs.map(l=>l.date)]);
let s=0; const d=new Date();
for(let i=0;i<365;i++){
const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
if(act.has(ds)){s++;d.setDate(d.getDate()-1);}
else if(i===0){d.setDate(d.getDate()-1);}
else break;
}
return s;
};
const checkBadges = (logs,wl,prev) => {
const nb={…prev}, t=todayStr(), e=id=>{if(!nb[id])nb[id]={earnedDate:t};};
const wc=countWO(wl), sk=calcStreak(wl,logs);
if(logs.length>=1)e(“first_log”); if(logs.length>=5)e(“log_5”); if(logs.length>=10)e(“log_10”);
if(wc>=1)e(“first_workout”); if(wc>=5)e(“workout_5”); if(wc>=10)e(“workout_10”); if(wc>=30)e(“workout_30”);
if(sk>=3)e(“streak_3”); if(sk>=7)e(“streak_7”);
if(logs.length>=2){const drop=logs[0].fatPct-logs[logs.length-1].fatPct; if(drop>=1)e(“fat_minus1”); if(drop>=3)e(“fat_minus3”); if(drop>=5)e(“fat_minus5”);}
return nb;
};
const weeklyReport = (logs,wl) => {
const now=new Date(), td=now.getDay()===0?6:now.getDay()-1;
const wsMs=new Date(now.getFullYear(),now.getMonth(),now.getDate()-td).getTime();
const lwMs=wsMs-7*86400000;
const dMs=s=>new Date(s).getTime();
const tww=Object.keys(wl).filter(d=>{const ms=dMs(d);return ms>=wsMs&&ms<wsMs+7*86400000&&Object.values(wl[d]).some(v=>v);}).length;
const lww=Object.keys(wl).filter(d=>{const ms=dMs(d);return ms>=lwMs&&ms<wsMs&&Object.values(wl[d]).some(v=>v);}).length;
const tl=logs.filter(l=>dMs(l.date)>=wsMs), ll=logs.filter(l=>{const ms=dMs(l.date);return ms>=lwMs&&ms<wsMs;});
const lt=tl[tl.length-1], lll=ll[ll.length-1];
return{tww,lww,wc:lt&&lll?(lt.weight-lll.weight).toFixed(1):null,fc:lt&&lll?(lt.fatPct-lll.fatPct).toFixed(1):null};
};

// ── Storage ────────────────────────────────────────────────────────────────
const load = async()=>{try{const r=await window.storage.get(STORAGE_KEY);return r?JSON.parse(r.value):null;}catch{return null;}};
const save = async d=>{try{await window.storage.set(STORAGE_KEY,JSON.stringify(d));}catch{}};

// ── UI Atoms ───────────────────────────────────────────────────────────────
const NavTab=({label,icon,active,onClick})=>(
<button onClick={onClick} style={{flex:1,padding:“7px 2px”,border:“none”,cursor:“pointer”,background:active?”#1e2d3d”:“transparent”,borderTop:active?“2px solid #38bdf8”:“2px solid transparent”,color:active?”#38bdf8”:”#64748b”,fontSize:9,fontWeight:700,display:“flex”,flexDirection:“column”,alignItems:“center”,gap:2}}>
<span style={{fontSize:15}}>{icon}</span>{label}
</button>
);
const Card=({children,style={}})=><div style={{background:”#1e2330”,borderRadius:15,padding:“13px”,border:“1px solid #2d3348”,marginBottom:11,…style}}>{children}</div>;
const Lbl=({children})=><div style={{fontSize:10,color:”#64748b”,fontWeight:700,letterSpacing:1.5,textTransform:“uppercase”,marginBottom:8}}>{children}</div>;

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({logs,workoutLogs,earnedBadges,menuHistory}){
const latest=logs.length>0?logs[logs.length-1]:{weight:57.2,fatPct:27.8,muscle:23.0};
const first=logs.length>0?logs[0]:latest;
const prog=progPct(latest,first), fl=fatToLose(latest.weight,latest.fatPct).toFixed(1);
const tw=targetW(leanMass(latest.weight,latest.fatPct)).toFixed(1);
const streak=calcStreak(workoutLogs,logs), wc=countWO(workoutLogs);
const pred=predictDate(logs), wr=weeklyReport(logs,workoutLogs);
const earnedCount=Object.keys(earnedBadges).length;
return(
<div>
<Card>
<div style={{display:“flex”,alignItems:“center”,gap:14}}>
<svg width={86} height={86} viewBox="0 0 100 100">
<circle cx={50} cy={50} r={42} fill="none" stroke="#2d3348" strokeWidth={10}/>
<circle cx={50} cy={50} r={42} fill=“none” stroke=”#38bdf8” strokeWidth={10}
strokeDasharray={`${2*Math.PI*42}`} strokeDashoffset={`${2*Math.PI*42*(1-prog/100)}`}
strokeLinecap=“round” transform=“rotate(-90 50 50)” style={{transition:“stroke-dashoffset 0.6s ease”}}/>
<text x={50} y={46} textAnchor="middle" fill="#f8fafc" fontSize={18} fontWeight={800}>{prog}%</text>
<text x={50} y={62} textAnchor="middle" fill="#64748b" fontSize={9}>達成</text>
</svg>
<div style={{flex:1}}>
<div style={{fontSize:12,color:”#94a3b8”,marginBottom:8}}>
<span style={{color:”#f87171”,fontWeight:700}}>{latest.fatPct}%</span>{” → “}<span style={{color:”#4ade80”,fontWeight:700}}>目標 {GOAL_FAT_PCT}%</span>
</div>
<div style={{display:“grid”,gridTemplateColumns:“1fr 1fr 1fr”,gap:5}}>
{[{v:`🔥${streak}`,l:“日連続”,c:”#f97316”},{v:wc,l:“総トレ回数”,c:”#a78bfa”},{v:`${fl}kg`,l:“残り脂肪”,c:”#38bdf8”}].map((k,i)=>(
<div key={i} style={{background:”#252b3b”,borderRadius:9,padding:“7px 4px”,textAlign:“center”}}>
<div style={{fontSize:15,fontWeight:800,color:k.c}}>{k.v}</div>
<div style={{fontSize:9,color:”#64748b”,marginTop:2}}>{k.l}</div>
</div>
))}
</div>
</div>
</div>
</Card>

```
  <Card style={{border:"1px solid #1e3a5f"}}>
    <div style={{display:"flex",gap:12,alignItems:"center"}}>
      <span style={{fontSize:24}}>📅</span>
      <div>
        <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,marginBottom:2}}>目標達成予測日</div>
        {pred
          ? <><div style={{fontSize:16,fontWeight:800,color:"#f8fafc"}}>{pred.getFullYear()}年{pred.getMonth()+1}月{pred.getDate()}日ごろ</div><div style={{fontSize:10,color:"#64748b"}}>現在のペースを維持した場合</div></>
          : <div style={{fontSize:12,color:"#64748b"}}>{logs.length<3?`体組成をあと${3-logs.length}回記録すると表示されます`:"記録を続けると予測が表示されます"}</div>
        }
      </div>
    </div>
  </Card>

  <Card>
    <Lbl>今週のレポート</Lbl>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
      {[
        {l:"今週のトレーニング",v:`${wr.tww}回`,sub:`先週 ${wr.lww}回`,c:"#4ade80"},
        {l:"目標まで",v:`${(latest.weight-parseFloat(tw)).toFixed(1)}kg`,sub:`目標 ${tw}kg`,c:"#38bdf8"},
        {l:"先週比 体重",v:wr.wc!==null?`${+wr.wc>0?"+":""}${wr.wc}kg`:"—",sub:wr.wc!==null?"7日間の変化":"記録が必要",c:wr.wc!==null?(+wr.wc<=0?"#4ade80":"#f87171"):"#475569"},
        {l:"先週比 体脂肪",v:wr.fc!==null?`${+wr.fc>0?"+":""}${wr.fc}%`:"—",sub:wr.fc!==null?"7日間の変化":"記録が必要",c:wr.fc!==null?(+wr.fc<=0?"#4ade80":"#f87171"):"#475569"},
      ].map((it,i)=>(
        <div key={i} style={{background:"#252b3b",borderRadius:11,padding:"9px 11px"}}>
          <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{it.l}</div>
          <div style={{fontSize:17,fontWeight:800,color:it.c}}>{it.v}</div>
          <div style={{fontSize:10,color:"#475569"}}>{it.sub}</div>
        </div>
      ))}
    </div>
  </Card>

  <Card>
    <Lbl>バッジ {earnedCount}/{BADGE_DEFS.length}</Lbl>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
      {BADGE_DEFS.map(b=>{
        const e=earnedBadges[b.id];
        return <div key={b.id} title={b.desc} style={{background:e?"#1a2234":"#1a1f2e",border:`1px solid ${e?"#2d4a7a":"#1e2330"}`,borderRadius:9,padding:"7px 3px",textAlign:"center",opacity:e?1:0.3}}>
          <div style={{fontSize:17}}>{b.icon}</div>
          <div style={{fontSize:8,color:e?"#94a3b8":"#475569",marginTop:2,lineHeight:1.2}}>{b.name}</div>
        </div>;
      })}
    </div>
  </Card>

  {menuHistory&&menuHistory.length>0&&(
    <Card style={{border:"1px solid #1e3a5f"}}>
      <Lbl>メニュー更新履歴</Lbl>
      {menuHistory.slice(0,3).map((h,i)=>(
        <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #2d3348"}}>
          <div style={{fontSize:11,color:"#60a5fa",marginBottom:3}}>{h.date}</div>
          <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6}}>{h.summary}</div>
        </div>
      ))}
    </Card>
  )}
</div>
```

);
}

// ── Log Tab ────────────────────────────────────────────────────────────────
function LogTab({logs,onAdd}){
const [f,setF]=useState({date:todayStr(),weight:””,fatPct:””,muscle:””});
const [msg,setMsg]=useState(””);
const s=(k,v)=>setF(p=>({…p,[k]:v}));
const submit=()=>{
if(!f.weight||!f.fatPct||!f.muscle){setMsg(“全て入力してください”);return;}
onAdd({date:f.date,weight:+f.weight,fatPct:+f.fatPct,muscle:+f.muscle});
setMsg(“✅ 記録しました！”); setF(p=>({…p,weight:””,fatPct:””,muscle:””}));
setTimeout(()=>setMsg(””),2500);
};
const inp=(label,key,ph)=>(
<div style={{marginBottom:10}}>
<div style={{fontSize:12,color:”#94a3b8”,marginBottom:3}}>{label}</div>
<input type=“number” step=“0.1” placeholder={ph} value={f[key]} onChange={e=>s(key,e.target.value)}
style={{width:“100%”,background:”#252b3b”,border:“1px solid #2d3348”,borderRadius:7,padding:“9px 11px”,color:”#f8fafc”,fontSize:15,outline:“none”,boxSizing:“border-box”}}/>
</div>
);
return(
<div>
<Card>
<Lbl>体組成を記録する</Lbl>
<div style={{marginBottom:10}}>
<div style={{fontSize:12,color:”#94a3b8”,marginBottom:3}}>日付</div>
<input type=“date” value={f.date} onChange={e=>s(“date”,e.target.value)}
style={{width:“100%”,background:”#252b3b”,border:“1px solid #2d3348”,borderRadius:7,padding:“9px 11px”,color:”#f8fafc”,fontSize:15,outline:“none”,boxSizing:“border-box”}}/>
</div>
{inp(“体重 (kg)”,“weight”,“57.2”)}
{inp(“体脂肪率 (%)”,“fatPct”,“27.8”)}
{inp(“骨格筋量 (kg)”,“muscle”,“23.0”)}
<button onClick={submit} style={{width:“100%”,padding:“12px”,background:”#0369a1”,border:“none”,borderRadius:9,color:”#fff”,fontSize:15,fontWeight:700,cursor:“pointer”}}>記録する</button>
{msg&&<div style={{textAlign:“center”,marginTop:9,color:”#4ade80”,fontSize:13}}>{msg}</div>}
</Card>
<Lbl>記録履歴</Lbl>
{[…logs].reverse().map((l,i)=>{
const pv=logs[logs.length-1-i-1];
const dw=pv?(l.weight-pv.weight).toFixed(1):null, df=pv?(l.fatPct-pv.fatPct).toFixed(1):null;
return <Card key={i} style={{padding:“11px 13px”}}>
<div style={{display:“flex”,justifyContent:“space-between”,alignItems:“center”}}>
<div style={{fontSize:13,fontWeight:700,color:”#94a3b8”}}>{l.date}</div>
<div style={{fontSize:11}}>
{dw!==null&&<span style={{color:+dw<0?”#4ade80”:”#f87171”}}>{+dw>0?”+”:””}{dw}kg　</span>}
{df!==null&&<span style={{color:+df<0?”#4ade80”:”#f87171”}}>脂肪{+df>0?”+”:””}{df}%</span>}
</div>
</div>
<div style={{display:“flex”,gap:13,marginTop:5}}>
<span style={{fontSize:14,fontWeight:700,color:”#38bdf8”}}>{l.weight}kg</span>
<span style={{fontSize:14,fontWeight:700,color:”#f87171”}}>{l.fatPct}%</span>
<span style={{fontSize:14,fontWeight:700,color:”#4ade80”}}>{l.muscle}kg筋</span>
</div>
</Card>;
})}
{logs.length===0&&<div style={{textAlign:“center”,color:”#475569”,padding:28,fontSize:13}}>まだ記録がありません</div>}
</div>
);
}

// ── Exercise Block ─────────────────────────────────────────────────────────
function ExBlock({exercises,logKey,dayLog,dayWL,onToggle,onSaveW,ts,dateStr,label,carryTag}){
const [openM,setOpenM]=useState(null);
const [mf,setMf]=useState({weight:””,reps:””});
const allDone=exercises.every((_,i)=>dayLog[`${logKey}-${i}`]);
const openFor=i=>{const ex=dayWL[`${logKey}-${i}`]||{};setMf({weight:ex.weight||””,reps:ex.reps||””});setOpenM(openM===i?null:i);};
return(
<Card style={{borderColor:ts.border,marginBottom:10}}>
<div style={{display:“flex”,justifyContent:“space-between”,alignItems:“center”,marginBottom:10}}>
<div style={{display:“flex”,alignItems:“center”,gap:6,flexWrap:“wrap”}}>
<span style={{background:ts.bg,color:ts.text,border:`1px solid ${ts.border}`,borderRadius:99,padding:“2px 10px”,fontSize:11,fontWeight:700}}>{ts.icon} {label}</span>
{carryTag&&<span style={{background:”#312e81”,color:”#a5b4fc”,border:“1px solid #4338ca”,borderRadius:99,padding:“2px 8px”,fontSize:10,fontWeight:700}}>📋 引き継ぎ</span>}
</div>
{allDone&&<span style={{fontSize:17}}>✅</span>}
</div>
<div style={{display:“flex”,flexDirection:“column”,gap:5}}>
{exercises.map((ex,i)=>{
const key=`${logKey}-${i}`, done=dayLog[key]||false, wl=dayWL[key], isOpen=openM===i;
return(
<div key={i}>
<div style={{display:“flex”,alignItems:“center”,gap:6}}>
<button onClick={()=>onToggle(dateStr,key)} style={{flex:1,background:done?ts.bg:”#252b3b”,border:`1px solid ${done?ts.border:"#2d3348"}`,borderRadius:8,padding:“9px 11px”,cursor:“pointer”,display:“flex”,alignItems:“center”,gap:9,textAlign:“left”}}>
<div style={{width:19,height:19,borderRadius:5,border:`2px solid ${done?ts.border:"#475569"}`,background:done?ts.border:“transparent”,display:“flex”,alignItems:“center”,justifyContent:“center”,flexShrink:0,fontSize:11,color:”#fff”}}>{done?“✓”:””}</div>
<div style={{flex:1}}>
<div style={{fontSize:12,color:done?ts.text:”#94a3b8”,fontWeight:done?700:400}}>{ex}</div>
{wl&&(wl.weight||wl.reps)&&<div style={{fontSize:10,color:”#475569”,marginTop:1}}>{wl.weight&&`${wl.weight}kg`}{wl.weight&&wl.reps&&” · “}{wl.reps&&`${wl.reps}rep`}</div>}
</div>
</button>
<button onClick={()=>openFor(i)} style={{width:31,height:31,borderRadius:7,border:`1px solid ${isOpen?ts.border:"#2d3348"}`,background:isOpen?ts.bg:”#252b3b”,cursor:“pointer”,fontSize:12,flexShrink:0}}>✏️</button>
</div>
{isOpen&&(
<div style={{background:”#252b3b”,borderRadius:8,padding:“9px 11px”,marginTop:4,display:“flex”,gap:7,alignItems:“flex-end”}}>
<div style={{flex:1}}>
<div style={{fontSize:10,color:”#64748b”,marginBottom:3}}>重量 (kg)</div>
<input type=“number” step=“0.5” placeholder=“60” value={mf.weight} onChange={e=>setMf(p=>({…p,weight:e.target.value}))}
style={{width:“100%”,background:”#1e2330”,border:“1px solid #2d3348”,borderRadius:5,padding:“6px 9px”,color:”#f8fafc”,fontSize:13,outline:“none”,boxSizing:“border-box”}}/>
</div>
<div style={{flex:1}}>
<div style={{fontSize:10,color:”#64748b”,marginBottom:3}}>回数 (例: 8,8,7)</div>
<input type=“text” placeholder=“8,8,7” value={mf.reps} onChange={e=>setMf(p=>({…p,reps:e.target.value}))}
style={{width:“100%”,background:”#1e2330”,border:“1px solid #2d3348”,borderRadius:5,padding:“6px 9px”,color:”#f8fafc”,fontSize:13,outline:“none”,boxSizing:“border-box”}}/>
</div>
<button onClick={()=>{onSaveW(dateStr,`${logKey}-${i}`,mf);setOpenM(null);}}
style={{padding:“6px 11px”,background:ts.border,border:“none”,borderRadius:5,color:”#fff”,fontSize:12,fontWeight:700,cursor:“pointer”,flexShrink:0}}>保存</button>
</div>
)}
</div>
);
})}
</div>
{allDone&&<div style={{marginTop:9,padding:“8px”,background:ts.bg,borderRadius:8,textAlign:“center”,fontSize:13,color:ts.text,fontWeight:700}}>🎉 完了！お疲れさまでした！</div>}
</Card>
);
}

// ── Training Tab ───────────────────────────────────────────────────────────
function TrainingTab({plan,workoutLogs,weightLogs,carryovers,onToggle,onSaveW,onCarryOver,onUpdatePlan,logs,garminLogs}){
const tdDow=new Date().getDay()===0?6:new Date().getDay()-1;
const [sel,setSel]=useState(tdDow);
const [showProposal,setShowProposal]=useState(false);
const [proposal,setProposal]=useState(null);
const [loadingAI,setLoadingAI]=useState(false);
const [aiMsg,setAiMsg]=useState(””);

const selDate=getDateForDow(sel), dayLog=workoutLogs[selDate]||{}, dayWL=weightLogs[selDate]||{};
const d=plan[sel], ts=TS[d.type];
const isTrain=d.type===“training”;
const anyUndone=isTrain&&d.exercises.some((_,i)=>!dayLog[`${sel}-${i}`]);
const alreadyC=carryovers[nextDateStr(selDate)], carriedIn=carryovers[selDate];

// Calc last week completion rate
const now=new Date(), todayDow=now.getDay()===0?6:now.getDay()-1;
const wsMs=new Date(now.getFullYear(),now.getMonth(),now.getDate()-todayDow).getTime();
const lwMs=wsMs-7*86400000;
const dMs=s=>new Date(s).getTime();
const lwDates=Object.keys(workoutLogs).filter(d=>{const ms=dMs(d);return ms>=lwMs&&ms<wsMs;});
const lwDone=lwDates.filter(d=>Object.values(workoutLogs[d]).some(v=>v)).length;

const requestAIMenu=async()=>{
setLoadingAI(true); setProposal(null); setAiMsg(””);
const latest=logs.length>0?logs[logs.length-1]:null;
const latestG=garminLogs.length>0?garminLogs[garminLogs.length-1]:null;
const wc=countWO(workoutLogs), streak=calcStreak(workoutLogs,logs);
const prompt=`あなたはプロのパーソナルトレーナーです。以下のデータを分析して、来週のトレーニングメニューを提案してください。

【基本情報】身長154cm・男性・目標:体脂肪率18%（現在${latest?.fatPct||“不明”}%）
【トレーニング実績】総${wc}回 / ${streak}日連続 / 先週完了${lwDone}日
【最新Garminデータ】HRV:${latestG?.hrv||“不明”}ms / 安静時心拍:${latestG?.restingHR||“不明”}bpm / 睡眠スコア:${latestG?.sleepScore||“不明”} / VO2Max:${latestG?.vo2max||“不明”}
【現在のメニュー】火:下半身 / 木:上半身押す / 土:上半身引く / 水:ランニング

以下のJSON形式のみで返してください（説明文・コードブロック不要）:
{
“summary”: “今週の分析と来週の方針（2〜3文）”,
“plan”: [
{“dayIdx”:0,“focus”:“アクティブリカバリー”,“exercises”:[”…”],“reason”:“変更理由(任意)”},
{“dayIdx”:1,“focus”:“下半身”,“exercises”:[“スクワット 4×8〜10”,”…”]},
{“dayIdx”:2,“focus”:“有酸素”,“exercises”:[”…”]},
{“dayIdx”:3,“focus”:“上半身（押す）”,“exercises”:[”…”]},
{“dayIdx”:4,“focus”:“リカバリー”,“exercises”:[”…”]},
{“dayIdx”:5,“focus”:“上半身（引く）”,“exercises”:[”…”]},
{“dayIdx”:6,“focus”:“完全休養”,“exercises”:[”…”]}
]
}`;
try{
const res=await fetch(“https://api.anthropic.com/v1/messages”,{method:“POST”,headers:{“Content-Type”:“application/json”},
body:JSON.stringify({model:“claude-sonnet-4-20250514”,max_tokens:2000,messages:[{role:“user”,content:prompt}]})});
const data=await res.json();
const text=data.content?.find(c=>c.type===“text”)?.text||”{}”;
const clean=text.replace(/`json|`/g,””).trim();
const parsed=JSON.parse(clean);
setProposal(parsed);
setShowProposal(true);
}catch{setAiMsg(“メニュー生成に失敗しました。もう一度お試しください。”);}
setLoadingAI(false);
};

const applyProposal=()=>{
if(!proposal?.plan) return;
const newPlan=plan.map((p,i)=>{
const pp=proposal.plan.find(x=>x.dayIdx===i);
if(!pp) return p;
return {…p, focus:pp.focus, exercises:pp.exercises};
});
onUpdatePlan(newPlan, proposal.summary);
setShowProposal(false); setProposal(null);
setAiMsg(“✅ メニューを更新しました！”);
setTimeout(()=>setAiMsg(””),3000);
};

return(
<div>
{/* AI Menu Update Panel */}
<Card style={{border:“1px solid #1e3a5f”,marginBottom:12}}>
<div style={{display:“flex”,justifyContent:“space-between”,alignItems:“center”}}>
<div>
<div style={{fontSize:13,fontWeight:800,color:”#f8fafc”}}>🤖 AIメニュー提案</div>
<div style={{fontSize:11,color:”#64748b”,marginTop:2}}>先週の実績・体調データから来週を最適化</div>
</div>
<button onClick={requestAIMenu} disabled={loadingAI} style={{padding:“8px 14px”,background:loadingAI?”#1e2330”:”#0369a1”,border:“none”,borderRadius:9,color:loadingAI?”#475569”:”#fff”,fontSize:12,fontWeight:700,cursor:loadingAI?“default”:“pointer”,flexShrink:0}}>
{loadingAI?“生成中…”:“更新提案”}
</button>
</div>
{aiMsg&&<div style={{marginTop:9,fontSize:12,color:”#4ade80”,fontWeight:700}}>{aiMsg}</div>}
</Card>

```
  {/* Proposal Review */}
  {showProposal&&proposal&&(
    <Card style={{border:"1px solid #f97316",marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:800,color:"#fb923c",marginBottom:8}}>📋 AIからの提案</div>
      {proposal.summary&&<div style={{fontSize:12,color:"#94a3b8",lineHeight:1.7,marginBottom:12,padding:"9px 11px",background:"#252b3b",borderRadius:8}}>{proposal.summary}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
        {(proposal.plan||[]).filter(p=>DEFAULT_PLAN[p.dayIdx]?.type==="training"||DEFAULT_PLAN[p.dayIdx]?.type==="cardio").map(p=>{
          const orig=plan[p.dayIdx];
          const changed=orig.focus!==p.focus||JSON.stringify(orig.exercises)!==JSON.stringify(p.exercises);
          return(
            <div key={p.dayIdx} style={{background:"#252b3b",borderRadius:8,padding:"9px 11px",border:changed?"1px solid #f97316":"1px solid #2d3348"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:700,color:"#f8fafc"}}>{DEFAULT_PLAN[p.dayIdx].day}曜 — {p.focus}</span>
                {changed&&<span style={{fontSize:9,color:"#fb923c",background:"#431407",padding:"2px 6px",borderRadius:99}}>変更あり</span>}
              </div>
              <div style={{fontSize:11,color:"#64748b"}}>{p.exercises.join(" / ")}</div>
              {p.reason&&<div style={{fontSize:10,color:"#fb923c",marginTop:4}}>💡 {p.reason}</div>}
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={applyProposal} style={{flex:1,padding:"11px",background:"#f97316",border:"none",borderRadius:9,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>✅ 適用する</button>
        <button onClick={()=>{setShowProposal(false);setProposal(null);}} style={{flex:1,padding:"11px",background:"#252b3b",border:"1px solid #2d3348",borderRadius:9,color:"#94a3b8",fontSize:14,fontWeight:700,cursor:"pointer"}}>見送る</button>
      </div>
    </Card>
  )}

  {/* Day selector */}
  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:13}}>
    {plan.map((p,i)=>{
      const ts2=TS[p.type], isA=sel===i;
      return <button key={i} onClick={()=>setSel(i)} style={{background:isA?ts2.bg:"#1e2330",border:`2px solid ${isA?ts2.border:"#2d3348"}`,borderRadius:9,padding:"7px 2px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,position:"relative"}}>
        <span style={{fontSize:13,color:isA?ts2.text:"#64748b",fontWeight:800}}>{p.day}</span>
        <span style={{fontSize:8,color:isA?ts2.text:"#475569"}}>{p.tag}</span>
        {carryovers[getDateForDow(i)]&&<span style={{position:"absolute",top:2,right:3,fontSize:8}}>📋</span>}
      </button>;
    })}
  </div>
  {carriedIn&&(()=>{
    const src=plan[carriedIn.dayIdx], sts=TS[src.type];
    return <ExBlock exercises={src.exercises} logKey={`carry-${carriedIn.dayIdx}`} dayLog={dayLog} dayWL={dayWL} onToggle={onToggle} onSaveW={onSaveW} ts={sts} dateStr={selDate} label={`${src.day}曜 ${src.focus}`} carryTag={true}/>;
  })()}
  <ExBlock exercises={d.exercises} logKey={`${sel}`} dayLog={dayLog} dayWL={dayWL} onToggle={onToggle} onSaveW={onSaveW} ts={ts} dateStr={selDate} label={`${d.day}曜日 — ${d.focus}`} carryTag={false}/>
  {isTrain&&anyUndone&&!alreadyC&&(
    <button onClick={()=>onCarryOver(selDate,sel)} style={{width:"100%",padding:"12px",background:"#1e1b4b",border:"1px solid #4338ca",borderRadius:11,color:"#a5b4fc",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      📋 翌日に引き継ぐ
    </button>
  )}
  {alreadyC&&isTrain&&anyUndone&&<div style={{textAlign:"center",padding:"9px",fontSize:12,color:"#4338ca",background:"#1e1b4b",borderRadius:9,marginTop:4}}>翌日への引き継ぎ済み ✓</div>}
</div>
```

);
}

// ── Chart Tab ──────────────────────────────────────────────────────────────
function ChartTab({logs}){
const [metric,setMetric]=useState(“fatPct”);
const mets=[{key:“fatPct”,label:“体脂肪率”,unit:”%”,color:”#f87171”,goal:GOAL_FAT_PCT},{key:“weight”,label:“体重”,unit:“kg”,color:”#38bdf8”},{key:“muscle”,label:“骨格筋量”,unit:“kg”,color:”#4ade80”}];
const m=mets.find(x=>x.key===metric), data=logs.map(l=>({date:fmtDate(l.date),value:l[metric]}));
const Tip=({active,payload,label})=>(!active||!payload?.length)?null:(
<div style={{background:”#1e2330”,border:“1px solid #2d3348”,borderRadius:7,padding:“7px 11px”}}>
<div style={{fontSize:10,color:”#64748b”}}>{label}</div>
<div style={{fontSize:14,fontWeight:700,color:m.color}}>{payload[0].value}{m.unit}</div>
</div>
);
return(
<div>
<div style={{display:“flex”,gap:7,marginBottom:13}}>
{mets.map(mx=><button key={mx.key} onClick={()=>setMetric(mx.key)} style={{flex:1,padding:“7px 4px”,border:`1px solid ${metric===mx.key?mx.color:"#2d3348"}`,borderRadius:7,background:metric===mx.key?”#1a2234”:”#1e2330”,color:metric===mx.key?mx.color:”#64748b”,fontSize:11,fontWeight:700,cursor:“pointer”}}>{mx.label}</button>)}
</div>
<Card>
{data.length<2
? <div style={{textAlign:“center”,color:”#475569”,padding:“34px 0”,fontSize:13}}>2件以上の記録が必要です</div>
: <ResponsiveContainer width="100%" height={200}>
<LineChart data={data} margin={{top:5,right:10,left:-20,bottom:0}}>
<CartesianGrid strokeDasharray="3 3" stroke="#2d3348"/>
<XAxis dataKey=“date” tick={{fill:”#64748b”,fontSize:10}}/>
<YAxis tick={{fill:”#64748b”,fontSize:10}} domain={[“auto”,“auto”]}/>
<Tooltip content={<Tip/>}/>
{m.goal&&<ReferenceLine y={m.goal} stroke=”#4ade80” strokeDasharray=“6 3” label={{value:`目標${m.goal}${m.unit}`,fill:”#4ade80”,fontSize:9,position:“insideTopRight”}}/>}
<Line type="monotone" dataKey="value" stroke={m.color} strokeWidth={2.5} dot={{fill:m.color,r:4}} activeDot={{r:6}}/>
</LineChart>
</ResponsiveContainer>
}
</Card>
{logs.length>=2&&<Card><Lbl>変化サマリー</Lbl>
{mets.map(mx=>{
const fi=logs[0][mx.key], la=logs[logs.length-1][mx.key], df=(la-fi).toFixed(1);
const gd=mx.key===“muscle”?+df>=0:+df<=0;
return <div key={mx.key} style={{display:“flex”,justifyContent:“space-between”,alignItems:“center”,padding:“7px 0”,borderBottom:“1px solid #2d3348”}}>
<span style={{fontSize:13,color:”#94a3b8”}}>{mx.label}</span>
<div style={{display:“flex”,alignItems:“center”,gap:9}}>
<span style={{fontSize:11,color:”#475569”}}>{fi}{mx.unit} → {la}{mx.unit}</span>
<span style={{fontSize:13,fontWeight:700,color:gd?”#4ade80”:”#f87171”}}>{+df>0?”+”:””}{df}{mx.unit}</span>
</div>
</div>;
})}
</Card>}
</div>
);
}

// ── AI Coach Tab ───────────────────────────────────────────────────────────
function AICoachTab({logs,workoutLogs,earnedBadges}){
const [input,setInput]=useState(””);
const [msgs,setMsgs]=useState([]);
const [loading,setLoading]=useState(false);
const bottomRef=useRef(null);
useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:“smooth”});},[msgs,loading]);

const ctx=()=>{
const l=logs.length>0?logs[logs.length-1]:null, fi=logs.length>0?logs[0]:null;
const wc=countWO(workoutLogs), sk=calcStreak(workoutLogs,logs);
const pred=predictDate(logs), badges=BADGE_DEFS.filter(b=>earnedBadges[b.id]).map(b=>b.name).join(”、”)||“なし”;
return `あなたはプロのパーソナルトレーナーです。以下のデータをもとに具体的で前向きなアドバイスを日本語で提供してください。

【基本情報】身長154cm・男性・目標:体脂肪率18%
【最新体組成】${l?`体重${l.weight}kg / 体脂肪率${l.fatPct}% / 骨格筋量${l.muscle}kg`:“未記録”}
【進捗】${fi&&l?`開始${fi.fatPct}% → 現在${l.fatPct}% (${(l.fatPct-fi.fatPct).toFixed(1)}%) / 記録${logs.length}回`:“未記録”}
【トレーニング】週3回(火木土)ジム・フリーウェイト / 週1〜2回ランニング / 総${wc}回 / ${sk}日連続
【バッジ】${badges}${pred?`\n【予測達成日】${pred.getFullYear()}年${pred.getMonth()+1}月${pred.getDate()}日`:””}

200〜300文字で簡潔に回答してください。`;
};

const send=async txt=>{
if(!txt.trim()||loading) return;
const um={role:“user”,content:txt};
setMsgs(p=>[…p,um]); setInput(””); setLoading(true);
try{
const res=await fetch(“https://api.anthropic.com/v1/messages”,{method:“POST”,headers:{“Content-Type”:“application/json”},
body:JSON.stringify({model:“claude-sonnet-4-20250514”,max_tokens:1000,system:ctx(),messages:[…msgs,um].map(m=>({role:m.role,content:m.content}))})});
const data=await res.json();
const reply=data.content?.find(c=>c.type===“text”)?.text||“応答できませんでした。”;
setMsgs(p=>[…p,{role:“assistant”,content:reply}]);
}catch{setMsgs(p=>[…p,{role:“assistant”,content:“エラーが発生しました。もう一度お試しください。”}]);}
setLoading(false);
};

return(
<div style={{display:“flex”,flexDirection:“column”}}>
<Card style={{marginBottom:9}}>
<div style={{display:“flex”,gap:11,alignItems:“center”}}>
<span style={{fontSize:24}}>🤖</span>
<div><div style={{fontSize:14,fontWeight:800,color:”#f8fafc”}}>AIコーチ</div><div style={{fontSize:11,color:”#64748b”}}>あなたのデータをもとに個別アドバイス</div></div>
</div>
</Card>
<div style={{minHeight:280,marginBottom:9}}>
{msgs.length===0&&(
<div>
<div style={{fontSize:11,color:”#475569”,textAlign:“center”,marginBottom:9}}>よく使う質問をタップ</div>
{PRESETS.map((p,i)=><button key={i} onClick={()=>send(p)} style={{width:“100%”,marginBottom:6,background:”#1e2330”,border:“1px solid #2d3348”,borderRadius:9,padding:“10px 13px”,color:”#94a3b8”,fontSize:13,cursor:“pointer”,textAlign:“left”}}>💬 {p}</button>)}
</div>
)}
{msgs.map((m,i)=>(
<div key={i} style={{display:“flex”,justifyContent:m.role===“user”?“flex-end”:“flex-start”,marginBottom:9}}>
{m.role===“assistant”&&<span style={{fontSize:17,marginRight:6,alignSelf:“flex-end”}}>🤖</span>}
<div style={{maxWidth:“80%”,padding:“9px 13px”,borderRadius:13,background:m.role===“user”?”#0369a1”:”#1e2330”,border:m.role===“assistant”?“1px solid #2d3348”:“none”,color:”#f8fafc”,fontSize:13,lineHeight:1.7,borderBottomRightRadius:m.role===“user”?3:13,borderBottomLeftRadius:m.role===“assistant”?3:13}}>
{m.content}
</div>
</div>
))}
{loading&&(
<div style={{display:“flex”,alignItems:“center”,gap:7,marginBottom:9}}>
<span style={{fontSize:17}}>🤖</span>
<div style={{background:”#1e2330”,border:“1px solid #2d3348”,borderRadius:13,borderBottomLeftRadius:3,padding:“9px 14px”,display:“flex”,gap:4}}>
{[0,1,2].map(j=><div key={j} style={{width:6,height:6,borderRadius:“50%”,background:”#64748b”,animation:“bounce 1.2s infinite”,animationDelay:`${j*0.2}s`}}/>)}
</div>
</div>
)}
<div ref={bottomRef}/>
</div>
<div style={{display:“flex”,gap:7}}>
<input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key===“Enter”&&send(input)}
placeholder=“質問を入力…”
style={{flex:1,background:”#1e2330”,border:“1px solid #2d3348”,borderRadius:9,padding:“10px 13px”,color:”#f8fafc”,fontSize:14,outline:“none”}}/>
<button onClick={()=>send(input)} disabled={loading||!input.trim()} style={{padding:“10px 15px”,background:loading||!input.trim()?”#1e2330”:”#0369a1”,border:“none”,borderRadius:9,color:loading||!input.trim()?”#475569”:”#fff”,fontSize:14,fontWeight:700,cursor:“pointer”}}>送信</button>
</div>
<style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}`}</style>
</div>
);
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App(){
const [tab,setTab]=useState(“dashboard”);
const [logs,setLogs]=useState([]);
const [workoutLogs,setWL]=useState({});
const [weightLogs,setWGL]=useState({});
const [carryovers,setC]=useState({});
const [earnedBadges,setEB]=useState({});
const [garminLogs,setGL]=useState([]);
const [customPlan,setCP]=useState(DEFAULT_PLAN);
const [menuHistory,setMH]=useState([]);
const [loaded,setLoaded]=useState(false);

useEffect(()=>{load().then(d=>{if(d){setLogs(d.logs||[]);setWL(d.workoutLogs||{});setWGL(d.weightLogs||{});setC(d.carryovers||{});setEB(d.earnedBadges||{});setGL(d.garminLogs||[]);setCP(d.customPlan||DEFAULT_PLAN);setMH(d.menuHistory||[]);}setLoaded(true);});}, []);

const persist=useCallback((nl,nwl,nwgl,nc,nb,ngl,ncp,nmh)=>{save({logs:nl,workoutLogs:nwl,weightLogs:nwgl,carryovers:nc,earnedBadges:nb,garminLogs:ngl,customPlan:ncp,menuHistory:nmh});},[]);

const addLog=entry=>{
const nl=[…logs.filter(l=>l.date!==entry.date),entry].sort((a,b)=>a.date.localeCompare(b.date));
const nb=checkBadges(nl,workoutLogs,earnedBadges);
setLogs(nl);setEB(nb);persist(nl,workoutLogs,weightLogs,carryovers,nb,garminLogs,customPlan,menuHistory);
};
const toggleEx=(date,key)=>{
const dl=workoutLogs[date]||{}, nwl={…workoutLogs,[date]:{…dl,[key]:!dl[key]}};
const nb=checkBadges(logs,nwl,earnedBadges);
setWL(nwl);setEB(nb);persist(logs,nwl,weightLogs,carryovers,nb,garminLogs,customPlan,menuHistory);
};
const saveW=(date,key,memo)=>{
const dw=weightLogs[date]||{}, nwgl={…weightLogs,[date]:{…dw,[key]:memo}};
setWGL(nwgl);persist(logs,workoutLogs,nwgl,carryovers,earnedBadges,garminLogs,customPlan,menuHistory);
};
const carryOver=(fromDate,dayIdx)=>{
const nc={…carryovers,[nextDateStr(fromDate)]:{dayIdx,from:fromDate}};
setC(nc);persist(logs,workoutLogs,weightLogs,nc,earnedBadges,garminLogs,customPlan,menuHistory);
};
const saveGarmin=(entry)=>{
const ngl=[…garminLogs.filter(l=>l.date!==entry.date),entry].sort((a,b)=>a.date.localeCompare(b.date));
setGL(ngl);persist(logs,workoutLogs,weightLogs,carryovers,earnedBadges,ngl,customPlan,menuHistory);
};
const updatePlan=(newPlan,summary)=>{
const nmh=[{date:todayStr(),summary},…menuHistory].slice(0,10);
setCP(newPlan);setMH(nmh);
persist(logs,workoutLogs,weightLogs,carryovers,earnedBadges,garminLogs,newPlan,nmh);
};

if(!loaded) return <div style={{minHeight:“100vh”,background:”#0f1117”,display:“flex”,alignItems:“center”,justifyContent:“center”,color:”#64748b”}}>読み込み中…</div>;

const tabs=[{key:“dashboard”,label:“ホーム”,icon:“🏠”},{key:“log”,label:“記録”,icon:“📝”},{key:“training”,label:“トレーニング”,icon:“💪”},{key:“chart”,label:“グラフ”,icon:“📈”},{key:“garmin”,label:“Garmin”,icon:“⌚”},{key:“ai”,label:“AIコーチ”,icon:“🤖”}];

return(
<div style={{minHeight:“100vh”,background:”#0f1117”,fontFamily:”‘Noto Sans JP’,‘Hiragino Kaku Gothic ProN’,sans-serif”,color:”#f8fafc”,display:“flex”,flexDirection:“column”}}>
<div style={{padding:“11px 17px 7px”,borderBottom:“1px solid #1e2330”}}>
<div style={{fontSize:10,letterSpacing:3,color:”#475569”,textTransform:“uppercase”}}>Body Transform</div>
<div style={{fontSize:17,fontWeight:800}}>肉体改造トラッカー</div>
</div>
<div style={{flex:1,overflowY:“auto”,padding:“13px”}}>
{tab===“dashboard”&&<Dashboard logs={logs} workoutLogs={workoutLogs} earnedBadges={earnedBadges} menuHistory={menuHistory}/>}
{tab===“log”      &&<LogTab logs={logs} onAdd={addLog}/>}
{tab===“training” &&<TrainingTab plan={customPlan} workoutLogs={workoutLogs} weightLogs={weightLogs} carryovers={carryovers} onToggle={toggleEx} onSaveW={saveW} onCarryOver={carryOver} onUpdatePlan={updatePlan} logs={logs} garminLogs={garminLogs}/>}
{tab===“chart”    &&<ChartTab logs={logs}/>}
{tab===“garmin”   &&<GarminTab garminLogs={garminLogs} onSaveGarmin={saveGarmin}/>}
{tab===“ai”       &&<AICoachTab logs={logs} workoutLogs={workoutLogs} earnedBadges={earnedBadges} garminLogs={garminLogs}/>}
</div>
<div style={{display:“flex”,borderTop:“1px solid #1e2330”,background:”#0f1117”}}>
{tabs.map(t=><NavTab key={t.key} label={t.label} icon={t.icon} active={tab===t.key} onClick={()=>setTab(t.key)}/>)}
</div>
</div>
);
}

// ── Garmin Import Tab ──────────────────────────────────────────────────────
function GarminTab({garminLogs,onSaveGarmin}){
const [imgs,setImgs]=useState([]);
const [loading,setLoading]=useState(false);
const [parsed,setParsed]=useState(null);
const [msg,setMsg]=useState(””);
const [date,setDate]=useState(todayStr());
const fileRef=useRef(null);

const toBase64=file=>new Promise((res,rej)=>{
const r=new FileReader();
r.onload=()=>res(r.result.split(”,”)[1]);
r.onerror=rej;
r.readAsDataURL(file);
});

const handleFiles=async e=>{
const files=Array.from(e.target.files);
if(!files.length) return;
setImgs(files.map(f=>URL.createObjectURL(f)));
setLoading(true); setParsed(null); setMsg(””);
try{
const imgContents=await Promise.all(files.map(async f=>({
type:“image”,
source:{type:“base64”,media_type:f.type,data:await toBase64(f)}
})));
const res=await fetch(“https://api.anthropic.com/v1/messages”,{
method:“POST”,headers:{“Content-Type”:“application/json”},
body:JSON.stringify({
model:“claude-sonnet-4-20250514”,max_tokens:1000,
messages:[{role:“user”,content:[
…imgContents,
{type:“text”,text:`これらはGarmin Connectアプリのスクリーンショットです。以下のデータを読み取りJSON形式のみで返してください（説明文不要、コードブロック不要）: { "steps": 歩数(数値 or null), "restingHR": 安静時心拍数bpm(数値 or null), "maxHR": 最高心拍数bpm(数値 or null), "sleepScore": 睡眠スコア(数値 or null), "sleepDuration": 睡眠時間（例:"7h 28m"、文字列 or null）, "hrv": HRV一晩平均ms(数値 or null), "vo2max": VO2 Max(数値 or null), "calories": 消費カロリーkcal(数値 or null), "distance": ランニング距離km(数値 or null) }`}
]}]
})
});
const data=await res.json();
const text=data.content?.find(c=>c.type===“text”)?.text||”{}”;
const clean=text.replace(/`json|`/g,””).trim();
setParsed(JSON.parse(clean));
}catch(e){setMsg(“読み取りに失敗しました。もう一度試してください。”);}
setLoading(false);
};

const handleSave=()=>{
if(!parsed) return;
onSaveGarmin({date,…parsed});
setMsg(“✅ 保存しました！”);
setParsed(null); setImgs([]);
setTimeout(()=>setMsg(””),2500);
};

const fields=[
{key:“steps”,label:“歩数”,unit:“歩”,icon:“👟”},
{key:“restingHR”,label:“安静時心拍”,unit:“bpm”,icon:“💙”},
{key:“maxHR”,label:“最高心拍”,unit:“bpm”,icon:“❤️”},
{key:“sleepScore”,label:“睡眠スコア”,unit:””,icon:“😴”},
{key:“sleepDuration”,label:“睡眠時間”,unit:””,icon:“🌙”},
{key:“hrv”,label:“HRV”,unit:“ms”,icon:“📡”},
{key:“vo2max”,label:“VO2 Max”,unit:””,icon:“🫁”},
{key:“calories”,label:“消費カロリー”,unit:“kcal”,icon:“🔥”},
{key:“distance”,label:“距離”,unit:“km”,icon:“🏃”},
];

return(
<div>
<Card style={{border:“1px solid #1e3a5f”}}>
<div style={{display:“flex”,gap:11,alignItems:“center”,marginBottom:12}}>
<span style={{fontSize:24}}>⌚</span>
<div>
<div style={{fontSize:14,fontWeight:800,color:”#f8fafc”}}>Garminスクショ読み込み</div>
<div style={{fontSize:11,color:”#64748b”}}>スクショをアップロードするだけで自動入力</div>
</div>
</div>
<div style={{marginBottom:10}}>
<div style={{fontSize:12,color:”#94a3b8”,marginBottom:4}}>日付</div>
<input type=“date” value={date} onChange={e=>setDate(e.target.value)}
style={{width:“100%”,background:”#252b3b”,border:“1px solid #2d3348”,borderRadius:7,padding:“9px 11px”,color:”#f8fafc”,fontSize:15,outline:“none”,boxSizing:“border-box”}}/>
</div>
<button onClick={()=>fileRef.current?.click()} style={{width:“100%”,padding:“13px”,background:”#1e2d3d”,border:“2px dashed #2d4a7a”,borderRadius:11,color:”#60a5fa”,fontSize:14,fontWeight:700,cursor:“pointer”,display:“flex”,alignItems:“center”,justifyContent:“center”,gap:8}}>
📸 スクショを選択（複数OK）
</button>
<input ref={fileRef} type=“file” accept=“image/*” multiple onChange={handleFiles} style={{display:“none”}}/>
</Card>

```
  {imgs.length>0&&(
    <Card>
      <Lbl>選択した画像</Lbl>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {imgs.map((src,i)=><img key={i} src={src} style={{width:60,height:100,objectFit:"cover",borderRadius:6,border:"1px solid #2d3348"}}/>)}
      </div>
    </Card>
  )}

  {loading&&(
    <Card style={{textAlign:"center",padding:"24px"}}>
      <div style={{fontSize:13,color:"#60a5fa",marginBottom:8}}>🤖 AIがデータを読み取り中...</div>
      <div style={{display:"flex",justifyContent:"center",gap:4}}>
        {[0,1,2].map(j=><div key={j} style={{width:7,height:7,borderRadius:"50%",background:"#60a5fa",animation:"bounce 1.2s infinite",animationDelay:`${j*0.2}s`}}/>)}
      </div>
    </Card>
  )}

  {parsed&&(
    <Card style={{border:"1px solid #16a34a"}}>
      <Lbl>読み取り結果</Lbl>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
        {fields.map(f=>{
          const v=parsed[f.key];
          if(v===null||v===undefined) return null;
          return(
            <div key={f.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#252b3b",borderRadius:8,padding:"9px 12px"}}>
              <span style={{fontSize:13,color:"#94a3b8"}}>{f.icon} {f.label}</span>
              <span style={{fontSize:14,fontWeight:700,color:"#4ade80"}}>{typeof v==="number"?v.toLocaleString():v}{f.unit&&` ${f.unit}`}</span>
            </div>
          );
        })}
      </div>
      <button onClick={handleSave} style={{width:"100%",padding:"12px",background:"#16a34a",border:"none",borderRadius:9,color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer"}}>
        この内容で保存する
      </button>
    </Card>
  )}

  {msg&&<div style={{textAlign:"center",padding:12,color:"#4ade80",fontSize:13,fontWeight:700}}>{msg}</div>}
  <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}`}</style>

  <Lbl>Garmin記録履歴</Lbl>
  {[...garminLogs].reverse().map((l,i)=>(
    <Card key={i} style={{padding:"11px 13px"}}>
      <div style={{fontSize:13,fontWeight:700,color:"#60a5fa",marginBottom:7}}>{l.date}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {fields.map(f=>{
          const v=l[f.key];
          if(v===null||v===undefined) return null;
          return <div key={f.key} style={{background:"#252b3b",borderRadius:7,padding:"5px 9px",fontSize:11}}>
            <span style={{color:"#64748b"}}>{f.icon}{f.label} </span>
            <span style={{color:"#f8fafc",fontWeight:700}}>{typeof v==="number"?v.toLocaleString():v}{f.unit&&` ${f.unit}`}</span>
          </div>;
        })}
      </div>
    </Card>
  ))}
  {garminLogs.length===0&&<div style={{textAlign:"center",color:"#475569",padding:24,fontSize:13}}>まだ記録がありません</div>}
</div>
```

);
}
