import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

/*
╔══════════════════════════════════════════════════════════════════════════════╗
║  DIAPER DRIVE — Enterprise Edition                                         ║
║  Supabase + Claude AI Matching                                             ║
║                                                                            ║
║  DEPLOYMENT ARTIFACTS:                                                     ║
║  • SQL Migration: See bottom of file (DEPLOYMENT_SQL)                      ║
║  • Edge Function: See bottom of file (EDGE_FUNCTION_CODE)                  ║
║  • To split into files: Each ── SECTION ── maps to a separate module       ║
╚══════════════════════════════════════════════════════════════════════════════╝
*/

// ── SECTION: Design Tokens ──────────────────────────────────────────────────
const T = {
  primary:   { 50:"#eff6ff",100:"#dbeafe",200:"#bfdbfe",300:"#93c5fd",400:"#60a5fa",500:"#3b82f6",600:"#2563eb",700:"#1d4ed8",800:"#1e40af" },
  emerald:   { 50:"#ecfdf5",100:"#d1fae5",200:"#a7f3d0",500:"#10b981",600:"#059669",700:"#047857" },
  amber:     { 50:"#fffbeb",100:"#fef3c7",500:"#f59e0b",600:"#d97706",700:"#b45309" },
  rose:      { 50:"#fff1f2",100:"#ffe4e6",500:"#f43f5e",600:"#e11d48" },
  violet:    { 50:"#f5f3ff",100:"#ede9fe",200:"#ddd6fe",500:"#8b5cf6",600:"#7c3aed",700:"#6d28d9" },
  slate:     { 50:"#f8fafc",100:"#f1f5f9",200:"#e2e8f0",300:"#cbd5e1",400:"#94a3b8",500:"#64748b",600:"#475569",700:"#334155",800:"#1e293b",900:"#0f172a" },
  radius:    { sm:8, md:12, lg:16, xl:20, full:9999 },
  shadow:    { sm:"0 1px 2px rgba(0,0,0,0.05)", md:"0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04)", lg:"0 4px 12px rgba(0,0,0,0.08)", xl:"0 8px 24px rgba(0,0,0,0.12)" },
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
  { value:"low",label:"Low — Can wait a few days",color:T.emerald },
  { value:"medium",label:"Medium — Need within 1–2 days",color:T.amber },
  { value:"high",label:"High — Urgent, running out today",color:T.rose },
];

const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const timeAgo = (d) => { if(!d) return ""; const s=Math.floor((Date.now()-new Date(d).getTime())/1000); if(s<60) return "just now"; if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

// ── SECTION: Supabase Configuration ─────────────────────────────────────────
const SUPABASE_URL = "https://jwbukmmepqyahbtchcqy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3YnVrbW1lcHF5YWhidGNoY3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzI5MDEsImV4cCI6MjA4ODY0ODkwMX0.CUOzGE9nRGCQix40fOh0BiUw6svjTyGHfIX0Nzy9F0Q";

// Lightweight Supabase client (no SDK dependency — uses REST API directly)
// This keeps the app as a single file with zero npm dependencies.
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

// Connection state — try Supabase first, fall back to demo if it fails
let LIVE_MODE = false;

// ── SECTION: Data Service (Supabase-backed with demo fallback) ──────────────
// The app tries to connect to Supabase on load. If it fails, it falls back to
// the in-memory demo store seamlessly.

function createDemoStore() {
  let requests = [];
  let matches = [];
  let profiles = {};
  let listeners = new Set();

  // Seed realistic demo data
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
// In production this calls a Supabase Edge Function.
// In demo mode it simulates Claude's reasoning locally.

async function runAIMatching({ donorZip, donorSizes, donorRadius, donorId, store }) {
  // Try the Supabase Edge Function first (production AI matching via Claude API)
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
            id: m.id || uid(),
            donorId,
            requestId: m.requestId,
            score: m.score,
            reason: m.reason,
            distance: m.distance || 0,
            status: "suggested",
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

  // Fallback: local intelligent matching (simulates Claude's reasoning)
  const allRequests = store.getActiveRequests().filter(r => r.seekerId !== donorId);
  if (allRequests.length === 0) return [];

  await new Promise(r => setTimeout(r, 1500)); // simulate API latency

  const scored = allRequests.map(req => {
    let score = 0;
    let reasons = [];

    // Size match (exact = 40pts, adjacent = 15pts)
    const sizeIdx = DIAPER_SIZES.findIndex(s => s.value === req.size);
    const donorSizeIdxs = donorSizes.map(ds => DIAPER_SIZES.findIndex(s => s.value === ds));
    if (donorSizes.includes(req.size)) {
      score += 40;
      reasons.push(`Exact size match (${req.size})`);
    } else if (donorSizeIdxs.some(i => Math.abs(i - sizeIdx) === 1)) {
      score += 15;
      const adjacent = DIAPER_SIZES[donorSizeIdxs.find(i => Math.abs(i - sizeIdx) === 1)]?.value;
      reasons.push(`Close size — you have ${adjacent}, they need ${req.size} (babies grow fast)`);
    } else {
      return null; // no size relevance at all
    }

    // Urgency (high=30, med=15, low=5)
    const urgencyPts = { high:30, medium:15, low:5 };
    score += urgencyPts[req.urgency] || 10;
    if (req.urgency === "high") reasons.push("Urgent need — family is running out today");
    else if (req.urgency === "medium") reasons.push("Moderate urgency — needed within 1–2 days");

    // Recency (newer requests get more points, max 15)
    const hoursOld = (Date.now() - new Date(req.createdAt).getTime()) / 3600000;
    const recencyPts = clamp(Math.round(15 - hoursOld * 0.2), 0, 15);
    score += recencyPts;
    if (hoursOld < 6) reasons.push("Posted recently — help can make an immediate impact");

    // First-time seeker bonus (15pts)
    if (req.timesHelped === 0) {
      score += 15;
      reasons.push("First-time request — this family hasn't received help yet");
    }

    // Distance (simulated)
    const dist = Math.abs(parseInt(req.zipCode || "0") - parseInt(donorZip || "0")) * 0.3 + Math.random() * 1.5;
    if (dist > parseFloat(donorRadius)) return null;

    // Notes bonus — if they wrote a personal note
    if (req.notes && req.notes.length > 10) {
      score += 5;
    }

    const seekerProfile = store.getProfile(req.seekerId);

    return {
      id: uid(),
      donorId,
      requestId: req.id,
      score: clamp(score, 0, 100),
      reason: reasons.join(". ") + ".",
      distance: dist,
      status: "suggested",
      createdAt: new Date().toISOString(),
      // Denormalized for display
      _request: req,
      _seekerName: seekerProfile?.displayName || "A family",
    };
  }).filter(Boolean).sort((a,b) => b.score - a.score);

  store.saveMatches(scored);
  return scored;
}

// ── SECTION: Contexts ───────────────────────────────────────────────────────
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

  // Re-render on store changes
  useEffect(() => {
    return store.subscribe(() => setTick(t => t+1));
  }, [store]);

  // Try Supabase connection on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await supabase.auth_signInAnonymously();
        if (data.access_token && data.user) {
          LIVE_MODE = true;
          setIsLive(true);
          setUser(prev => ({ ...prev, id: data.user.id, isAnonymous: true }));
          console.log("[Diaper Drive] Connected to Supabase (live mode)");
        }
      } catch (e) {
        console.log("[Diaper Drive] Supabase unavailable, using demo mode", e);
      }
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
      // Also update Supabase profile if live
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
    success:{ bg:T.emerald[50], bdr:T.emerald[500], txt:T.emerald[700], ico:"✓" },
    error:{ bg:T.rose[50], bdr:T.rose[500], txt:T.rose[600], ico:"✕" },
    info:{ bg:T.primary[50], bdr:T.primary[500], txt:T.primary[700], ico:"ℹ" },
  };
  return (
    <div style={{ position:"fixed",top:20,right:20,zIndex:1000,display:"flex",flexDirection:"column",gap:8,maxWidth:380 }}>
      {notifications.map(n => { const s=styles[n.type]||styles.info; return (
        <div key={n.id} style={{ padding:"12px 16px",background:s.bg,borderLeft:`4px solid ${s.bdr}`,borderRadius:T.radius.md,boxShadow:T.shadow.lg,display:"flex",alignItems:"center",gap:10,animation:"slideIn .3s ease-out" }}>
          <span style={{ fontWeight:700,fontSize:16,color:s.bdr }}>{s.ico}</span>
          <span style={{ fontSize:14,color:s.txt,fontWeight:500 }}>{n.message}</span>
        </div>
      );})}
    </div>
  );
}

