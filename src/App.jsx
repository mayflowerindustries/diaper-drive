import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

/*
  DIAPER DRIVE — v3 Sonos-inspired redesign
  Supabase + Claude AI Matching
  Clean. Minimal. Premium.
*/

// ── SECTION: Design Tokens ──────────────────────────────────────────────────
const T = {
  // Sonos-inspired: near-black, warm whites, one accent
  black:    "#111111",
  dark:     "#1a1a1a",
  charcoal: "#2a2a2a",
  gray:     { 100:"#f7f7f7", 200:"#ebebeb", 300:"#d4d4d4", 400:"#a3a3a3", 500:"#737373", 600:"#525252", 700:"#404040" },
  white:    "#ffffff",
  accent:   "#E8562A",     // Sonos orange-red
  accentLt: "#FEF0EB",
  accentDk: "#C44520",
  green:    "#22A66E",
  greenLt:  "#EDFCF5",
  amber:    "#E5A000",
  amberLt:  "#FFF9E6",
  red:      "#DC3545",
  redLt:    "#FFF0F1",
  radius:   { sm:6, md:10, lg:14, xl:20, full:9999 },
  shadow:   {
    sm: "0 1px 2px rgba(0,0,0,0.04)",
    md: "0 2px 8px rgba(0,0,0,0.06)",
    lg: "0 4px 20px rgba(0,0,0,0.08)",
    xl: "0 8px 40px rgba(0,0,0,0.12)",
  },
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

// ── SECTION: Constants ──────────────────────────────────────────────────────
const DIAPER_SIZES = [
  { value:"Newborn", label:"Newborn (up to 10 lbs)", short:"NB" },
  { value:"1", label:"Size 1 (8–14 lbs)", short:"1" },
  { value:"2", label:"Size 2 (12–18 lbs)", short:"2" },
  { value:"3", label:"Size 3 (16–28 lbs)", short:"3" },
  { value:"4", label:"Size 4 (22–37 lbs)", short:"4" },
  { value:"5", label:"Size 5 (27+ lbs)", short:"5" },
  { value:"6", label:"Size 6 (35+ lbs)", short:"6" },
  { value:"Pull-Ups 2T-3T", label:"Pull-Ups 2T–3T", short:"2T" },
  { value:"Pull-Ups 4T-5T", label:"Pull-Ups 4T–5T", short:"4T" },
];
const RADIUS_OPTIONS = [
  { value:"1",label:"1 mile" },{ value:"5",label:"5 miles" },
  { value:"10",label:"10 miles" },{ value:"25",label:"25 miles" },
];
const URGENCY_LEVELS = [
  { value:"low",label:"Low — Can wait a few days",color:T.green },
  { value:"medium",label:"Medium — Need within 1–2 days",color:T.amber },
  { value:"high",label:"High — Urgent, running out today",color:T.red },
];

const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const timeAgo = (d) => { if(!d) return ""; const s=Math.floor((Date.now()-new Date(d).getTime())/1000); if(s<60) return "just now"; if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

// ── SECTION: Supabase Configuration ─────────────────────────────────────────
const SUPABASE_URL = "https://jwbukmmepqyahbtchcqy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3YnVrbW1lcHF5YWhidGNoY3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzI5MDEsImV4cCI6MjA4ODY0ODkwMX0.CUOzGE9nRGCQix40fOh0BiUw6svjTyGHfIX0Nzy9F0Q";

const supabase = {
  _headers() {
    const h = { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json", "Prefer": "return=representation" };
    const token = sessionStorage.getItem("sb_access_token");
    if (token) h["Authorization"] = `Bearer ${token}`;
    else h["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
    return h;
  },
  async auth_signInAnonymously() {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.access_token) sessionStorage.setItem("sb_access_token", data.access_token);
    return data;
  },
  async auth_signUp(email, password, displayName) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: { display_name: displayName } })
    });
    const data = await res.json();
    if (data.access_token) sessionStorage.setItem("sb_access_token", data.access_token);
    return data;
  },
  async auth_signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.access_token) sessionStorage.setItem("sb_access_token", data.access_token);
    return data;
  },
  async from(table) {
    const base = `${SUPABASE_URL}/rest/v1/${table}`;
    const headers = this._headers();
    return {
      async select(query = "*", filters = {}) {
        let url = `${base}?select=${query}`;
        for (const [k, v] of Object.entries(filters)) url += `&${k}=${v}`;
        const res = await fetch(url, { headers });
        return res.json();
      },
      async insert(rows) {
        const res = await fetch(base, { method: "POST", headers: { ...headers, "Prefer": "return=representation" }, body: JSON.stringify(rows) });
        return res.json();
      },
      async update(data, filters = {}) {
        let url = base;
        const params = Object.entries(filters).map(([k, v]) => `${k}=${v}`).join("&");
        if (params) url += `?${params}`;
        const res = await fetch(url, { method: "PATCH", headers: { ...headers, "Prefer": "return=representation" }, body: JSON.stringify(data) });
        return res.json();
      },
      async delete(filters = {}) {
        let url = base;
        const params = Object.entries(filters).map(([k, v]) => `${k}=${v}`).join("&");
        if (params) url += `?${params}`;
        const res = await fetch(url, { method: "DELETE", headers });
        return res.ok;
      }
    };
  }
};

let LIVE_MODE = false;