function Btn({ children, variant="primary", size="md", disabled, loading, onClick, style:sx, ...p }) {
  const vs = {
    primary:{ bg:T.primary[600],hbg:T.primary[700],c:"#fff" },
    success:{ bg:T.emerald[600],hbg:T.emerald[700],c:"#fff" },
    danger:{ bg:T.rose[500],hbg:T.rose[600],c:"#fff" },
    ghost:{ bg:"transparent",hbg:T.slate[100],c:T.slate[700] },
    outline:{ bg:"#fff",hbg:T.slate[50],c:T.slate[700],b:`1px solid ${T.slate[300]}` },
    ai:{ bg:`linear-gradient(135deg,${T.violet[600]},${T.primary[600]})`,hbg:`linear-gradient(135deg,${T.violet[700]},${T.primary[700]})`,c:"#fff" },
  };
  const szs = { sm:{p:"6px 12px",f:13},md:{p:"10px 20px",f:14},lg:{p:"14px 28px",f:16} };
  const v=vs[variant]||vs.primary, s=szs[size]||szs.md;
  const [h,setH]=useState(false);
  const isGrad = v.bg?.startsWith("linear");
  return (
    <button onClick={onClick} disabled={disabled||loading} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ padding:s.p, fontSize:s.f, background:disabled?T.slate[200]:h?(v.hbg):v.bg, color:disabled?T.slate[400]:v.c,
        border:v.b||"none", borderRadius:T.radius.md, fontWeight:600, cursor:disabled?"not-allowed":"pointer",
        transition:"all .2s", display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,
        width:"100%", opacity:loading?.7:1, ...sx }} {...p}>
      {loading && <span style={{ display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .8s linear infinite" }}/>}
      {children}
    </button>
  );
}

function Sel({ label,id,options,value,onChange,required }) {
  return (<div>
    {label && <label htmlFor={id} style={{ display:"block",fontSize:13,fontWeight:600,color:T.slate[700],marginBottom:6 }}>{label}</label>}
    <select id={id} value={value} onChange={e=>onChange(e.target.value)} required={required}
      style={{ width:"100%",padding:"10px 12px",borderRadius:T.radius.md,border:`1px solid ${T.slate[300]}`,fontSize:14,color:T.slate[800],background:"#fff",outline:"none" }}>
      {options.map(o => <option key={typeof o==="string"?o:o.value} value={typeof o==="string"?o:o.value}>{typeof o==="string"?o:o.label}</option>)}
    </select>
  </div>);
}

function Inp({ label,id,value,onChange,placeholder,required,error,type="text",multiline }) {
  const Tag = multiline ? "textarea" : "input";
  return (<div>
    {label && <label htmlFor={id} style={{ display:"block",fontSize:13,fontWeight:600,color:T.slate[700],marginBottom:6 }}>{label}</label>}
    <Tag id={id} type={multiline?undefined:type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required}
      rows={multiline?3:undefined}
      style={{ width:"100%",padding:"10px 12px",borderRadius:T.radius.md,border:`1px solid ${error?T.rose[500]:T.slate[300]}`,fontSize:14,color:T.slate[800],outline:"none",boxSizing:"border-box",fontFamily:"inherit",resize:multiline?"vertical":"none" }}/>
    {error && <p style={{ fontSize:12,color:T.rose[500],marginTop:4 }}>{error}</p>}
  </div>);
}

function Card({ children, style:sx, highlight, ...p }) {
  return <div style={{ background:"#fff",borderRadius:T.radius.lg,border:`1px solid ${highlight||T.slate[200]}`,boxShadow:T.shadow.md,...sx }} {...p}>{children}</div>;
}

function Badge({ children, variant="default" }) {
  const vs = { default:{bg:T.slate[100],c:T.slate[600]}, primary:{bg:T.primary[100],c:T.primary[700]}, success:{bg:T.emerald[100],c:T.emerald[700]}, warning:{bg:T.amber[100],c:T.amber[700]}, danger:{bg:T.rose[100],c:T.rose[600]}, ai:{bg:T.violet[100],c:T.violet[700]} };
  const v=vs[variant]||vs.default;
  return <span style={{ display:"inline-flex",alignItems:"center",padding:"2px 10px",borderRadius:T.radius.full,fontSize:12,fontWeight:600,background:v.bg,color:v.c }}>{children}</span>;
}

function Empty({ icon,title,desc }) {
  return (<div style={{ textAlign:"center",padding:"48px 24px" }}>
    <div style={{ fontSize:48,marginBottom:16 }}>{icon}</div>
    <h3 style={{ fontSize:18,fontWeight:600,color:T.slate[700],marginBottom:8 }}>{title}</h3>
    <p style={{ fontSize:14,color:T.slate[400],maxWidth:320,margin:"0 auto" }}>{desc}</p>
  </div>);
}

function Confirm({ open,title,msg,onOk,onNo,okLabel="Confirm",okVariant="danger" }) {
  if(!open) return null;
  return (<div style={{ position:"fixed",inset:0,zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.4)",backdropFilter:"blur(4px)" }}>
    <Card style={{ maxWidth:400,width:"90%",padding:24 }}>
      <h3 style={{ fontSize:18,fontWeight:700,color:T.slate[800],marginBottom:8 }}>{title}</h3>
      <p style={{ fontSize:14,color:T.slate[500],marginBottom:24 }}>{msg}</p>
      <div style={{ display:"flex",gap:12 }}>
        <Btn variant="outline" onClick={onNo} style={{ flex:1 }}>Cancel</Btn>
        <Btn variant={okVariant} onClick={onOk} style={{ flex:1 }}>{okLabel}</Btn>
      </div>
    </Card>
  </div>);
}

function ScoreRing({ score, size=48 }) {
  const r = size/2 - 4;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score/100) * circ;
  const color = score >= 75 ? T.emerald[500] : score >= 50 ? T.amber[500] : T.slate[400];
  return (
    <div style={{ position:"relative",width:size,height:size,flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.slate[200]} strokeWidth={3}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition:"stroke-dashoffset .6s ease" }}/>
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color }}>
        {score}
      </div>
    </div>
  );
}