// ── SECTION: Data Service ───────────────────────────────────────────────────
function createDemoStore() {
  let requests = [];
  let matches = [];
  let profiles = {};
  let listeners = new Set();

  const demoSeekers = [
    { id:"demo-1", name:"Maria G.", zip:"90210" },
    { id:"demo-2", name:"James T.", zip:"90211" },
    { id:"demo-3", name:"Aisha K.", zip:"90212" },
    { id:"demo-4", name:"Chen W.",  zip:"90213" },
    { id:"demo-5", name:"Rosa M.",  zip:"90214" },
    { id:"demo-6", name:"David L.", zip:"90215" },
  ];
  demoSeekers.forEach(s => { profiles[s.id] = { id:s.id, displayName:s.name, zipCode:s.zip, role:"seeker", createdAt:new Date(Date.now()-86400000*30).toISOString() }; });

  requests = [
    { id:uid(), seekerId:"demo-1", size:"3", zipCode:"90210", urgency:"high", notes:"Down to our last 3 diapers, baby is 7 months.", status:"active", timesHelped:0, createdAt:new Date(Date.now()-3600000).toISOString() },
    { id:uid(), seekerId:"demo-2", size:"4", zipCode:"90211", urgency:"medium", notes:"", status:"active", timesHelped:0, createdAt:new Date(Date.now()-86400000).toISOString() },
    { id:uid(), seekerId:"demo-3", size:"Newborn", zipCode:"90212", urgency:"high", notes:"Baby born 3 days ago, didn't receive enough at the hospital.", status:"active", timesHelped:0, createdAt:new Date(Date.now()-43200000).toISOString() },
    { id:uid(), seekerId:"demo-4", size:"5", zipCode:"90213", urgency:"low", notes:"Stocking up for the week.", status:"active", timesHelped:2, createdAt:new Date(Date.now()-172800000).toISOString() },
    { id:uid(), seekerId:"demo-5", size:"4", zipCode:"90214", urgency:"medium", notes:"Twins — we go through diapers fast.", status:"active", timesHelped:1, createdAt:new Date(Date.now()-7200000).toISOString() },
    { id:uid(), seekerId:"demo-6", size:"2", zipCode:"90215", urgency:"high", notes:"Single dad, between paychecks.", status:"active", timesHelped:0, createdAt:new Date(Date.now()-10800000).toISOString() },
    { id:uid(), seekerId:"demo-1", size:"Pull-Ups 2T-3T", zipCode:"90210", urgency:"low", notes:"Older sibling starting potty training.", status:"active", timesHelped:0, createdAt:new Date(Date.now()-259200000).toISOString() },
  ];

  const notify = () => listeners.forEach(fn => fn());

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getProfile(id) { return profiles[id] || null; },
    setProfile(id, data) { profiles[id] = { ...profiles[id], ...data, id }; notify(); },
    getRequests() { return [...requests]; },
    getActiveRequests() { return requests.filter(r => r.status === "active"); },
    getUserRequests(userId) { return requests.filter(r => r.seekerId === userId); },
    createRequest(data) { const r = { id:uid(), ...data, status:"active", timesHelped:0, createdAt:new Date().toISOString() }; requests.unshift(r); notify(); return r; },
    deleteRequest(id) { requests = requests.filter(r => r.id !== id); notify(); },
    updateRequest(id, data) { requests = requests.map(r => r.id === id ? { ...r, ...data } : r); notify(); },
    getMatches(donorId) { return matches.filter(m => m.donorId === donorId); },
    saveMatches(newMatches) { matches = [...matches.filter(m => !newMatches.find(nm => nm.requestId === m.requestId && nm.donorId === m.donorId)), ...newMatches]; notify(); },
    updateMatch(id, data) { matches = matches.map(m => m.id === id ? { ...m, ...data } : m); notify(); },
    getStats() {
      const active = requests.filter(r => r.status === "active").length;
      const fulfilled = requests.filter(r => r.status === "fulfilled").length;
      const zips = new Set(requests.map(r => r.zipCode)).size;
      const totalMatches = matches.filter(m => m.status === "completed").length;
      return { active, fulfilled, zips, totalMatches };
    },
  };
}

const demoStore = createDemoStore();