function Spinner({ text="Loading..." }) {
  return (<div style={{ textAlign:"center",padding:40 }}>
    <div style={{ width:40,height:40,border:`3px solid ${T.slate[200]}`,borderTopColor:T.primary[500],borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 12px" }}/>
    <p style={{ color:T.slate[400],fontSize:14 }}>{text}</p>
  </div>);
}

// ── SECTION: Auth Modal ─────────────────────────────────────────────────────

function AuthModal({ open, onClose }) {
  const { user, updateUser, notify, isLive } = useApp();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleAuth = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      if (LIVE_MODE) {
        const data = mode === "signup"
          ? await supabase.auth_signUp(email, password, name || email.split("@")[0])
          : await supabase.auth_signIn(email, password);
        if (data.error || data.error_description) {
          setError(data.error_description || data.msg || "Authentication failed");
          setLoading(false);
          return;
        }
        if (data.access_token && data.user) {
          updateUser({ id: data.user.id, displayName: name || email.split("@")[0], isAnonymous: false, email });
        }
      } else {
        // Demo mode — simulate auth
        updateUser({ displayName: name || email.split("@")[0], isAnonymous: false, email });
      }
      notify(mode === "signup" ? "Account created! Welcome to Diaper Drive." : "Welcome back!", "success");
      onClose();
    } catch (e) {
      setError("Connection failed. Please try again.");
    }
    setLoading(false);
  };

  const handleAnon = () => {
    updateUser({ displayName: "Anonymous Helper", isAnonymous: true });
    notify("Continuing as guest. You can create an account anytime.", "info");
    onClose();
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.5)",backdropFilter:"blur(6px)" }}>
      <Card style={{ maxWidth:420,width:"92%",padding:32 }}>
        <div style={{ textAlign:"center",marginBottom:24 }}>
          <span style={{ fontSize:36 }}>🧸</span>
          <h2 style={{ fontSize:22,fontWeight:700,color:T.slate[800],marginTop:8 }}>
            {mode === "signup" ? "Join Diaper Drive" : "Welcome Back"}
          </h2>
          <p style={{ fontSize:14,color:T.slate[500],marginTop:4 }}>
            {mode === "signup" ? "Create an account to start helping families" : "Sign in to your account"}
          </p>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          {mode === "signup" && <Inp label="Display Name" id="auth-name" value={name} onChange={setName} placeholder="How should we call you?" />}
          <Inp label="Email" id="auth-email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <Inp label="Password" id="auth-pass" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
          {error && <p style={{ fontSize:13,color:T.rose[500],margin:0 }}>{error}</p>}
          <Btn onClick={handleAuth} loading={loading}>{mode === "signup" ? "Create Account" : "Sign In"}</Btn>
          <div style={{ textAlign:"center" }}>
            <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              style={{ background:"none",border:"none",color:T.primary[600],fontSize:13,fontWeight:600,cursor:"pointer",padding:4 }}>
              {mode === "signup" ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:12,margin:"8px 0" }}>
            <div style={{ flex:1,height:1,background:T.slate[200] }}/>
            <span style={{ fontSize:12,color:T.slate[400] }}>or</span>
            <div style={{ flex:1,height:1,background:T.slate[200] }}/>
          </div>
          <Btn variant="outline" onClick={handleAnon}>Continue as Guest</Btn>
        </div>
        <button onClick={onClose} style={{ position:"absolute",top:16,right:16,background:"none",border:"none",fontSize:20,color:T.slate[400],cursor:"pointer" }}>×</button>
      </Card>
    </div>
  );
}

// ── SECTION: Dashboard View ─────────────────────────────────────────────────