// ── SECTION: AI Matching Service ────────────────────────────────────────────
async function runAIMatching({ donorZip, donorSizes, donorRadius, donorId, store }) {
  if (LIVE_MODE) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-match`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sessionStorage.getItem("sb_access_token") || SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ donorZip, donorSizes, donorRadius, donorId }),
      });
      if (res.ok) {
        const { matches } = await res.json();
        if (matches && matches.length > 0) {
          const formatted = matches.map(m => ({
            id: m.id || uid(), donorId, requestId: m.requestId, score: m.score,
            reason: m.reason, distance: m.distance || 0, status: "suggested",
            createdAt: new Date().toISOString(),
            _request: m._request || { size: m.size, urgency: m.urgency, notes: m.notes, zipCode: m.zipCode, createdAt: m.requestCreatedAt, timesHelped: m.timesHelped },
            _seekerName: m.seekerName || "A family",
          }));
          store.saveMatches(formatted);
          return formatted;
        }
      }
    } catch (e) {
      console.log("[Diaper Drive] Edge function unavailable, using local matching", e);
    }
  }

  const allRequests = store.getActiveRequests().filter(r => r.seekerId !== donorId);
  if (allRequests.length === 0) return [];
  await new Promise(r => setTimeout(r, 1500));

  const scored = allRequests.map(req => {
    let score = 0;
    let reasons = [];
    const sizeIdx = DIAPER_SIZES.findIndex(s => s.value === req.size);
    const donorSizeIdxs = donorSizes.map(ds => DIAPER_SIZES.findIndex(s => s.value === ds));
    if (donorSizes.includes(req.size)) {
      score += 40; reasons.push(`Exact size match (${req.size})`);
    } else if (donorSizeIdxs.some(i => Math.abs(i - sizeIdx) === 1)) {
      score += 15;
      const adjacent = DIAPER_SIZES[donorSizeIdxs.find(i => Math.abs(i - sizeIdx) === 1)]?.value;
      reasons.push(`Close size — you have ${adjacent}, they need ${req.size}`);
    } else { return null; }

    const urgencyPts = { high:30, medium:15, low:5 };
    score += urgencyPts[req.urgency] || 10;
    if (req.urgency === "high") reasons.push("Urgent — running out today");
    else if (req.urgency === "medium") reasons.push("Needed within 1–2 days");

    const hoursOld = (Date.now() - new Date(req.createdAt).getTime()) / 3600000;
    const recencyPts = clamp(Math.round(15 - hoursOld * 0.2), 0, 15);
    score += recencyPts;
    if (hoursOld < 6) reasons.push("Posted recently");

    if (req.timesHelped === 0) { score += 15; reasons.push("First-time request"); }

    const dist = Math.abs(parseInt(req.zipCode || "0") - parseInt(donorZip || "0")) * 0.3 + Math.random() * 1.5;
    if (dist > parseFloat(donorRadius)) return null;
    if (req.notes && req.notes.length > 10) score += 5;

    const seekerProfile = store.getProfile(req.seekerId);
    return {
      id: uid(), donorId, requestId: req.id, score: clamp(score, 0, 100),
      reason: reasons.join(". ") + ".", distance: dist, status: "suggested",
      createdAt: new Date().toISOString(),
      _request: req, _seekerName: seekerProfile?.displayName || "A family",
    };
  }).filter(Boolean).sort((a,b) => b.score - a.score);

  store.saveMatches(scored);
  return scored;
}
// ── SECTION: Context ────────────────────────────────────────────────────────
const AppCtx = createContext(null);

function AppProvider({ children }) {
  const [user, setUser] = useState(() => {
    const id = uid();
    return { id, displayName:"", zipCode:"", role:"both", createdAt:new Date().toISOString(), isAnonymous:true };
  });
  const [store] = useState(() => demoStore);
  const [notifications, setNotifications] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => { return store.subscribe(() => setTick(t => t+1)); }, [store]);

  useEffect(() => {
    (async () => {
      try {
        const data = await supabase.auth_signInAnonymously();
        if (data.access_token && data.user) {
          LIVE_MODE = true; setIsLive(true);
          setUser(prev => ({ ...prev, id: data.user.id, isAnonymous: true }));
        }
      } catch (e) { console.log("[Diaper Drive] Demo mode", e); }
    })();
  }, []);

  const notify = useCallback((message, type="success") => {
    const id = uid();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4500);
  }, []);

  const updateUser = useCallback((data) => {
    setUser(prev => {
      const next = { ...prev, ...data };
      store.setProfile(next.id, next);
      if (LIVE_MODE) {
        supabase.from("profiles").then(t => t.update(
          { display_name: next.displayName, zip_code: next.zipCode, role: next.role },
          { "id": `eq.${next.id}` }
        )).catch(() => {});
      }
      return next;
    });
  }, [store]);

  return (
    <AppCtx.Provider value={{ user, updateUser, store, notifications, notify, isLive }}>
      {children}
    </AppCtx.Provider>
  );
}

function useApp() { const c = useContext(AppCtx); if(!c) throw new Error("useApp requires AppProvider"); return c; }

// ── SECTION: Primitives ─────────────────────────────────────────────────────

function Notifs() {
  const { notifications } = useApp();
  if (!notifications.length) return null;
  const styles = {
    success:{ bg:T.greenLt, bdr:T.green, txt:"#1a5c3a" },
    error:{ bg:T.redLt, bdr:T.red, txt:"#8b1a1a" },
    info:{ bg:T.gray[100], bdr:T.gray[400], txt:T.gray[700] },
  };
  return (
    <div style={{ position:"fixed",top:24,right:24,zIndex:1000,display:"flex",flexDirection:"column",gap:10,maxWidth:400 }}>
      {notifications.map(n => { const s=styles[n.type]||styles.info; return (
        <div key={n.id} style={{
          padding:"14px 20px",background:s.bg,borderLeft:`3px solid ${s.bdr}`,
          borderRadius:T.radius.md,boxShadow:T.shadow.lg,animation:"slideIn .3s ease-out",
        }}>
          <span style={{ fontSize:14,color:s.txt,fontWeight:500,letterSpacing:"-0.01em" }}>{n.message}</span>
        </div>
      );})}
    </div>
  );
}

function Btn({ children, variant="primary", size="md", disabled, loading, onClick, style:sx, ...p }) {
  const [h,setH]=useState(false);
  const base = {
    border:"none", fontWeight:600, cursor:disabled?"not-allowed":"pointer",
    transition:"all .2s ease", display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,
    width:"100%", letterSpacing:"-0.01em", fontFamily:T.font,
  };
  const variants = {
    primary:{ background:disabled?T.gray[300]:h?T.black:T.charcoal, color:T.white },
    accent:{ background:disabled?T.gray[300]:h?T.accentDk:T.accent, color:T.white },
    ghost:{ background:h?T.gray[100]:"transparent", color:T.gray[700], },
    outline:{ background:h?T.gray[100]:T.white, color:T.black, border:`1px solid ${T.gray[300]}` },
    danger:{ background:disabled?T.gray[300]:h?"#c82333":T.red, color:T.white },
    ai:{ background:disabled?T.gray[300]:h?T.black:T.charcoal, color:T.white },
  };
  const sizes = { sm:{padding:"8px 16px",fontSize:13,borderRadius:T.radius.sm},md:{padding:"12px 24px",fontSize:14,borderRadius:T.radius.md},lg:{padding:"16px 32px",fontSize:16,borderRadius:T.radius.md} };
  const v=variants[variant]||variants.primary, s=sizes[size]||sizes.md;
  return (
    <button onClick={onClick} disabled={disabled||loading}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ ...base, ...s, ...v, opacity:loading?.6:1, ...sx }} {...p}>
      {loading && <span style={{ display:"inline-block",width:14,height:14,border:`2px solid rgba(255,255,255,.3)`,borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite" }}/>}
      {children}
    </button>
  );
}

function Sel({ label,id,options,value,onChange,required }) {
  return (<div>
    {label && <label htmlFor={id} style={{ display:"block",fontSize:12,fontWeight:600,color:T.gray[500],marginBottom:8,letterSpacing:"0.04em",textTransform:"uppercase" }}>{label}</label>}
    <select id={id} value={value} onChange={e=>onChange(e.target.value)} required={required}
      style={{ width:"100%",padding:"12px 14px",borderRadius:T.radius.md,border:`1px solid ${T.gray[200]}`,fontSize:15,color:T.black,background:T.white,outline:"none",fontFamily:T.font,appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%23737373' stroke-width='1.5'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 14px center" }}>
      {options.map(o => <option key={typeof o==="string"?o:o.value} value={typeof o==="string"?o:o.value}>{typeof o==="string"?o:o.label}</option>)}
    </select>
  </div>);
}

function Inp({ label,id,value,onChange,placeholder,required,error,type="text",multiline }) {
  const Tag = multiline ? "textarea" : "input";
  return (<div>
    {label && <label htmlFor={id} style={{ display:"block",fontSize:12,fontWeight:600,color:T.gray[500],marginBottom:8,letterSpacing:"0.04em",textTransform:"uppercase" }}>{label}</label>}
    <Tag id={id} type={multiline?undefined:type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required}
      rows={multiline?3:undefined}
      style={{ width:"100%",padding:"12px 14px",borderRadius:T.radius.md,border:`1px solid ${error?T.red:T.gray[200]}`,fontSize:15,color:T.black,outline:"none",boxSizing:"border-box",fontFamily:T.font,resize:multiline?"vertical":"none",transition:"border-color .2s" }}/>
    {error && <p style={{ fontSize:12,color:T.red,marginTop:6 }}>{error}</p>}
  </div>);
}

function Card({ children, style:sx, ...p }) {
  return <div style={{ background:T.white,borderRadius:T.radius.lg,border:`1px solid ${T.gray[200]}`,boxShadow:T.shadow.sm,...sx }} {...p}>{children}</div>;
}

function Tag({ children, variant="default" }) {
  const vs = {
    default:{ bg:T.gray[100],c:T.gray[600] },
    accent:{ bg:T.accentLt,c:T.accent },
    green:{ bg:T.greenLt,c:T.green },
    amber:{ bg:T.amberLt,c:"#8B6914" },
    red:{ bg:T.redLt,c:T.red },
  };
  const v=vs[variant]||vs.default;
  return <span style={{ display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:T.radius.full,fontSize:11,fontWeight:600,background:v.bg,color:v.c,letterSpacing:"0.02em",textTransform:"uppercase" }}>{children}</span>;
}

function Empty({ title,desc }) {
  return (<div style={{ textAlign:"center",padding:"64px 24px" }}>
    <h3 style={{ fontSize:18,fontWeight:600,color:T.gray[700],marginBottom:8,letterSpacing:"-0.02em" }}>{title}</h3>
    <p style={{ fontSize:14,color:T.gray[400],maxWidth:300,margin:"0 auto",lineHeight:1.6 }}>{desc}</p>
  </div>);
}

function Confirm({ open,title,msg,onOk,onNo,okLabel="Confirm",okVariant="danger" }) {
  if(!open) return null;
  return (<div style={{ position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.5)",backdropFilter:"blur(8px)" }}>
    <Card style={{ maxWidth:400,width:"90%",padding:32 }}>
      <h3 style={{ fontSize:20,fontWeight:700,color:T.black,marginBottom:8,letterSpacing:"-0.02em" }}>{title}</h3>
      <p style={{ fontSize:14,color:T.gray[500],marginBottom:28,lineHeight:1.6 }}>{msg}</p>
      <div style={{ display:"flex",gap:12 }}>
        <Btn variant="outline" onClick={onNo} style={{ flex:1 }}>Cancel</Btn>
        <Btn variant={okVariant} onClick={onOk} style={{ flex:1 }}>{okLabel}</Btn>
      </div>
    </Card>
  </div>);
}

function ScoreRing({ score, size=48 }) {
  const r = size/2 - 3;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score/100) * circ;
  const color = score >= 75 ? T.green : score >= 50 ? T.amber : T.gray[400];
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.gray[200]} strokeWidth={2}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={2} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition:"stroke-dashoffset .6s ease" }}/>
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color }}>
        {score}
      </div>
    </div>
  );
}

function Spinner({ text="Loading..." }) {
  return (<div style={{ textAlign:"center",padding:48 }}>
    <div style={{ width:32,height:32,border:`2px solid ${T.gray[200]}`,borderTopColor:T.black,borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 16px" }}/>
    <p style={{ color:T.gray[400],fontSize:13,letterSpacing:"0.02em" }}>{text}</p>
  </div>);
}

// ── SECTION: Auth Modal ─────────────────────────────────────────────────────

function AuthModal({ open, onClose }) {
  const { user, updateUser, notify, isLive } = useApp();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleAuth = async () => {
    if (!email || !password) return;
    setLoading(true); setError("");
    try {
      if (LIVE_MODE) {
        const data = mode === "signup"
          ? await supabase.auth_signUp(email, password, name || email.split("@")[0])
          : await supabase.auth_signIn(email, password);
        if (data.error || data.error_description) {
          setError(data.error_description || data.msg || "Authentication failed");
          setLoading(false); return;
        }
        if (data.access_token && data.user) {
          updateUser({ id: data.user.id, displayName: name || email.split("@")[0], isAnonymous: false, email });
        }
      } else {
        updateUser({ displayName: name || email.split("@")[0], isAnonymous: false, email });
      }
      notify(mode === "signup" ? "Account created." : "Welcome back.", "success");
      onClose();
    } catch (e) { setError("Connection failed."); }
    setLoading(false);
  };

  const handleAnon = () => {
    updateUser({ displayName: "Anonymous", isAnonymous: true });
    notify("Continuing as guest.", "info");
    onClose();
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(12px)" }}>
      <Card style={{ maxWidth:420,width:"92%",padding:"40px 36px",position:"relative" }}>
        <div style={{ marginBottom:32 }}>
          <h2 style={{ fontSize:28,fontWeight:700,color:T.black,letterSpacing:"-0.03em",marginBottom:6 }}>
            {mode === "signup" ? "Create account" : "Sign in"}
          </h2>
          <p style={{ fontSize:14,color:T.gray[500],lineHeight:1.5 }}>
            {mode === "signup" ? "Join the community" : "Welcome back to Diaper Drive"}
          </p>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:18 }}>
          {mode === "signup" && <Inp label="Name" id="auth-name" value={name} onChange={setName} placeholder="Your name" />}
          <Inp label="Email" id="auth-email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <Inp label="Password" id="auth-pass" value={password} onChange={setPassword} placeholder="Enter password" type="password" />
          {error && <p style={{ fontSize:13,color:T.red,margin:0 }}>{error}</p>}
          <Btn onClick={handleAuth} loading={loading}>{mode === "signup" ? "Create Account" : "Sign In"}</Btn>
          <div style={{ textAlign:"center" }}>
            <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              style={{ background:"none",border:"none",color:T.gray[500],fontSize:13,fontWeight:500,cursor:"pointer",padding:4 }}>
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:16,margin:"4px 0" }}>
            <div style={{ flex:1,height:1,background:T.gray[200] }}/>
            <span style={{ fontSize:11,color:T.gray[400],letterSpacing:"0.05em",textTransform:"uppercase" }}>or</span>
            <div style={{ flex:1,height:1,background:T.gray[200] }}/>
          </div>
          <Btn variant="outline" onClick={handleAnon}>Continue as Guest</Btn>
        </div>
        <button onClick={onClose} style={{ position:"absolute",top:20,right:20,background:"none",border:"none",fontSize:18,color:T.gray[400],cursor:"pointer",padding:4 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </Card>
    </div>
  );
}

// ── SECTION: Dashboard ──────────────────────────────────────────────────────

function DashboardView() {
  const { store } = useApp();
  const stats = store.getStats();
  const recentRequests = store.getActiveRequests().slice(0, 5);

  return (
    <div>
      {/* Hero */}
      <div style={{ marginBottom:40 }}>
        <h2 style={{ fontSize:36,fontWeight:700,color:T.black,letterSpacing:"-0.03em",marginBottom:6,lineHeight:1.1 }}>
          Community Impact
        </h2>
        <p style={{ fontSize:15,color:T.gray[500],lineHeight:1.5 }}>Real-time overview of your network</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:40 }}>
        {[
          { val:stats.active, label:"Active" },
          { val:stats.fulfilled, label:"Fulfilled" },
          { val:stats.zips, label:"Areas" },
          { val:stats.totalMatches, label:"Matched" },
        ].map(s => (
          <Card key={s.label} style={{ padding:"28px 20px",textAlign:"center" }}>
            <div style={{ fontSize:32,fontWeight:700,color:T.black,letterSpacing:"-0.03em",marginBottom:4 }}>{s.val}</div>
            <div style={{ fontSize:11,color:T.gray[400],fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <div style={{ marginBottom:40 }}>
        <h3 style={{ fontSize:13,fontWeight:600,color:T.gray[400],marginBottom:16,letterSpacing:"0.06em",textTransform:"uppercase" }}>Recent Requests</h3>
        <div style={{ display:"flex",flexDirection:"column",gap:1,background:T.gray[200],borderRadius:T.radius.lg,overflow:"hidden" }}>
          {recentRequests.map(req => {
            const urgVar = req.urgency==="high"?"red":req.urgency==="medium"?"amber":"green";
            return (
              <div key={req.id} style={{ padding:"16px 20px",background:T.white,display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <span style={{ fontWeight:600,fontSize:15,color:T.black,letterSpacing:"-0.01em" }}>Size {req.size}</span>
                    <Tag variant={urgVar}>{req.urgency}</Tag>
                    <span style={{ fontSize:12,color:T.gray[400] }}>{timeAgo(req.createdAt)}</span>
                  </div>
                  {req.notes && <p style={{ fontSize:13,color:T.gray[500],marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{req.notes}</p>}
                </div>
                <span style={{ fontSize:13,color:T.gray[400],flexShrink:0,fontVariantNumeric:"tabular-nums" }}>{req.zipCode}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Insight */}
      <Card style={{ padding:"28px 24px",background:T.gray[100],borderColor:T.gray[200] }}>
        <h3 style={{ fontSize:13,fontWeight:600,color:T.gray[400],marginBottom:12,letterSpacing:"0.06em",textTransform:"uppercase" }}>AI Insight</h3>
        <p style={{ fontSize:15,color:T.gray[700],lineHeight:1.7 }}>
          <strong>{stats.active} families</strong> waiting across <strong>{stats.zips} areas</strong>.
          {recentRequests.filter(r => r.urgency === "high").length > 0 &&
            ` ${recentRequests.filter(r => r.urgency === "high").length} urgent.`}
          {" "}Head to <strong>Give</strong> and run Smart Match.
        </p>
      </Card>
    </div>
  );
}

// ── SECTION: Give View ──────────────────────────────────────────────────────

function GiveView() {
  const { user, store, notify } = useApp();
  const [mode, setMode] = useState("manual");
  const [size, setSize] = useState("4");
  const [radius, setRadius] = useState("5");
  const [zip, setZip] = useState(user.zipCode || "");
  const [zipErr, setZipErr] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [contactId, setContactId] = useState(null);
  const [aiSizes, setAiSizes] = useState(["4"]);
  const [aiResults, setAiResults] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);

  const validZip = z => /^\d{5}$/.test(z);

  const handleManualSearch = async () => {
    if (!validZip(zip)) { setZipErr("Enter a valid 5-digit zip"); return; }
    setZipErr(""); setLoading(true);
    try {
      let active;
      if (LIVE_MODE) {
        const tbl = await supabase.from("requests");
        const rows = await tbl.select("*", { "status": "eq.active", "size": `eq.${size}`, "seeker_id": `neq.${user.id}` });
        active = (Array.isArray(rows) ? rows : []).map(r => ({
          id: r.id, seekerId: r.seeker_id, size: r.size, zipCode: r.zip_code,
          urgency: r.urgency, notes: r.notes, status: r.status,
          timesHelped: r.times_helped, createdAt: r.created_at
        }));
      } else {
        active = store.getActiveRequests().filter(r => r.seekerId !== user.id && r.size === size);
      }
      const withDist = active.map(r => ({
        ...r, distance: Math.abs(parseInt(r.zipCode||"0")-parseInt(zip||"0"))*0.3 + Math.random()*1.5,
      })).filter(r => r.distance <= parseFloat(radius)).sort((a,b) => a.distance - b.distance);
      setResults(withDist);
    } catch (e) {
      const active = store.getActiveRequests().filter(r => r.seekerId !== user.id && r.size === size);
      const withDist = active.map(r => ({
        ...r, distance: Math.abs(parseInt(r.zipCode||"0")-parseInt(zip||"0"))*0.3 + Math.random()*1.5,
      })).filter(r => r.distance <= parseFloat(radius)).sort((a,b) => a.distance - b.distance);
      setResults(withDist);
    }
    setLoading(false);
  };

  const handleAIMatch = async () => {
    if (!validZip(zip)) { setZipErr("Enter a valid 5-digit zip"); return; }
    if (aiSizes.length === 0) { notify("Select at least one size","error"); return; }
    setZipErr(""); setAiLoading(true);
    try {
      const matches = await runAIMatching({ donorZip:zip, donorSizes:aiSizes, donorRadius:radius, donorId:user.id, store });
      setAiResults(matches);
    } catch(e) { notify("Matching failed. Try again.","error"); }
    setAiLoading(false);
  };

  const toggleAiSize = (sz) => setAiSizes(prev => prev.includes(sz) ? prev.filter(s => s !== sz) : [...prev, sz]);

  const handleAcceptMatch = async (match) => {
    setAcceptingId(match.id);
    store.updateMatch(match.id, { status:"accepted" });
    store.updateRequest(match.requestId, { status:"matched" });
    if (LIVE_MODE) {
      try {
        const mTbl = await supabase.from("matches");
        await mTbl.update({ status: "accepted" }, { "id": `eq.${match.id}` });
        const rTbl = await supabase.from("requests");
        await rTbl.update({ status: "matched" }, { "id": `eq.${match.requestId}` });
      } catch (e) {}
    }
    notify(`Match accepted — helping ${match._seekerName} with Size ${match._request.size}.`, "success");
    setAcceptingId(null);
    setAiResults(prev => prev?.filter(m => m.id !== match.id));
  };

  return (
    <div>
      <div style={{ marginBottom:32 }}>
        <h2 style={{ fontSize:36,fontWeight:700,color:T.black,letterSpacing:"-0.03em",marginBottom:6,lineHeight:1.1 }}>Give</h2>
        <p style={{ fontSize:15,color:T.gray[500] }}>Find families who need your help</p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display:"flex",background:T.gray[100],borderRadius:T.radius.md,padding:3,marginBottom:28,gap:2 }}>
        {[{ id:"manual",label:"Search" },{ id:"ai",label:"Smart Match" }].map(m => (
          <button key={m.id} onClick={()=>setMode(m.id)}
            style={{ flex:1,padding:"10px 16px",borderRadius:T.radius.sm,border:"none",fontSize:13,fontWeight:600,cursor:"pointer",
              transition:"all .2s", fontFamily:T.font, letterSpacing:"-0.01em",
              background:mode===m.id?T.white:"transparent",
              color:mode===m.id?T.black:T.gray[400],
              boxShadow:mode===m.id?T.shadow.sm:"none" }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Search Form */}
      <Card style={{ padding:28,marginBottom:28 }}>
        {mode === "manual" ? (
          <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
              <Sel label="Diaper Size" id="s-size" options={DIAPER_SIZES} value={size} onChange={setSize}/>
              <Sel label="Radius" id="s-rad" options={RADIUS_OPTIONS} value={radius} onChange={setRadius}/>
            </div>
            <Inp label="Zip Code" id="s-zip" value={zip} onChange={v=>{setZip(v);setZipErr("");}} placeholder="90210" error={zipErr}/>
            <Btn onClick={handleManualSearch} loading={loading}>Search</Btn>
          </div>
        ) : (
          <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
            <div>
              <label style={{ display:"block",fontSize:12,fontWeight:600,color:T.gray[500],marginBottom:10,letterSpacing:"0.04em",textTransform:"uppercase" }}>Sizes Available</label>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                {DIAPER_SIZES.map(ds => {
                  const sel = aiSizes.includes(ds.value);
                  return (
                    <button key={ds.value} onClick={()=>toggleAiSize(ds.value)}
                      style={{ padding:"8px 16px",borderRadius:T.radius.full,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",fontFamily:T.font,
                        background:sel?T.black:T.white, color:sel?T.white:T.gray[500],
                        border:`1.5px solid ${sel?T.black:T.gray[300]}` }}>
                      {ds.short || ds.value}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
              <Inp label="Zip Code" id="ai-zip" value={zip} onChange={v=>{setZip(v);setZipErr("");}} placeholder="90210" error={zipErr}/>
              <Sel label="Radius" id="ai-rad" options={RADIUS_OPTIONS} value={radius} onChange={setRadius}/>
            </div>
            <Btn onClick={handleAIMatch} loading={aiLoading}>
              {aiLoading ? "Analyzing..." : "Find Matches"}
            </Btn>
          </div>
        )}
      </Card>

      {/* Manual Results */}
      {mode === "manual" && (
        <>
          {results === null && !loading && <Empty title="Ready to search" desc="Enter your zip code to find families nearby."/>}
          {loading && <Spinner text="Searching..."/>}
          {results && !loading && results.length === 0 && <Empty title="No results" desc="Try a wider radius or different size."/>}
          {results && !loading && results.length > 0 && (
            <div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
                <span style={{ fontSize:13,fontWeight:600,color:T.gray[400],letterSpacing:"0.04em",textTransform:"uppercase" }}>{results.length} found</span>
                <Tag variant="default">Size {size}</Tag>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:1,background:T.gray[200],borderRadius:T.radius.lg,overflow:"hidden" }}>
                {results.map(need => {
                  const urgVar = need.urgency==="high"?"red":need.urgency==="medium"?"amber":"green";
                  return (
                    <div key={need.id} style={{ padding:"20px 24px",background:T.white,display:"flex",justifyContent:"space-between",alignItems:"center",gap:16 }}>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
                          <span style={{ fontSize:16,fontWeight:700,color:T.black }}>Size {need.size}</span>
                          <Tag variant={urgVar}>{need.urgency}</Tag>
                        </div>
                        <div style={{ display:"flex",gap:16,fontSize:13,color:T.gray[400] }}>
                          <span>{need.zipCode}</span>
                          <span>{timeAgo(need.createdAt)}</span>
                          <span>{need.distance.toFixed(1)} mi</span>
                        </div>
                        {need.notes && <p style={{ fontSize:13,color:T.gray[500],marginTop:6 }}>{need.notes}</p>}
                      </div>
                      <Btn variant="primary" size="sm" onClick={()=>{setContactId(need.id);setTimeout(()=>{notify(`Drop-off arranged for Size ${need.size}.`);setContactId(null);},600);}} loading={contactId===need.id} style={{ width:"auto",flexShrink:0 }}>Arrange</Btn>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Results */}
      {mode === "ai" && (
        <>
          {aiResults === null && !aiLoading && <Empty title="Smart Match" desc="Select your sizes and let AI find the best matches."/>}
          {aiLoading && <Spinner text="Analyzing requests..."/>}
          {aiResults && !aiLoading && aiResults.length === 0 && <Empty title="No matches" desc="Try adding more sizes or expanding your radius."/>}
          {aiResults && !aiLoading && aiResults.length > 0 && (
            <div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
                <span style={{ fontSize:13,fontWeight:600,color:T.gray[400],letterSpacing:"0.04em",textTransform:"uppercase" }}>{aiResults.length} matches</span>
                <Tag variant="accent">AI Ranked</Tag>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                {aiResults.map((match,i) => (
                  <Card key={match.id} style={{ padding:24, borderColor:i===0?T.accent:T.gray[200] }}>
                    <div style={{ display:"flex",gap:20,alignItems:"flex-start" }}>
                      <ScoreRing score={match.score} size={52}/>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap" }}>
                          <span style={{ fontSize:16,fontWeight:700,color:T.black,letterSpacing:"-0.01em" }}>{match._seekerName}</span>
                          <Tag variant="default">Size {match._request.size}</Tag>
                          <Tag variant={match._request.urgency==="high"?"red":match._request.urgency==="medium"?"amber":"green"}>{match._request.urgency}</Tag>
                          {i===0 && <Tag variant="accent">Top Match</Tag>}
                        </div>
                        <div style={{ display:"flex",gap:16,marginBottom:10,fontSize:12,color:T.gray[400] }}>
                          <span>{match.distance.toFixed(1)} mi</span>
                          <span>{timeAgo(match._request.createdAt)}</span>
                          {match._request.timesHelped===0 && <span style={{ color:T.accent,fontWeight:600 }}>First request</span>}
                        </div>
                        <div style={{ background:T.gray[100],borderRadius:T.radius.sm,padding:"10px 14px",marginBottom:12 }}>
                          <p style={{ fontSize:13,color:T.gray[600],margin:0,lineHeight:1.6 }}>{match.reason}</p>
                        </div>
                        {match._request.notes && <p style={{ fontSize:13,color:T.gray[500],marginBottom:12 }}>{match._request.notes}</p>}
                        <div style={{ display:"flex",gap:8 }}>
                          <Btn variant="primary" size="sm" onClick={()=>handleAcceptMatch(match)} loading={acceptingId===match.id} style={{ width:"auto" }}>Accept</Btn>
                          <Btn variant="ghost" size="sm" style={{ width:"auto" }}>Skip</Btn>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── SECTION: Need View ──────────────────────────────────────────────────────

function NeedView() {
  const { user, store, notify } = useApp();
  const [size, setSize] = useState("Newborn");
  const [zip, setZip] = useState(user.zipCode || "");
  const [zipErr, setZipErr] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [delTarget, setDelTarget] = useState(null);

  const myReqs = store.getUserRequests(user.id).filter(r => r.status === "active");

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!/^\d{5}$/.test(zip)) { setZipErr("Enter a valid 5-digit zip"); return; }
    setZipErr(""); setSubmitting(true);
    try {
      store.createRequest({ seekerId:user.id, size, zipCode:zip, urgency, notes:notes.trim() });
      if (LIVE_MODE) {
        const tbl = await supabase.from("requests");
        await tbl.insert([{ seeker_id:user.id, size, zip_code:zip, urgency, notes:notes.trim() || null }]);
      }
      notify("Request posted.","success");
      setSize("Newborn"); setNotes("");
    } catch (err) {
      notify("Saved locally.","info");
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    store.deleteRequest(delTarget);
    if (LIVE_MODE) {
      try {
        const tbl = await supabase.from("requests");
        await tbl.delete({ "id": `eq.${delTarget}` });
      } catch (e) {}
    }
    notify("Request removed.","info");
    setDelTarget(null);
  };

  return (
    <div>
      <div style={{ marginBottom:32 }}>
        <h2 style={{ fontSize:36,fontWeight:700,color:T.black,letterSpacing:"-0.03em",marginBottom:6,lineHeight:1.1 }}>Request</h2>
        <p style={{ fontSize:15,color:T.gray[500] }}>Tell your community what you need</p>
      </div>

      <Card style={{ padding:28,marginBottom:40 }}>
        <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
            <Sel label="Size Needed" id="n-size" options={DIAPER_SIZES} value={size} onChange={setSize} required/>
            <Inp label="Zip Code" id="n-zip" value={zip} onChange={v=>{setZip(v);setZipErr("");}} placeholder="02492" required error={zipErr}/>
          </div>
          <Sel label="Urgency" id="n-urg" options={URGENCY_LEVELS} value={urgency} onChange={setUrgency}/>
          <Inp label="Notes" id="n-notes" value={notes} onChange={setNotes} placeholder="Anything donors should know..." multiline/>
          <Btn onClick={handleSubmit} loading={submitting}>Submit Request</Btn>
        </div>
      </Card>

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
        <span style={{ fontSize:13,fontWeight:600,color:T.gray[400],letterSpacing:"0.06em",textTransform:"uppercase" }}>My Requests</span>
        {myReqs.length > 0 && <Tag>{myReqs.length} active</Tag>}
      </div>
      {myReqs.length === 0 ? (
        <Empty title="No active requests" desc="Submit a request above to get started."/>
      ) : (
        <div style={{ display:"flex",flexDirection:"column",gap:1,background:T.gray[200],borderRadius:T.radius.lg,overflow:"hidden" }}>
          {myReqs.map(req => {
            const urgVar = req.urgency==="high"?"red":req.urgency==="medium"?"amber":"green";
            return (
              <div key={req.id} style={{ padding:"16px 20px",background:T.white,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:2 }}>
                    <span style={{ fontWeight:600,fontSize:15,color:T.black }}>Size {req.size}</span>
                    <Tag variant={urgVar}>{req.urgency}</Tag>
                  </div>
                  <p style={{ fontSize:12,color:T.gray[400] }}>{req.zipCode} · {timeAgo(req.createdAt)}</p>
                </div>
                <button onClick={()=>setDelTarget(req.id)} style={{ background:"none",border:"none",cursor:"pointer",color:T.gray[400],padding:8,transition:"color .2s" }}
                  onMouseEnter={e=>e.target.style.color=T.red} onMouseLeave={e=>e.target.style.color=T.gray[400]}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Confirm open={!!delTarget} title="Remove request?" msg="This request will no longer be visible to donors." onOk={handleDelete} onNo={()=>setDelTarget(null)}/>
    </div>
  );
}

// ── SECTION: Profile View ───────────────────────────────────────────────────

function ProfileView() {
  const { user, updateUser, store, notify, isLive } = useApp();
  const [name, setName] = useState(user.displayName || "");
  const [zip, setZip] = useState(user.zipCode || "");
  const [role, setRole] = useState(user.role || "both");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateUser({ displayName:name, zipCode:zip, role });
    notify("Profile updated.","success");
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  const myMatches = store.getMatches(user.id);
  const accepted = myMatches.filter(m => m.status === "accepted" || m.status === "completed");

  return (
    <div>
      <div style={{ marginBottom:32 }}>
        <h2 style={{ fontSize:36,fontWeight:700,color:T.black,letterSpacing:"-0.03em",marginBottom:6,lineHeight:1.1 }}>Profile</h2>
        <p style={{ fontSize:15,color:T.gray[500] }}>{user.isAnonymous ? "Guest" : user.email || "Your account"}</p>
      </div>

      <Card style={{ padding:28,marginBottom:32 }}>
        <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
          <Inp label="Name" id="p-name" value={name} onChange={setName} placeholder="Your name"/>
          <Inp label="Zip Code" id="p-zip" value={zip} onChange={setZip} placeholder="Home zip"/>
          <Sel label="Role" id="p-role" options={[{value:"both",label:"Donor & Seeker"},{value:"donor",label:"Donor"},{value:"seeker",label:"Seeker"}]} value={role} onChange={setRole}/>
          <Btn onClick={handleSave}>{saved?"Saved":"Save"}</Btn>
        </div>
      </Card>

      {/* History */}
      {accepted.length > 0 && (
        <div style={{ marginBottom:32 }}>
          <span style={{ display:"block",fontSize:13,fontWeight:600,color:T.gray[400],marginBottom:16,letterSpacing:"0.06em",textTransform:"uppercase" }}>Donation History</span>
          <div style={{ display:"flex",flexDirection:"column",gap:1,background:T.gray[200],borderRadius:T.radius.lg,overflow:"hidden" }}>
            {accepted.map(m => (
              <div key={m.id} style={{ display:"flex",alignItems:"center",gap:16,padding:"14px 20px",background:T.white }}>
                <ScoreRing score={m.score} size={36}/>
                <div style={{ flex:1 }}>
                  <span style={{ fontWeight:600,fontSize:14,color:T.black }}>{m._seekerName} — Size {m._request?.size}</span>
                </div>
                <span style={{ fontSize:12,color:T.gray[400] }}>{timeAgo(m.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <Card style={{ padding:24 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
          <div style={{ width:8,height:8,borderRadius:4,background:isLive?T.green:T.amber }}/>
          <span style={{ fontSize:13,fontWeight:600,color:T.gray[600] }}>{isLive?"Connected":"Demo Mode"}</span>
        </div>
        <p style={{ fontSize:13,color:T.gray[500],lineHeight:1.6 }}>
          {isLive ? "Synced with Supabase in real-time." : "Local demo data. Resets on refresh."}
        </p>
      </Card>

      <div style={{ marginTop:20,textAlign:"center" }}>
        <p style={{ fontSize:11,color:T.gray[400],fontFamily:"monospace" }}>{user.id}</p>
      </div>
    </div>
  );
}

// ── SECTION: App Shell ──────────────────────────────────────────────────────

function DiaperDriveApp() {
  const [tab, setTab] = useState("dashboard");
  const [authOpen, setAuthOpen] = useState(false);
  const { user, isLive } = useApp();

  const tabs = [
    { id:"dashboard", label:"Home",    icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 10l7-7 7 7M5 8.5V16h4v-4h2v4h4V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { id:"give",      label:"Give",    icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id:"need",      label:"Request", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 6h10M5 10h10M5 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id:"profile",   label:"Profile", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  ];

  return (
    <div style={{ minHeight:"100vh",background:T.white }}>
      <Notifs/>
      <AuthModal open={authOpen} onClose={()=>setAuthOpen(false)}/>

      <div style={{ maxWidth:680,margin:"0 auto",padding:"32px 20px",paddingBottom:100 }}>
        {/* Header */}
        <header style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:40 }}>
          <div>
            <h1 style={{ fontSize:18,fontWeight:700,color:T.black,letterSpacing:"-0.02em",margin:0 }}>Diaper Drive</h1>
          </div>
          <button onClick={()=>setAuthOpen(true)}
            style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 16px",borderRadius:T.radius.full,border:`1px solid ${T.gray[200]}`,background:T.white,cursor:"pointer",transition:"all .2s",fontFamily:T.font }}>
            <div style={{ width:24,height:24,borderRadius:12,background:T.black,display:"flex",alignItems:"center",justifyContent:"center",color:T.white,fontSize:11,fontWeight:700 }}>
              {(user.displayName||"?")[0].toUpperCase()}
            </div>
            <span style={{ fontSize:13,fontWeight:600,color:T.black }}>{user.displayName || "Sign in"}</span>
          </button>
        </header>

        {/* Content */}
        {tab === "dashboard" && <DashboardView/>}
        {tab === "give" && <GiveView/>}
        {tab === "need" && <NeedView/>}
        {tab === "profile" && <ProfileView/>}
      </div>

      {/* Bottom Nav */}
      <nav style={{ position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,.95)",backdropFilter:"blur(20px)",borderTop:`1px solid ${T.gray[200]}`,zIndex:100 }}>
        <div style={{ maxWidth:680,margin:"0 auto" }}>
          <div style={{ display:"flex",padding:"8px 4px 12px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"6px 4px",
                  border:"none",background:"transparent",cursor:"pointer",transition:"all .15s",
                  color:tab===t.id?T.black:T.gray[400] }}>
                {t.icon}
                <span style={{ fontSize:10,fontWeight:tab===t.id?700:500,letterSpacing:"0.02em" }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <style>{`
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        *{box-sizing:border-box;margin:0}
        body{font-family:${T.font};overscroll-behavior:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
        ::selection{background:${T.gray[200]}}
        input:focus,select:focus,textarea:focus{border-color:${T.black}!important;outline:none}
      `}</style>
    </div>
  );
}

// ── SECTION: Export ──────────────────────────────────────────────────────────

export default function App() {
  return <AppProvider><DiaperDriveApp/></AppProvider>;
}