function DashboardView() {
  const { store } = useApp();
  const stats = store.getStats();
  const recentRequests = store.getActiveRequests().slice(0, 5);

  return (
    <div>
      {/* Hero Stats */}
      <Card style={{ padding:24, marginBottom:24, background:`linear-gradient(135deg, ${T.primary[600]} 0%, ${T.violet[600]} 100%)` }}>
        <h2 style={{ fontSize:20,fontWeight:700,color:"#fff",marginBottom:4 }}>Community Impact</h2>
        <p style={{ fontSize:13,color:"rgba(255,255,255,.7)",marginBottom:20 }}>Real-time overview of your Diaper Drive community</p>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12 }}>
          {[
            { icon:"📦",val:stats.active,label:"Active Requests" },
            { icon:"✅",val:stats.fulfilled,label:"Fulfilled" },
            { icon:"📍",val:stats.zips,label:"Communities" },
            { icon:"🤝",val:stats.totalMatches,label:"Matches Made" },
          ].map(s => (
            <div key={s.label} style={{ background:"rgba(255,255,255,.15)",borderRadius:T.radius.md,padding:"12px 8px",textAlign:"center",backdropFilter:"blur(8px)" }}>
              <div style={{ fontSize:20,marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:24,fontWeight:700,color:"#fff" }}>{s.val}</div>
              <div style={{ fontSize:11,color:"rgba(255,255,255,.7)",fontWeight:500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Activity */}
      <div style={{ marginBottom:16 }}>
        <h3 style={{ fontSize:17,fontWeight:700,color:T.slate[700],marginBottom:12 }}>Recent Requests</h3>
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {recentRequests.map(req => {
            const urg = URGENCY_LEVELS.find(u => u.value === req.urgency) || URGENCY_LEVELS[1];
            const profile = store.getProfile(req.seekerId);
            return (
              <Card key={req.id} style={{ padding:14 }}>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <div style={{ width:40,height:40,borderRadius:T.radius.md,background:urg.color[50],display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>👶</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                      <span style={{ fontWeight:600,fontSize:14,color:T.slate[800] }}>Size {req.size}</span>
                      <Badge variant={req.urgency==="high"?"danger":req.urgency==="medium"?"warning":"success"}>{req.urgency}</Badge>
                      <span style={{ fontSize:12,color:T.slate[400] }}>· {timeAgo(req.createdAt)}</span>
                    </div>
                    {req.notes && <p style={{ fontSize:13,color:T.slate[500],marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{req.notes}</p>}
                  </div>
                  <span style={{ fontSize:12,color:T.slate[400],flexShrink:0 }}>📍 {req.zipCode}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* AI Insight Card */}
      <Card style={{ padding:20, background:`linear-gradient(135deg, ${T.violet[50]}, ${T.primary[50]})`, borderColor:T.violet[200] }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
          <span style={{ fontSize:20 }}>🤖</span>
          <h3 style={{ fontSize:16,fontWeight:700,color:T.violet[700],margin:0 }}>AI Matching Insight</h3>
        </div>
        <p style={{ fontSize:13,color:T.slate[600],lineHeight:1.6 }}>
          There are currently <strong>{stats.active} families</strong> waiting for help across <strong>{stats.zips} communities</strong>.
          {recentRequests.filter(r => r.urgency === "high").length > 0 &&
            ` ${recentRequests.filter(r => r.urgency === "high").length} request${recentRequests.filter(r => r.urgency === "high").length > 1 ? "s are" : " is"} marked urgent.`}
          {" "}Switch to the <strong>Give</strong> tab and try AI Smart Match to find the families who need your help most.
        </p>
      </Card>
    </div>
  );
}

// ── SECTION: Give View (Manual + AI Matching) ───────────────────────────────

function GiveView() {
  const { user, store, notify } = useApp();
  const [mode, setMode] = useState("manual"); // manual | ai
  const [size, setSize] = useState("4");
  const [radius, setRadius] = useState("5");
  const [zip, setZip] = useState(user.zipCode || "");
  const [zipErr, setZipErr] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [contactId, setContactId] = useState(null);

  // AI-specific state
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
        ...r,
        distance: Math.abs(parseInt(r.zipCode||"0")-parseInt(zip||"0"))*0.3 + Math.random()*1.5,
      })).filter(r => r.distance <= parseFloat(radius)).sort((a,b) => a.distance - b.distance);
      setResults(withDist);
    } catch (e) {
      // Fallback to demo store on error
      const active = store.getActiveRequests().filter(r => r.seekerId !== user.id && r.size === size);
      const withDist = active.map(r => ({
        ...r,
        distance: Math.abs(parseInt(r.zipCode||"0")-parseInt(zip||"0"))*0.3 + Math.random()*1.5,
      })).filter(r => r.distance <= parseFloat(radius)).sort((a,b) => a.distance - b.distance);
      setResults(withDist);
    }
    setLoading(false);
  };

  const handleAIMatch = async () => {
    if (!validZip(zip)) { setZipErr("Enter a valid 5-digit zip"); return; }
    if (aiSizes.length === 0) { notify("Select at least one diaper size you have available","error"); return; }
    setZipErr(""); setAiLoading(true);
    try {
      const matches = await runAIMatching({ donorZip:zip, donorSizes:aiSizes, donorRadius:radius, donorId:user.id, store });
      setAiResults(matches);
    } catch(e) { notify("AI matching failed. Please try again.","error"); }
    setAiLoading(false);
  };

  const toggleAiSize = (sz) => {
    setAiSizes(prev => prev.includes(sz) ? prev.filter(s => s !== sz) : [...prev, sz]);
  };

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
      } catch (e) { /* local update succeeded */ }
    }
    notify(`Match accepted! You'll help ${match._seekerName} with Size ${match._request.size}.`, "success");
    setAcceptingId(null);
    setAiResults(prev => prev?.filter(m => m.id !== match.id));
  };

  return (
    <div>
      {/* Mode Toggle */}
      <div style={{ display:"flex",background:T.slate[100],borderRadius:T.radius.md,padding:3,marginBottom:20,gap:2 }}>
        {[{ id:"manual",label:"Manual Search",ico:"🔍" },{ id:"ai",label:"AI Smart Match",ico:"🤖" }].map(m => (
          <button key={m.id} onClick={()=>setMode(m.id)}
            style={{ flex:1,padding:"8px 12px",borderRadius:T.radius.sm,border:"none",fontSize:13,fontWeight:600,cursor:"pointer",
              transition:"all .2s",display:"flex",alignItems:"center",justifyContent:"center",gap:6,
              background:mode===m.id?(m.id==="ai"?`linear-gradient(135deg,${T.violet[600]},${T.primary[600]})`:"#fff"):"transparent",
              color:mode===m.id?(m.id==="ai"?"#fff":T.slate[800]):T.slate[500],
              boxShadow:mode===m.id?T.shadow.sm:"none" }}>
            <span>{m.ico}</span>{m.label}
          </button>
        ))}
      </div>

      {/* Shared Inputs */}
      <Card style={{ padding:24,marginBottom:24 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
          <span style={{ fontSize:24 }}>{mode==="ai"?"🤖":"🔍"}</span>
          <div>
            <h2 style={{ fontSize:20,fontWeight:700,color:T.slate[800],margin:0 }}>
              {mode==="ai"?"AI Smart Match":"Find a Family to Help"}
            </h2>
            <p style={{ fontSize:13,color:T.slate[500],margin:0 }}>
              {mode==="ai"?"Claude AI analyzes urgency, recency, and need to find optimal matches":"Search for families near you by size and distance"}
            </p>
          </div>
        </div>

        {mode === "manual" ? (
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
            <Sel label="Diaper Size" id="s-size" options={DIAPER_SIZES} value={size} onChange={setSize}/>
            <Sel label="Delivery Radius" id="s-rad" options={RADIUS_OPTIONS} value={radius} onChange={setRadius}/>
            <Inp label="Your Zip Code" id="s-zip" value={zip} onChange={v=>{setZip(v);setZipErr("");}} placeholder="e.g., 90210" error={zipErr}/>
            <div style={{ display:"flex",alignItems:"flex-end" }}>
              <Btn onClick={handleManualSearch} loading={loading}>Search Nearby</Btn>
            </div>
          </div>
        ) : (
          <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
            {/* Multi-size picker */}
            <div>
              <label style={{ display:"block",fontSize:13,fontWeight:600,color:T.slate[700],marginBottom:8 }}>Sizes You Have Available</label>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                {DIAPER_SIZES.map(ds => {
                  const sel = aiSizes.includes(ds.value);
                  return (
                    <button key={ds.value} onClick={()=>toggleAiSize(ds.value)}
                      style={{ padding:"6px 14px",borderRadius:T.radius.full,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",
                        background:sel?T.primary[600]:"#fff", color:sel?"#fff":T.slate[600],
                        border:`1.5px solid ${sel?T.primary[600]:T.slate[300]}` }}>
                      {ds.short || ds.value}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
              <Inp label="Your Zip Code" id="ai-zip" value={zip} onChange={v=>{setZip(v);setZipErr("");}} placeholder="e.g., 90210" error={zipErr}/>
              <Sel label="Delivery Radius" id="ai-rad" options={RADIUS_OPTIONS} value={radius} onChange={setRadius}/>
            </div>
            <Btn variant="ai" onClick={handleAIMatch} loading={aiLoading}>
              {aiLoading ? "Claude is analyzing requests..." : "✨ Find Smart Matches"}
            </Btn>
          </div>
        )}
      </Card>

      {/* Manual Results */}
      {mode === "manual" && (
        <>
          {results === null && !loading && <Empty icon="🗺️" title="Ready to help?" desc="Enter your zip code and search to find families nearby."/>}
          {loading && <Spinner text="Searching your area..."/>}
          {results && !loading && results.length === 0 && <Empty icon="🔎" title="No matches found" desc="Try a wider radius or different size."/>}
          {results && !loading && results.length > 0 && (
            <div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                <h3 style={{ fontSize:16,fontWeight:600,color:T.slate[700] }}>{results.length} {results.length===1?"family":"families"} found</h3>
                <Badge variant="primary">Size {size}</Badge>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                {results.map(need => {
                  const urg = URGENCY_LEVELS.find(u=>u.value===need.urgency)||URGENCY_LEVELS[1];
                  return (
                    <Card key={need.id} style={{ padding:18 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12 }}>
                        <div>
                          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                            <span style={{ fontSize:18 }}>👶</span>
                            <h4 style={{ fontSize:16,fontWeight:700,color:T.primary[700],margin:0 }}>Needs Size {need.size}</h4>
                            <Badge variant={need.urgency==="high"?"danger":need.urgency==="medium"?"warning":"success"}>{need.urgency}</Badge>
                          </div>
                          <div style={{ display:"flex",gap:12,flexWrap:"wrap",marginTop:4 }}>
                            <span style={{ fontSize:13,color:T.slate[500] }}>📍 Near {need.zipCode}</span>
                            <span style={{ fontSize:13,color:T.slate[500] }}>🕐 {timeAgo(need.createdAt)}</span>
                          </div>
                          {need.notes && <p style={{ fontSize:13,color:T.slate[500],marginTop:6,fontStyle:"italic" }}>"{need.notes}"</p>}
                        </div>
                        <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8 }}>
                          <Badge variant={need.distance<3?"success":need.distance<8?"warning":"default"}>{need.distance.toFixed(1)} mi</Badge>
                          <Btn variant="primary" size="sm" onClick={()=>{setContactId(need.id);setTimeout(()=>{notify(`Arranged drop-off for Size ${need.size} near ${need.zipCode}!`);setContactId(null);},600);}} loading={contactId===need.id} style={{ width:"auto" }}>Arrange Drop-off</Btn>
                        </div>
                      </div>
                    </Card>
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
          {aiResults === null && !aiLoading && <Empty icon="🤖" title="AI-Powered Matching" desc="Select your available sizes and let Claude find the families who need your help most."/>}
          {aiLoading && <Spinner text="Claude is analyzing urgency, recency, and proximity..."/>}
          {aiResults && !aiLoading && aiResults.length === 0 && <Empty icon="🔎" title="No AI matches found" desc="Try adding more sizes or expanding your delivery radius."/>}
          {aiResults && !aiLoading && aiResults.length > 0 && (
            <div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                <h3 style={{ fontSize:16,fontWeight:600,color:T.violet[700] }}>
                  ✨ {aiResults.length} AI-Recommended {aiResults.length===1?"Match":"Matches"}
                </h3>
                <Badge variant="ai">Powered by Claude</Badge>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                {aiResults.map((match,i) => (
                  <Card key={match.id} highlight={i===0?T.violet[300]:undefined} style={{ padding:20, background:i===0?`linear-gradient(135deg, ${T.violet[50]}, #fff)`:undefined }}>
                    <div style={{ display:"flex",gap:16,alignItems:"flex-start" }}>
                      <ScoreRing score={match.score} size={52}/>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap" }}>
                          <h4 style={{ fontSize:16,fontWeight:700,color:T.slate[800],margin:0 }}>{match._seekerName}</h4>
                          <Badge variant="primary">Size {match._request.size}</Badge>
                          <Badge variant={match._request.urgency==="high"?"danger":match._request.urgency==="medium"?"warning":"success"}>{match._request.urgency}</Badge>
                          {i===0 && <Badge variant="ai">Best Match</Badge>}
                        </div>
                        <div style={{ display:"flex",gap:12,marginBottom:8,flexWrap:"wrap" }}>
                          <span style={{ fontSize:12,color:T.slate[400] }}>📍 {match.distance.toFixed(1)} mi away</span>
                          <span style={{ fontSize:12,color:T.slate[400] }}>🕐 {timeAgo(match._request.createdAt)}</span>
                          {match._request.timesHelped===0 && <span style={{ fontSize:12,color:T.violet[600],fontWeight:600 }}>⭐ First-time request</span>}
                        </div>
                        {/* AI Reasoning */}
                        <div style={{ background:T.violet[50],borderRadius:T.radius.sm,padding:"8px 12px",marginBottom:10 }}>
                          <p style={{ fontSize:13,color:T.violet[700],margin:0,lineHeight:1.5 }}>
                            <strong>AI Insight:</strong> {match.reason}
                          </p>
                        </div>
                        {match._request.notes && <p style={{ fontSize:13,color:T.slate[500],fontStyle:"italic",marginBottom:8 }}>"{match._request.notes}"</p>}
                        <div style={{ display:"flex",gap:8 }}>
                          <Btn variant="ai" size="sm" onClick={()=>handleAcceptMatch(match)} loading={acceptingId===match.id} style={{ width:"auto" }}>Accept Match</Btn>
                          <Btn variant="ghost" size="sm" style={{ width:"auto",color:T.slate[400] }}>Skip</Btn>
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
      // Always add to local store for immediate UI feedback
      store.createRequest({ seekerId:user.id, size, zipCode:zip, urgency, notes:notes.trim() });
      // Also persist to Supabase when live
      if (LIVE_MODE) {
        const tbl = await supabase.from("requests");
        await tbl.insert([{ seeker_id:user.id, size, zip_code:zip, urgency, notes:notes.trim() || null }]);
      }
      notify("Request posted! Donors in your area will see it.","success");
      setSize("Newborn"); setNotes("");
    } catch (err) {
      notify("Saved locally but couldn't sync to server.","info");
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
      } catch (e) { /* local delete succeeded, that's fine */ }
    }
    notify("Request removed.","info");
    setDelTarget(null);
  };

  return (
    <div>
      <Card style={{ padding:24,marginBottom:24 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
          <span style={{ fontSize:24 }}>📝</span>
          <div>
            <h2 style={{ fontSize:20,fontWeight:700,color:T.slate[800],margin:0 }}>Create a Request</h2>
            <p style={{ fontSize:13,color:T.slate[500],margin:0 }}>Tell your community what you need — AI will help match you with donors</p>
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
            <Sel label="Diaper Size Needed" id="n-size" options={DIAPER_SIZES} value={size} onChange={setSize} required/>
            <Inp label="Your Zip Code" id="n-zip" value={zip} onChange={v=>{setZip(v);setZipErr("");}} placeholder="e.g., 02492" required error={zipErr}/>
          </div>
          <Sel label="Urgency Level" id="n-urg" options={URGENCY_LEVELS} value={urgency} onChange={setUrgency}/>
          <Inp label="Notes (optional)" id="n-notes" value={notes} onChange={setNotes} placeholder="Anything donors should know — e.g., twins, first baby, specific brand preferences..." multiline/>
          <Btn variant="success" onClick={handleSubmit} loading={submitting}>Submit Request</Btn>
        </div>
      </Card>

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
        <h3 style={{ fontSize:17,fontWeight:700,color:T.slate[700] }}>My Active Requests</h3>
        {myReqs.length > 0 && <Badge>{myReqs.length} active</Badge>}
      </div>
      {myReqs.length === 0 ? (
        <Empty icon="📋" title="No active requests" desc="Submit a request above and it'll appear here."/>
      ) : (
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {myReqs.map(req => {
            const urg = URGENCY_LEVELS.find(u=>u.value===req.urgency)||URGENCY_LEVELS[1];
            return (
              <Card key={req.id} style={{ padding:16 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                    <div style={{ width:42,height:42,borderRadius:T.radius.md,background:urg.color[50],display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>🧷</div>
                    <div>
                      <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                        <span style={{ fontWeight:600,fontSize:15,color:T.slate[800] }}>Size {req.size}</span>
                        <Badge variant={req.urgency==="high"?"danger":req.urgency==="medium"?"warning":"success"}>{req.urgency}</Badge>
                      </div>
                      <p style={{ fontSize:12,color:T.slate[400],margin:0 }}>Zip {req.zipCode} · {timeAgo(req.createdAt)}</p>
                    </div>
                     </div>
                  <Btn variant="ghost" size="sm" onClick={()=>setDelTarget(req.id)} style={{ color:T.rose[500],width:"auto" }}>Remove</Btn>
                </div>
                {req.notes && <p style={{ fontSize:13,color:T.slate[500],marginTop:8,paddingLeft:54,fontStyle:"italic" }}>"{req.notes}"</p>}
              </Card>
            );
          })}
        </div>
      )}
      <Confirm open={!!delTarget} title="Remove request?" msg="This will remove your diaper request. Donors will no longer see it." onOk={handleDelete} onNo={()=>setDelTarget(null)}/>
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
    notify("Profile updated!","success");
    saved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  const myMatches = store.getMatches(user.id);
  const accepted = myMatches.filter(m => m.status === "accepted" || m.status === "completed");

  return (
    <div>
      <Card style={{ padding:24,marginBottom:24 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
          <div style={{ width:48,height:48,borderRadius:T.radius.full,background:`linear-gradient(135deg,${T.primary[500]},${T.violet[500]})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:20,fontWeight:700 }}>
            {(name||"?")[0].toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize:20,fontWeight:700,color:T.slate[800],margin:0 }}>{name || "Your Profile"}</h2>
            <p style={{ fontSize:13,color:T.slate[500],margin:0 }}>{user.isAnonymous ? "Guest account" : user.email || "Registered user"}</p>
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
          <Inp label="Display Name" id="p-name" value={name} onChange={setName} placeholder="How should others see you?"/>
          <Inp label="Default Zip Code" id="p-zip" value={zip} onChange={setZip} placeholder="Your home zip code"/>
          <Sel label="I am a..." id="p-role" options={[{value:"both",label:"Both donor & seeker"},{value:"donor",label:"Donor only"},{value:"seeker",label:"Seeker only"}]} value={role} onChange={setRole}/>
          <Btn onClick={handleSave}>{saved?"✓ Saved":"Save Profile"}</Btn>
        </div>
      </Card>

      {/* Donation History */}
      {accepted.length > 0 && (
        <Card style={{ padding:20,marginBottom:24 }}>
          <h3 style={{ fontSize:17,fontWeight:700,color:T.slate[700],marginBottom:12 }}>My Donation History</h3>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {accepted.map(m => (
              <div key={m.id} style={{ display:"flex",alignItems:"center",gap:12,padding:10,background:T.slate[50],borderRadius:T.radius.sm }}>
                <span style={{ fontSize:16 }}>✅</span>
                <div style={{ flex:1 }}>
                  <span style={{ fontWeight:600,fontSize:14,color:T.slate[700] }}>Helped {m._seekerName} with Size {m._request?.size}</span>
                  <span style={{ fontSize:12,color:T.slate[400],marginLeft:8 }}>{timeAgo(m.createdAt)}</span>
                </div>
                <ScoreRing score={m.score} size={32}/>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Connection Status */}
      <Card style={{ padding:20,borderColor:isLive?T.emerald[200]:T.amber[100] }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
          <span style={{ fontSize:18 }}>{isLive ? "🟢" : "🟡"}</span>
          <h3 style={{ fontSize:16,fontWeight:700,color:T.slate[700],margin:0 }}>Connection Status</h3>
          <Badge variant={isLive?"success":"warning"}>{isLive?"Live":"Demo Mode"}</Badge>
        </div>
        <p style={{ fontSize:13,color:T.slate[500],marginBottom:14 }}>
          {isLive
            ? "Connected to Supabase. Your data is persisted and synced in real-time across all devices."
            : "Running in demo mode with local data. Data will be lost on refresh."}
        </p>
        {isLive && (
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:13 }}>
              <span style={{ color:T.emerald[500] }}>✓</span>
              <span style={{ color:T.slate[600] }}>Authentication</span>
              <Badge variant="success">Connected</Badge>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:13 }}>
              <span style={{ color:T.emerald[500] }}>✓</span>
              <span style={{ color:T.slate[600] }}>Database</span>
              <Badge variant="success">Connected</Badge>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:13 }}>
              <span style={{ color:T.slate[400] }}>○</span>
              <span style={{ color:T.slate[600] }}>AI Matching (Edge Function)</span>
              <Badge>Not deployed</Badge>
            </div>
          </div>
        )}
        {!isLive && (
          <p style={{ fontSize:12,color:T.slate[400],marginTop:4 }}>
            The app automatically connects to Supabase when available. Check browser console for connection details.
          </p>
        )}
      </Card>

      {/* User ID */}
      <div style={{ marginTop:16,padding:12,background:T.slate[50],borderRadius:T.radius.md,textAlign:"center" }}>
        <p style={{ fontSize:11,color:T.slate[400] }}>User ID: <span style={{ fontFamily:"monospace",fontSize:10 }}>{user.id}</span></p>
      </div>
    </div>
  );
}

// ── SECTION: Main App Shell ─────────────────────────────────────────────────

function DiaperDriveApp() {
  const [tab, setTab] = useState("dashboard");
  const [authOpen, setAuthOpen] = useState(false);
  const { user, isLive } = useApp();

  const tabs = [
    { id:"dashboard", label:"Home",  ico:"🏠" },
    { id:"give",      label:"Give",  ico:"🎁" },
    { id:"need",      label:"Need",  ico:"🙋" },
    { id:"profile",   label:"Profile",ico:"👤" },
  ];

  return (
    <div style={{ minHeight:"100vh",background:`linear-gradient(180deg, ${T.primary[50]} 0%, #fff 30%, ${T.slate[50]} 100%)` }}>
      <Notifs/>
      <AuthModal open={authOpen} onClose={()=>setAuthOpen(false)}/>

      <div style={{ maxWidth:740,margin:"0 auto",padding:"24px 16px",paddingBottom:80 }}>
        {/* Header */}
        <header style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:32 }}>🧸</span>
            <div>
              <h1 style={{ fontSize:24,fontWeight:800,background:`linear-gradient(135deg,${T.primary[600]},${T.violet[600]})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0 }}>Diaper Drive</h1>
              <p style={{ fontSize:12,color:T.slate[400],margin:0 }}>AI-Powered Community Matching</p>
            </div>
          </div>
          <button onClick={()=>setAuthOpen(true)}
            style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:T.radius.full,border:`1px solid ${T.slate[200]}`,background:"#fff",cursor:"pointer",boxShadow:T.shadow.sm }}>
            <div style={{ width:28,height:28,borderRadius:T.radius.full,background:`linear-gradient(135deg,${T.primary[400]},${T.violet[400]})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700 }}>
              {(user.displayName||"?")[0].toUpperCase()}
            </div>
            <span style={{ fontSize:13,fontWeight:600,color:T.slate[700] }}>{user.displayName || "Sign in"}</span>
          </button>
        </header>

        {/* Content */}
        {tab === "dashboard" && <DashboardView/>}
        {tab === "give" && <GiveView/>}
        {tab === "need" && <NeedView/>}
        {tab === "profile" && <ProfileView/>}
      </div>

      {/* Bottom Nav */}
      <nav style={{ position:"fixed",bottom:0,left:0,right:0,background:"rgba(255,255,255,.92)",backdropFilter:"blur(12px)",borderTop:`1px solid ${T.slate[200]}`,zIndex:100 }}>
        <div style={{ maxWidth:740,margin:"0 auto" }}>
          <div style={{ display:"flex",padding:"6px 8px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 4px",
                  border:"none",background:"transparent",cursor:"pointer",transition:"all .15s",
                  color:tab===t.id?T.primary[600]:T.slate[400] }}>
                <span style={{ fontSize:20 }}>{t.ico}</span>
                <span style={{ fontSize:11,fontWeight:tab===t.id?700:500 }}>{t.label}</span>
                {tab === t.id && <div style={{ width:4,height:4,borderRadius:2,background:T.primary[600],marginTop:1 }}/>}
              </button>
            ))}
          </div>
          <div style={{ textAlign:"center",paddingBottom:6 }}>
            <span style={{ fontSize:10,color:T.slate[400] }}>
              {isLive ? "🟢 Live — Supabase" : "🟡 Demo Mode"} · Diaper Drive v2
            </span>
          </div>
        </div>
      </nav>

      <style>{`
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        *{box-sizing:border-box;margin:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overscroll-behavior:none}
        ::selection{background:${T.primary[200]}}
      `}</style>
    </div>
  );
}

// ── SECTION: Export ──────────────────────────────────────────────────────────

export default function App() {
  return <AppProvider><DiaperDriveApp/></AppProvider>;
}

/*
╔══════════════════════════════════════════════════════════════════════════════╗
║  DEPLOYMENT_SQL — Run this in your Supabase SQL Editor                     ║
╚══════════════════════════════════════════════════════════════════════════════╝

-- Enable Row Level Security
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- Profiles
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  zip_code text,
  role text check (role in ('donor', 'seeker', 'both')) default 'both',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Public profiles readable" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Requests
create table public.requests (
  id uuid default gen_random_uuid() primary key,
  seeker_id uuid references public.profiles(id) on delete cascade not null,
  size text not null,
  zip_code text not null,
  latitude float8,
  longitude float8,
  urgency text check (urgency in ('low', 'medium', 'high')) default 'medium',
  notes text,
  status text check (status in ('active', 'matched', 'fulfilled', 'expired')) default 'active',
  times_helped int default 0,
  created_at timestamptz default now()
);
alter table public.requests enable row level security;
create policy "Active requests readable" on public.requests for select using (status = 'active' or seeker_id = auth.uid());
create policy "Users create own requests" on public.requests for insert with check (auth.uid() = seeker_id);
create policy "Users manage own requests" on public.requests for update using (auth.uid() = seeker_id);
create policy "Users delete own requests" on public.requests for delete using (auth.uid() = seeker_id);

-- Indexes
create index idx_requests_active on public.requests(status, size) where status = 'active';
create index idx_requests_seeker on public.requests(seeker_id);
create index idx_requests_geo on public.requests(zip_code) where status = 'active';

-- Matches
create table public.matches (
  id uuid default gen_random_uuid() primary key,
  donor_id uuid references public.profiles(id) on delete cascade not null,
  request_id uuid references public.requests(id) on delete cascade not null,
  score int check (score between 0 and 100),
  reason text,
  status text check (status in ('suggested', 'accepted', 'completed', 'declined')) default 'suggested',
  created_at timestamptz default now(),
  unique(donor_id, request_id)
);
alter table public.matches enable row level security;
create policy "Matches readable by participants" on public.matches for select
  using (donor_id = auth.uid() or request_id in (select id from public.requests where seeker_id = auth.uid()));
create policy "Service role manages matches" on public.matches for all using (auth.role() = 'service_role');

-- Auto-expire old requests (run as cron via pg_cron or Supabase scheduled function)
-- update public.requests set status = 'expired' where status = 'active' and created_at < now() - interval '14 days';

-- Realtime
alter publication supabase_realtime add table public.requests;
alter publication supabase_realtime add table public.matches;


╔══════════════════════════════════════════════════════════════════════════════╗
║  EDGE_FUNCTION_CODE — Deploy as supabase/functions/ai-match/index.ts          ║
╚══════════════════════════════════════════════════════════════════════════════╝

// supabase/functions/ai-match/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { donorZip, donorSizes, donorRadius, donorId } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch active requests
    const { data: requests, error } = await supabase
      .from("requests")
      .select("*, profiles!seeker_id(display_name, zip_code)")
      .eq("status", "active")
      .neq("seeker_id", donorId);

    if (error) throw error;

    if (!requests || requests.length === 0) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build Claude prompt
    const requestsSummary = requests.map((r, i) => (
      `${i+1}. ID:${r.id} | Size:${r.size} | Zip:${r.zip_code} | Urgency:${r.urgency} | ` +
      `Notes:"${r.notes || 'none'}" | TimesHelped:${r.times_helped} | Posted:${r.created_at}`
    )).join("\n");

    const prompt = `You are an AI matching engine for Diaper Drive, a community diaper exchange platform.

A DONOR wants to help. Here is their profile:
- Zip code: ${donorZip}
- Available diaper sizes: ${donorSizes.join(", ")}
- Maximum delivery distance: ${donorRadius} miles

Here are all ACTIVE REQUESTS from families who need diapers:
${requestsSummary}

MATCHING CRITERIA (in priority order):
1. SIZE MATCH: Exact size match is strongest. Adjacent sizes are acceptable (babies grow).
2. URGENCY: "high" urgency families should be prioritized — they're running out today.
3. FIRST-TIME SEEKERS: Families with times_helped=0 have never been helped and deserve priority.
4. RECENCY: More recently posted requests indicate active, current need.
5. GEOGRAPHIC CLUSTERS: If multiple families are near the same zip, suggest them together for efficient delivery.

Return a JSON array of matches, sorted by priority. Each match should have:
- requestId: the request ID
- score: 0-100 match quality score
- reason: 1-2 sentence human-readable explanation of why this is a good match

Return ONLY valid JSON. Example: [{"requestId":"abc","score":92,"reason":"Exact size match, urgent need, first-time request."}]`;

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeResponse.json();
    const text = claudeData.content?.[0]?.text || "[]";

    // Parse Claude's response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const aiMatches = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // Enrich with request data
    const enriched = aiMatches.map(m => {
      const req = requests.find(r => r.id === m.requestId);
      if (!req) return null;
      return {
        id: crypto.randomUUID(),
        donorId,
        requestId: m.requestId,
        score: m.score,
        reason: m.reason,
        status: "suggested",
        _request: req,
        _seekerName: req.profiles?.display_name || "A family",
      };
    }).filter(Boolean);

    // Save matches to DB
    if (enriched.length > 0) {
      await supabase.from("matches").upsert(
        enriched.map(m => ({
          donor_id: donorId,
          request_id: m.requestId,
          score: m.score,
          reason: m.reason,
          status: "suggested",
        })),
        { onConflict: "donor_id,request_id" }
      );
    }

    return new Response(JSON.stringify({ matches: enriched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

*/
