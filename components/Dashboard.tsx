'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Thermometer, Droplets, Wind, Activity, Radio, Newspaper, Users, Megaphone, HeartHandshake, MessageSquare, MapPin, Navigation, RefreshCw, Plus, X, Send, AlertTriangle, Globe, UserCircle, Lock, Mail, LogOut, LayoutDashboard, BarChart3, CheckCircle, Smartphone, CreditCard, Wallet, ChevronRight, Bell, Zap } from 'lucide-react'
import { format } from 'date-fns'
import { apiGet, apiPost, ApiError, type Page } from '@/lib/api-client'
import { useEventStream } from '@/lib/use-event-stream'
import { Logo } from '@/components/Logo'
import { PaymentIcon } from '@/components/PaymentIcons'
import { Globe as GlobeView } from '@/components/Globe'
import { ShareButtons } from '@/components/ShareButtons'
import { useCurrentPlace } from '@/lib/use-current-place'
import { CURRENCIES, BANKS, currency, methodsFor, formatMoney, toINR, methodName } from '@/lib/payments'

// ─── Types ───────────────────────────────────────────────────────────────────
interface User { id:number; email:string; name:string|null; role:string; isVerified?:boolean }
interface Sensor { id:number; type:string; location:string; lat:number|null; lon:number|null; status:string; data:{value:number;timestamp:string}[] }
interface SensorData { id:number; sensorId:number; value:number; timestamp:string; sensor:{type:string;location:string} }
/** Matches lib/news-feeds.ts. `url` is '' for stored fallback rows, which have no link. */
interface NewsItem { id:string; title:string; summary:string; url:string; source:string; author:string|null; publishedAt:string|null; category:string|null }
interface NewsResponse { articles:NewsItem[]; live:boolean; fetchedAt:string }
// Listings identify people by id and name only -- the API no longer returns
// other users' email addresses to unauthenticated callers.
interface Person { id:number; name:string|null }
interface Campaign { id:number; title:string; description:string; creator:Person; participants:Person[] }
interface Group { id:number; name:string; issue:string; creator:Person; members:Person[]; _count:{messages:number} }
interface GroupMessage { id:number; groupId?:number; content:string; createdAt:string; user:Person }
interface Fundraiser { id:number; cause:string; description:string; goal:number; raised:number; creator:Person }
type Tab = 'overview'|'sensors'|'analytics'|'alerts'|'news'|'campaigns'|'groups'|'fundraisers'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sIcon = (t:string) => { switch(t){case'temperature':return<Thermometer size={15}/>;case'humidity':return<Droplets size={15}/>;case'air_quality':return<Wind size={15}/>;default:return<Activity size={15}/>} }
const sUnit = (t:string) => ({temperature:'°C',humidity:'%',air_quality:'AQI'}[t]??'')
const sColor = (t:string) => ({temperature:'#FF5C7A',humidity:'#6C8CFF',air_quality:'#B47CFF'}[t]??'#E45FC4')
const sLabel = (t:string) => t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())

/*
 * Abbreviated labels, for the globe readout only — it sits in a narrow column
 * over the globe, where the full names wrap. Everywhere with room keeps sLabel.
 * Unlisted types fall back to the full name rather than being truncated blind.
 */
const SHORT: Record<string,string> = {
  temperature:'Temp', humidity:'Hum', air_quality:'AQI', uv_index:'UV',
  noise_level:'Noise', water_quality:'Water', soil_moisture:'Soil',
}
const sShort = (t:string) => SHORT[t] ?? sLabel(t)
const fmtLoc = (loc:string) => loc  // location is already a name like "City Center"
const rup = (n:number) => `₹${n.toLocaleString('en-IN')}`

const TTip = ({active,payload,label}:any) => {
  if(!active||!payload?.length) return null
  return <div style={{background:'var(--card)',border:'1px solid rgba(123,92,255,0.3)',borderRadius:10,padding:'9px 13px',fontSize:11.5}}>
    <p style={{color:'var(--tx3)',marginBottom:4}}>{label}</p>
    {payload.map((p:any,i:number)=><p key={i} style={{color:p.color}}>{p.name}: <b>{typeof p.value==='number'?p.value.toFixed(1):p.value}</b></p>)}
  </div>
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({msg,type,onClose}:{msg:string;type:'ok'|'err'|'info';onClose:()=>void}) {
  useEffect(()=>{const t=setTimeout(onClose,3500);return()=>clearTimeout(t)},[onClose])
  const col = type==='ok'?'#30D158':type==='err'?'#FF453A':'#7B5CFF'
  return <div className="toast"><span style={{color:col,fontSize:18}}>{type==='ok'?'✓':type==='err'?'✕':'ℹ'}</span><span style={{fontSize:13,flex:1}}>{msg}</span><button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)',padding:2}}><X size={14}/></button></div>
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({fundraiser,user,onClose,onSuccess}:{fundraiser:Fundraiser;user:User;onClose:()=>void;onSuccess:(amt:number,method:string)=>void}) {
  const [step,setStep]=useState<'amount'|'method'|'processing'|'done'>('amount')
  const [cur,setCur]=useState<string>('INR')
  const [amount,setAmount]=useState('')
  const [method,setMethod]=useState('')
  const [upiId,setUpiId]=useState('')
  const [bank,setBank]=useState('')
  const [card,setCard]=useState({num:'',exp:'',cvv:'',name:''})
  const [err,setErr]=useState('')

  const c=currency(cur)
  const available=methodsFor(cur)
  const quickAmts=cur==='INR'?[100,500,1000,2500,5000]:[5,10,25,50,100]
  const amt=parseFloat(amount||'0')
  const inr=toINR(amt,cur)

  // Switching currency can strip the chosen method (UPI cannot settle USD).
  useEffect(()=>{ if(method&&!available.some(m=>m.id===method)) setMethod('') },[cur])

  const chosen=available.find(m=>m.id===method)
  // Each rail has its own required detail, exactly as a real checkout gates it.
  const ready=!!chosen&&(
    chosen.kind==='netbanking' ? !!bank :
    chosen.kind==='card' ? card.num.replace(/\s/g,'').length>=15&&/^\d{2}\/\d{2}$/.test(card.exp)&&card.cvv.length>=3 :
    true)

  const pay = async () => {
    if(!amt||!chosen||!ready) return
    setErr(''); setStep('processing')
    // Simulated authorisation. A real integration hands off to the provider's
    // SDK here and confirms server-side against their webhook.
    await new Promise(r=>setTimeout(r,2200))
    try {
      // Card details are deliberately NOT sent: nothing here is PCI compliant,
      // and the server has no business seeing a PAN. Only the rail is recorded.
      // Amount is converted to INR because goals/totals are denominated in INR.
      await apiPost('/api/fundraisers/donate',{fundraiserId:fundraiser.id,amount:inr,method})
      setStep('done')
      setTimeout(()=>{ onSuccess(inr,method); onClose() },1800)
    } catch(e) {
      // The old code swallowed this and silently bounced back a step, which is
      // how a rejected method stayed invisible.
      setErr(e instanceof ApiError&&e.fields?Object.values(e.fields)[0]:e instanceof Error?e.message:'Payment failed')
      setStep('method')
    }
  }

  const fmtCard=(v:string)=>v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim()
  const fmtExp=(v:string)=>{const d=v.replace(/\D/g,'').slice(0,4);return d.length>2?`${d.slice(0,2)}/${d.slice(2)}`:d}

  return <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal" style={{maxWidth:460}}>
      {/* Header */}
      <div style={{padding:'18px 20px',borderBottom:'1px solid rgba(123,92,255,0.1)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <p style={{fontWeight:700,fontSize:15,fontFamily:'inherit'}}>{fundraiser.cause}</p>
          <p style={{fontSize:11.5,color:'var(--tx3)',marginTop:2}}>Secure payment · EarthPulse Foundation</p>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)',padding:4}}><X size={17}/></button>
      </div>

      <div style={{padding:'20px',overflowY:'auto',flex:1}}>
        {step==='amount' && <>
          <p className="lbl">Currency</p>
          <div style={{display:'flex',gap:6,marginBottom:16}}>
            {CURRENCIES.map(x=><button key={x.code} onClick={()=>{setCur(x.code);setAmount('')}}
              style={{flex:1,padding:'8px 0',borderRadius:9,cursor:'pointer',fontFamily:'inherit',fontSize:12.5,fontWeight:cur===x.code?590:450,transition:'all .15s',
              border:`1px solid ${cur===x.code?'rgba(255,255,255,0.16)':'rgba(255,255,255,0.07)'}`,
              background:cur===x.code?'linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))':'transparent',
              color:cur===x.code?'#FFFFFF':'var(--tx3)'}}>{x.symbol} {x.code}</button>)}
          </div>
          <p className="lbl">Select Amount</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:14}}>
            {quickAmts.map(a=><button key={a} onClick={()=>setAmount(String(a))} className="btn-pay btn-xs"
              style={{padding:'10px 4px',fontSize:12,borderRadius:10,textAlign:'center',cursor:'pointer',border:`1px solid ${amount===String(a)?'rgba(123,92,255,0.5)':'rgba(255,255,255,0.08)'}`,background:amount===String(a)?'rgba(123,92,255,0.12)':'rgba(255,255,255,0.035)',color:amount===String(a)?'#FFFFFF':'var(--tx2)',transition:'all .15s'}}>
              {c.symbol}{a}
            </button>)}
          </div>
          <p className="lbl">Or enter custom</p>
          <div style={{position:'relative',marginBottom:14}}>
            <span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'var(--tx3)'}}>{c.symbol}</span>
            <input className="inp" style={{paddingLeft:30}} type="number" placeholder="Enter amount" value={amount} onChange={e=>setAmount(e.target.value)} />
          </div>
          {cur!=='INR'&&amt>0&&<p style={{fontSize:11.5,color:'var(--tx3)',marginBottom:14,display:'flex',alignItems:'center',gap:5}}>
            <Globe size={11}/> Charged as ≈ ₹{inr.toLocaleString('en-IN')} · indicative rate
          </p>}
          <button className="btn btn-green" style={{width:'100%',padding:'12px'}} onClick={()=>amt>0&&setStep('method')}>
            Continue <ChevronRight size={15}/>
          </button>
        </>}

        {step==='method' && <>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <p className="lbl" style={{marginBottom:0}}>Choose Payment</p>
            <span className="val" style={{fontSize:17,fontWeight:600}}>{formatMoney(amt,cur)}</span>
          </div>

          {(['upi','wallet','gateway','card','netbanking'] as const).map(kind=>{
            const group=available.filter(m=>m.kind===kind)
            if(!group.length) return null
            const label={upi:'UPI Apps',wallet:'Wallets',gateway:'Payment Gateway',card:'Cards',netbanking:'Net Banking'}[kind]
            return <div key={kind} style={{marginBottom:14}}>
              <p style={{fontSize:11,color:'var(--tx3)',fontWeight:500,marginBottom:7}}>{label}</p>
              <div style={{display:'grid',gridTemplateColumns:group.length>2?'repeat(3,1fr)':'1fr',gap:8}}>
                {group.map(m=><button key={m.id} onClick={()=>{setMethod(m.id);setErr('')}} className={`btn-pay${method===m.id?' selected':''}`}
                  style={{flexDirection:group.length>2?'column':'row',justifyContent:group.length>2?'center':'flex-start',gap:group.length>2?7:10,padding:group.length>2?'12px 6px':'12px 14px'}}>
                  <PaymentIcon id={m.id} size={group.length>2?26:24}/>
                  <span style={{display:'flex',flexDirection:'column',alignItems:group.length>2?'center':'flex-start',gap:1}}>
                    <span style={{fontSize:11.5,color:'var(--tx1)',fontWeight:500}}>{m.name}</span>
                    {m.hint&&group.length<=2&&<span style={{fontSize:10.5,color:'var(--tx3)'}}>{m.hint}</span>}
                  </span>
                </button>)}
              </div>
            </div>
          })}

          {chosen?.kind==='upi'&&<>
            <p className="lbl">UPI ID / Mobile (optional)</p>
            <input className="inp" placeholder="yourname@upi or 9XXXXXXXXX" value={upiId} onChange={e=>setUpiId(e.target.value)} style={{marginBottom:14}}/>
          </>}

          {chosen?.kind==='netbanking'&&<>
            <p className="lbl">Select your bank</p>
            <select className="inp" value={bank} onChange={e=>setBank(e.target.value)} style={{marginBottom:14}}>
              <option value="">Choose a bank…</option>
              {BANKS.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
          </>}

          {chosen?.kind==='card'&&<div style={{marginBottom:14,display:'flex',flexDirection:'column',gap:9}}>
            <div>
              <p className="lbl">Card number</p>
              <input className="inp" inputMode="numeric" autoComplete="off" placeholder="1234 5678 9012 3456" value={card.num} onChange={e=>setCard({...card,num:fmtCard(e.target.value)})}/>
            </div>
            <div style={{display:'flex',gap:9}}>
              <div style={{flex:1}}>
                <p className="lbl">Expiry</p>
                <input className="inp" inputMode="numeric" autoComplete="off" placeholder="MM/YY" value={card.exp} onChange={e=>setCard({...card,exp:fmtExp(e.target.value)})}/>
              </div>
              <div style={{flex:1}}>
                <p className="lbl">CVV</p>
                <input className="inp" inputMode="numeric" autoComplete="off" type="password" placeholder="•••" maxLength={4} value={card.cvv} onChange={e=>setCard({...card,cvv:e.target.value.replace(/\D/g,'')})}/>
              </div>
            </div>
            <p style={{fontSize:10.5,color:'var(--tx3)',display:'flex',alignItems:'center',gap:5}}>
              <Lock size={10}/> Demo only — card details stay in your browser and are never sent.
            </p>
          </div>}

          {err&&<p style={{color:'#FF453A',fontSize:12,marginBottom:12}}>{err}</p>}

          <div style={{display:'flex',gap:10}}>
            <button className="btn btn-ghost" onClick={()=>setStep('amount')} style={{padding:'11px 16px'}}>Back</button>
            <button className="btn btn-green" style={{flex:1,padding:'12px'}} onClick={pay} disabled={!ready}>
              Pay {formatMoney(amt,cur)}
            </button>
          </div>
        </>}

        {step==='processing' && <div style={{textAlign:'center',padding:'32px 0'}}>
          <div style={{width:56,height:56,borderRadius:'50%',border:'2px solid rgba(123,92,255,0.2)',borderTopColor:'#7B5CFF',margin:'0 auto 18px',animation:'spin 0.9s linear infinite'}}/>
          <p style={{fontSize:15,fontWeight:600}}>Processing Payment</p>
          <p style={{fontSize:13,color:'var(--tx3)',marginTop:6}}>Please wait, do not close...</p>
        </div>}

        {step==='done' && <div style={{textAlign:'center',padding:'32px 0'}}>
          <div style={{width:60,height:60,borderRadius:'50%',background:'rgba(123,92,255,0.12)',border:'1px solid rgba(123,92,255,0.4)',margin:'0 auto 18px',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <CheckCircle size={28} color="#30D158"/>
          </div>
          <p style={{fontSize:16,fontWeight:700,color:'#30D158'}}>Payment Successful!</p>
          <p style={{fontSize:13,color:'var(--tx2)',marginTop:6}}>₹{parseFloat(amount).toLocaleString('en-IN')} donated via {methodName(method)}</p>
        </div>}
      </div>
    </div>
  </div>
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({onAuth}:{onAuth:(u:User,t:string,msg?:string)=>void}) {
  const [mode,setMode]=useState<'login'|'register'>('login')
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [name,setName]=useState('')
  const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [info,setInfo]=useState('')

  const submit = async () => {
    setError(''); setInfo(''); setLoading(true)
    try {
      const data = await apiPost<{user:User;token:string;message?:string}>(`/api/auth/${mode}`, mode==='login'?{email,password}:{email,password,name})
      if(mode==='register'&&data.message) setInfo(data.message)
      localStorage.setItem('token',data.token); localStorage.setItem('user',JSON.stringify(data.user))
      setTimeout(()=>onAuth(data.user,data.token,data.message),mode==='register'?1200:0)
    } catch(e){
      // Prefer the specific field reason ("Password must be at least 8
      // characters") over the generic "Validation failed".
      const fieldMsg = e instanceof ApiError && e.fields ? Object.values(e.fields)[0] : null
      setError(fieldMsg ?? (e instanceof Error ? e.message : 'Failed'))
    } finally{setLoading(false)}
  }

  return <div className="login-bg" style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:'var(--bg)'}}>
    <div className="noise"/><div className="glow-orb orb1"/><div className="glow-orb orb2"/>
    <div style={{width:'100%',maxWidth:400,position:'relative',zIndex:1,animation:'slideUp .45s ease'}}>
      {/* Brand */}
      <div style={{textAlign:'center',marginBottom:36}}>
        <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:62,height:62,borderRadius:18,background:'var(--brand-grad)',color:'#FFFFFF',boxShadow:'0 8px 28px rgba(58,32,121,0.5)',marginBottom:16}}>
          <Logo size={30}/>
        </div>
        <h1 className="brand-text" style={{fontSize:34,fontWeight:600,letterSpacing:"-0.03em"}}>EarthPulse</h1>
        <p style={{fontSize:15,color:'var(--tx2)',marginTop:6,letterSpacing:'-0.01em'}}>Smart Environment Monitoring System</p>
      </div>

      <div className="card glass-ring" style={{padding:'28px 32px',borderRadius:22}}>
        {/* Mode toggle */}
        {/* Sliding segmented control: one glass pill travels between the two
            options rather than each side switching its own background on and
            off. Fully rounded so it stops reading as a box. */}
        <div className="seg">
          <span className="seg-thumb" style={{transform:mode==='register'?'translateX(100%)':'translateX(0)'}} aria-hidden="true"/>
          {(['login','register'] as const).map(m=><button key={m} onClick={()=>{setMode(m);setError('');setInfo('')}} className={`seg-btn${mode===m?' on':''}`}>
            {m==='login'?'Sign In':'Register'}
          </button>)}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:13}}>
          {mode==='register'&&<div><label className="lbl">Name</label><div style={{position:'relative'}}><UserCircle size={14} style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',color:'var(--tx3)'}}/><input className="inp" style={{paddingLeft:36}} placeholder="Your name" value={name} onChange={e=>setName(e.target.value)}/></div></div>}
          <div><label className="lbl">Email</label><div style={{position:'relative'}}><Mail size={14} style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',color:'var(--tx3)'}}/><input className="inp" style={{paddingLeft:36}} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div></div>
          <div><label className="lbl">Password</label><div style={{position:'relative'}}><Lock size={14} style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',color:'var(--tx3)'}}/><input className="inp" style={{paddingLeft:36}} type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div></div>

          {error&&<div style={{background:'rgba(255,69,58,0.08)',border:'1px solid rgba(255,69,58,0.25)',borderRadius:9,padding:'9px 13px',display:'flex',gap:8,alignItems:'center'}}><AlertTriangle size={14} color="#FF453A"/><span style={{color:'#FF453A',fontSize:12.5}}>{error}</span></div>}
          {info&&<div style={{background:'rgba(123,92,255,0.08)',border:'1px solid rgba(123,92,255,0.25)',borderRadius:9,padding:'9px 13px',display:'flex',gap:8,alignItems:'center'}}><CheckCircle size={14} color="#7B5CFF"/><span style={{color:'#7B5CFF',fontSize:12.5}}>{info}</span></div>}

          <button className="btn btn-green" style={{padding:'11px',marginTop:4,width:'100%',fontSize:14}} onClick={submit} disabled={loading}>
            {loading?<span className="spin" style={{display:'inline-block',width:16,height:16,borderRadius:'50%',border:'2px solid rgba(123,92,255,0.3)',borderTopColor:'#7B5CFF'}}/>:mode==='login'?'Sign In':'Create Account'}
          </button>
        </div>

        <div className="hr"/>
        <p style={{textAlign:'center',fontSize:11.5,color:'var(--tx3)'}}>Demo: <span style={{color:'rgba(123,92,255,0.7)'}}>admin@example.com</span> / <span style={{color:'rgba(123,92,255,0.7)'}}>password</span></p>
      </div>
    </div>
  </div>
}

// ─── Overview ─────────────────────────────────────────────────────────────────
/**
 * Newest reading for a sensor.
 *
 * /api/sensors returns a series ordered oldest -> newest, so the newest is the
 * last element. This code read data[0], which was the newest back when the
 * endpoint returned a single row — after the endpoint started returning
 * history, data[0] silently became the OLDEST reading, and the tiles showed a
 * stale value that disagreed with the chart right beside them.
 */
const latestOf = (s:Sensor) => s.data.length?s.data[s.data.length-1]:undefined

/** Sentinel id for the viewer's own position, which has no sensor rows. */
const HERE_KEY='__here__'

type Place = { key:string; name:string; city:string; lat:number; lon:number; sensors:Sensor[] }

function Overview({sensors}:{sensors:Sensor[]}) {
  // Group by physical place: the globe plots locations, not sensor rows, and a
  // city usually carries more than one instrument.
  const places = useMemo(()=>{
    const m = new Map<string,Place>()
    for(const s of sensors){
      if(s.lat==null||s.lon==null) continue
      const cur = m.get(s.location)
      if(!cur) m.set(s.location,{key:s.location,name:s.location.split(',')[0].trim(),city:(s.location.split(',')[1]||'').trim(),lat:s.lat,lon:s.lon,sensors:[s]})
      // One reading per instrument type; keep the freshest.
      else {
        const same = cur.sensors.find(x=>x.type===s.type)
        if(!same) cur.sensors.push(s)
        else if(new Date(latestOf(s)?.timestamp||0)>new Date(latestOf(same)?.timestamp||0)) cur.sensors[cur.sensors.indexOf(same)]=s
      }
    }
    // Freshest place first, so the globe opens on live data rather than on
    // whichever row the database happened to return first.
    const freshest=(p:Place)=>Math.max(...p.sensors.map(s=>new Date(latestOf(s)?.timestamp||0).getTime()))
    return [...m.values()].sort((a,b)=>freshest(b)-freshest(a))
  },[sensors])

  // The viewer's own position, from the same geolocation + Open-Meteo path the
  // Sensors tab uses. Resolves to null if permission is refused, in which case
  // the globe simply falls back to the sensor network.
  const {place:here,loading:hereLoading}=useCurrentPlace()

  const allPlaces = useMemo(()=>{
    if(!here) return places
    return [{key:HERE_KEY,name:here.city,city:'Your location',lat:here.lat,lon:here.lon,sensors:[]} as Place,...places]
  },[places,here])

  const [sel,setSel]=useState<string|null>(null)
  useEffect(()=>{
    // Prefer the viewer's own location once it arrives — Astronomy opens on
    // where you are, not on the first row in a table.
    if(here&&sel===null) { setSel(HERE_KEY); return }
    if(allPlaces.length&&sel!==null&&!allPlaces.some(p=>p.key===sel)) setSel(allPlaces[0].key)
    else if(!hereLoading&&sel===null&&allPlaces.length) setSel(allPlaces[0].key)
  },[allPlaces,sel,here,hereLoading])
  const active = allPlaces.find(p=>p.key===sel) ?? allPlaces[0]

  const markers = useMemo(()=>allPlaces.map(p=>({
    id:p.key, lat:p.lat, lon:p.lon, label:p.name,
    color:p.key===HERE_KEY?'#FFFFFF':sColor(p.sensors[0]?.type??''),
  })),[allPlaces])

  const activeCount = sensors.filter(s=>s.status==='active').length
  // Charts: one series per instrument type, from whichever sensor is freshest.
  const byType = useMemo(()=>{
    const m:Record<string,Sensor>={}
    for(const s of sensors){
      const prev=m[s.type]
      if(!prev||new Date(latestOf(s)?.timestamp||0)>new Date(latestOf(prev)?.timestamp||0)) m[s.type]=s
    }
    return Object.values(m)
  },[sensors])

  return <div className="globe-page">
    <GlobeView markers={markers} selectedId={sel} onSelect={setSel}/>

    {/* Readout floats in the black corner the globe's offset leaves free. */}
    {active && <aside className="readout">
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
        {active.key===HERE_KEY&&<Navigation size={13} style={{color:'var(--tx2)'}}/>}
        <span style={{fontSize:12.5,color:'var(--tx3)',letterSpacing:'0.02em'}}>
          {active.key===HERE_KEY?'Your location':(active.city||'Monitored site')}
        </span>
      </div>

      <h2 style={{fontSize:24,fontWeight:600,letterSpacing:'-0.02em',lineHeight:1.1,marginBottom:2}}>{active.name}</h2>
      <p style={{fontSize:11.5,color:'var(--tx3)',marginBottom:16}}>
        {active.lat.toFixed(3)}°, {active.lon.toFixed(3)}°
      </p>

      <div className="readout-grid">
        {(active.key===HERE_KEY&&here
          ? [
              {k:'Temp',v:here.temperature,u:'°C',c:'#FF5C7A',i:<Thermometer size={14}/>},
              {k:'Hum',v:here.humidity,u:'%',c:'#6C8CFF',i:<Droplets size={14}/>},
              {k:'Wind',v:here.windspeed,u:'km/h',c:'#B47CFF',i:<Wind size={14}/>},
              {k:'UV',v:here.uv,u:'',c:'#E45FC4',i:<Activity size={14}/>},
            ]
          : active.sensors.map(s=>({k:sShort(s.type),v:latestOf(s)?.value??null,u:sUnit(s.type),c:sColor(s.type),i:sIcon(s.type)}))
        ).map(r=><div key={r.k} className="readout-cell">
          <span style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
            <span style={{color:r.c,display:'flex'}}>{r.i}</span>
            <span style={{fontSize:11.5,color:'var(--tx3)'}}>{r.k}</span>
          </span>
          <span className="val" style={{fontSize:24,fontWeight:600,color:'var(--tx1)'}}>
            {r.v!=null?r.v.toFixed(1):'—'}
            <span style={{fontSize:11,color:'var(--tx3)',marginLeft:2,fontWeight:400}}>{r.u}</span>
          </span>
        </div>)}
      </div>

      <p style={{fontSize:10.5,color:'var(--tx3)',marginTop:14}}>
        {active.key===HERE_KEY
          ? 'Live · Open-Meteo'
          : latestOf(active.sensors[0])
            ? `Updated ${format(new Date(latestOf(active.sensors[0])!.timestamp),'HH:mm')}`
            : 'No readings'}
      </p>
    </aside>}

    {/* Refresh is not here: the page renders one floating control for every tab. */}

    {/* Imagery credit — required by the NASA and Esri licences. */}
    <p className="globe-credit">NASA EOSDIS GIBS · Esri, Maxar, Earthstar Geographics</p>


  </div>
}



// ─── Monitoring ────────────────────────────────────────────────────────────────
function Monitoring({sensors,onRefresh}:{sensors:Sensor[];onRefresh:()=>void}) {
  const [compare, setCompare] = useState<string[]>([])
  const [filterType, setFilterType] = useState<string>('all')

  // Group sensors by physical location
  const places = useMemo(()=>{
    const m = new Map<string,{location:string;lat:number|null;lon:number|null;sensors:Sensor[]}>()
    for(const s of sensors){
      const cur = m.get(s.location)
      if(!cur) m.set(s.location,{location:s.location,lat:s.lat,lon:s.lon,sensors:[s]})
      else cur.sensors.push(s)
    }
    return [...m.values()].sort((a,b)=>a.location.localeCompare(b.location))
  },[sensors])

  const sensorTypes = useMemo(()=>[...new Set(sensors.map(s=>s.type))],[sensors])
  const filtered = filterType==='all' ? places : places.map(p=>({...p,sensors:p.sensors.filter(s=>s.type===filterType)})).filter(p=>p.sensors.length>0)
  const comparePlaces = filtered.filter(p=>compare.includes(p.location))

  const toggleCompare = (loc:string) => setCompare(prev=>prev.includes(loc)?prev.filter(l=>l!==loc):[...prev,loc])

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:18}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
      <p className="sec">Monitoring Stations</p>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          <button className={`btn btn-xs ${filterType==='all'?'btn-green':'btn-ghost'}`} onClick={()=>setFilterType('all')}>All</button>
          {sensorTypes.map(t=><button key={t} className={`btn btn-xs ${filterType===t?'btn-green':'btn-ghost'}`} onClick={()=>setFilterType(t)} style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{color:sColor(t),display:'flex'}}>{sIcon(t)}</span>{sLabel(t)}
          </button>)}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}><RefreshCw size={13}/></button>
      </div>
    </div>

    {compare.length>0&&<div className="card" style={{padding:'12px 18px',border:'1px solid rgba(123,92,255,0.25)',background:'linear-gradient(135deg,rgba(123,92,255,0.08),rgba(108,140,255,0.04))'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <span style={{fontSize:12,color:'#7B5CFF',fontWeight:600}}><BarChart3 size={13} style={{marginRight:6}}/>Comparing {compare.length} location{compare.length>1?'s':''}</span>
        <button className="btn btn-ghost btn-xs" onClick={()=>setCompare([])}>Clear</button>
      </div>
      {comparePlaces.length>=2&&<div style={{marginTop:14}}>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(comparePlaces.length,4)},1fr)`,gap:12,marginBottom:12}}>
          {comparePlaces.map(p=><div key={p.location} style={{textAlign:'center'}}>
            <p style={{fontSize:11,fontWeight:700,color:'var(--tx2)',marginBottom:6}}>{p.location.split(',')[0].trim()}</p>
            {p.sensors.map(s=>{const v=latestOf(s)?.value;return <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginBottom:4}}>
              <span style={{color:sColor(s.type),display:'flex'}}>{sIcon(s.type)}</span>
              <span className="val" style={{fontSize:18,color:sColor(s.type)}}>{v!=null?v.toFixed(1):'—'}</span>
              <span style={{fontSize:10,color:'var(--tx3)'}}>{sUnit(s.type)}</span>
            </div>})}
          </div>)}
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={comparePlaces.map(p=>({name:p.location.split(',')[0].trim(),...Object.fromEntries(p.sensors.map(s=>[sLabel(s.type),latestOf(s)?.value??0]))}))}>
            <CartesianGrid strokeDasharray="2 3" stroke="rgba(123,92,255,0.06)"/>
            <XAxis dataKey="name" tick={{fontSize:10,fill:'var(--tx3)'}}/>
            <YAxis tick={{fontSize:10,fill:'var(--tx3)'}} width={34}/>
            <Tooltip content={<TTip/>}/>
            {sensorTypes.map(t=><Bar key={t} dataKey={sLabel(t)} fill={sColor(t)} opacity={0.7} radius={[4,4,0,0]}/>)}
          </BarChart>
        </ResponsiveContainer>
      </div>}
    </div>}

    {!filtered.length && <div className="card" style={{padding:'60px 20px',textAlign:'center',borderStyle:'dashed'}}>
      <Radio size={48} style={{color:'var(--tx3)',opacity:0.3,marginBottom:16}}/>
      <p style={{fontSize:15,color:'var(--tx3)',fontWeight:500}}>No sensors found</p>
      <p style={{fontSize:13,color:'var(--tx3)',marginTop:4,maxWidth:300,margin:'4px auto 0'}}>
        {filterType!=='all'?'No sensors of this type. Try a different filter.':'Add sensors to start monitoring.'}
      </p>
    </div>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:14}}>
      {filtered.map(p=>{
        const active = p.sensors.filter(s=>s.status==='active')
        const freshest = Math.max(...p.sensors.map(s=>new Date(latestOf(s)?.timestamp||0).getTime()))
        const isComparing = compare.includes(p.location)
        return <div key={p.location} className="card" style={{padding:'20px 22px',position:'relative',border:`1px solid ${isComparing?'rgba(123,92,255,0.35)':'rgba(123,92,255,0.08)'}`,background:isComparing?'linear-gradient(180deg,rgba(123,92,255,0.06),rgba(123,92,255,0))':'linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:44,height:44,borderRadius:12,background:'rgba(123,92,255,0.12)',border:'1px solid rgba(123,92,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',color:'#7B5CFF',flexShrink:0}}><MapPin size={18}/></div>
              <div>
                <p style={{fontSize:14.5,fontWeight:700,lineHeight:1.3}}>{p.location.split(',')[0].trim()}</p>
                <p style={{fontSize:11,color:'var(--tx3)',marginTop:2,display:'flex',alignItems:'center',gap:3}}><MapPin size={9}/>{p.location}</p>
              </div>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button className={`btn btn-xs ${isComparing?'btn-green':'btn-ghost'}`} onClick={()=>toggleCompare(p.location)} title="Compare">
                <BarChart3 size={11}/>
              </button>
              <span className={`badge ${active.length===p.sensors.length?'b-green':'b-amber'}`}>
                <span className={`dot ${active.length===p.sensors.length?'dot-green':'dot-amber'}`}/>
                {active.length}/{p.sensors.length}
              </span>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:14}}>
            {p.sensors.map(s=>{
              const v = latestOf(s)?.value
              const ts = latestOf(s)?.timestamp
              return <div key={s.id} style={{padding:'12px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <span style={{color:sColor(s.type),display:'flex'}}>{sIcon(s.type)}</span>
                  <span style={{fontSize:11.5,color:'var(--tx3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{sLabel(s.type)}</span>
                </div>
                <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                  <span className="val" style={{fontSize:22,fontWeight:600,color:sColor(s.type),textShadow:`0 0 12px ${sColor(s.type)}55`}}>{v!=null?v.toFixed(1):'—'}</span>
                  <span style={{fontSize:11,color:'var(--tx3)'}}>{sUnit(s.type)}</span>
                </div>
                <p style={{fontSize:10,color:'var(--tx3)',marginTop:4}}>{ts?format(new Date(ts),'HH:mm'):'No data'}</p>
              </div>
            })}
          </div>

          {p.sensors[0]?.data?.length>1&&<div style={{marginBottom:10}}>
            <ResponsiveContainer width="100%" height={50}>
              <AreaChart data={[...p.sensors[0].data].reverse().slice(-12).map(d=>({t:format(new Date(d.timestamp),'HH:mm'),v:d.value}))}>
                <defs><linearGradient id={`spark${p.location.replace(/[^a-zA-Z0-9]/g,'')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sColor(p.sensors[0].type)} stopOpacity={0.2}/><stop offset="100%" stopColor={sColor(p.sensors[0].type)} stopOpacity={0}/></linearGradient></defs>
                <Area type="monotone" dataKey="v" stroke={sColor(p.sensors[0].type)} strokeWidth={1.5} fill={`url(#spark${p.location.replace(/[^a-zA-Z0-9]/g,'')})`} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>}

          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
            <span style={{fontSize:10.5,color:'var(--tx3)'}}><Radio size={10} style={{marginRight:4,color:active.length===p.sensors.length?'#30D158':'#FF453A'}}/>{active.length===p.sensors.length?'All reporting':'Some offline'}</span>
            <span style={{fontSize:10.5,color:'var(--tx3)'}}>Updated {freshest?format(new Date(freshest),'HH:mm'):'—'}</span>
          </div>
        </div>
      })}
    </div>
  </div>
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function Analytics({sensors}:{sensors:Sensor[]}) {
  const [view, setView] = useState<'overview'|'table'|'compare'>('overview')

  const places = useMemo(()=>{
    const m = new Map<string,{location:string;lat:number|null;lon:number|null;sensors:Sensor[]}>()
    for(const s of sensors){
      const cur = m.get(s.location)
      if(!cur) m.set(s.location,{location:s.location,lat:s.lat,lon:s.lon,sensors:[s]})
      else cur.sensors.push(s)
    }
    return [...m.values()].sort((a,b)=>a.location.localeCompare(b.location))
  },[sensors])

  const sensorStats = useMemo(()=>sensors.map(s=>{
    const vals = s.data.map(d=>d.value)
    if(!vals.length) return {sensor:s,avg:0,min:0,max:0,std:0,count:0,trend:0,range:0}
    const avg = vals.reduce((a,b)=>a+b,0)/vals.length
    const min = Math.min(...vals); const max = Math.max(...vals)
    const std = Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-avg,2),0)/vals.length)
    const trend = vals.length > 1 ? (vals[vals.length-1] - vals[0]) / vals.length : 0
    return {sensor:s,avg,min,max,std,count:vals.length,trend,range:max-min}
  }),[sensors])

  const byType = useMemo(()=>{
    const acc:Record<string,Sensor[]> = {}
    sensors.forEach(s=>{const t=sLabel(s.type);if(!acc[t])acc[t]=[];acc[t].push(s)})
    return acc
  },[sensors])

  const typeStats = useMemo(()=>Object.entries(byType).map(([type,slist])=>{
    const all=slist.flatMap(s=>s.data.map(d=>d.value))
    if(!all.length)return{type,avg:0,min:0,max:0,count:0,sensors:slist.length}
    return{type,avg:all.reduce((a,b)=>a+b,0)/all.length,min:Math.min(...all),max:Math.max(...all),count:all.length,sensors:slist.length}
  }),[byType])

  const anomalies = useMemo(()=>sensorStats.filter(st=>st.std>0&&st.sensor.data.length>0).flatMap(st=>{
    const latest = latestOf(st.sensor)
    if(!latest) return []
    const zscore = Math.abs((latest.value - st.avg) / st.std)
    if(zscore > 2) return [{sensor:st.sensor,value:latest.value,avg:st.avg,std:st.std,zscore,time:latest.timestamp}]
    return []
  }),[sensorStats])

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:18}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
      <p className="sec">Analytics & Trends</p>
      <div style={{display:'flex',gap:4}}>
        <button className={`btn btn-xs ${view==='overview'?'btn-green':'btn-ghost'}`} onClick={()=>setView('overview')}>Overview</button>
        <button className={`btn btn-xs ${view==='table'?'btn-green':'btn-ghost'}`} onClick={()=>setView('table')}>Data Table</button>
        <button className={`btn btn-xs ${view==='compare'?'btn-green':'btn-ghost'}`} onClick={()=>setView('compare')}>Compare</button>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(123,92,255,0.1)',background:'linear-gradient(135deg,rgba(123,92,255,0.05),rgba(108,140,255,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Total Sensors</p>
        <p className="val" style={{fontSize:28,color:'#7B5CFF'}}>{sensors.length}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{sensors.filter(s=>s.status==='active').length} active</p>
      </div>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(108,140,255,0.1)',background:'linear-gradient(135deg,rgba(108,140,255,0.05),rgba(123,92,255,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Locations</p>
        <p className="val" style={{fontSize:28,color:'#6C8CFF'}}>{places.length}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{places.reduce((a,p)=>a+p.sensors.length,0)} sensors</p>
      </div>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(255,92,122,0.1)',background:'linear-gradient(135deg,rgba(255,92,122,0.05),rgba(255,92,122,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Sensor Types</p>
        <p className="val" style={{fontSize:28,color:'#FF5C7A'}}>{Object.keys(byType).length}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{Object.keys(byType).join(', ')}</p>
      </div>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(48,209,88,0.1)',background:'linear-gradient(135deg,rgba(48,209,88,0.05),rgba(48,209,88,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Data Points</p>
        <p className="val" style={{fontSize:28,color:'#30D158'}}>{sensors.reduce((a,s)=>a+s.data.length,0)}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>Avg {sensors.length?Math.round(sensors.reduce((a,s)=>a+s.data.length,0)/sensors.length):0}/sensor</p>
      </div>
      {anomalies.length>0&&<div className="card" style={{padding:'16px 18px',border:'1px solid rgba(255,69,58,0.15)',background:'linear-gradient(135deg,rgba(255,69,58,0.06),rgba(255,69,58,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Anomalies</p>
        <p className="val" style={{fontSize:28,color:'#FF453A'}}>{anomalies.length}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>Outside 2σ</p>
      </div>}
    </div>

    {anomalies.length>0&&<div className="card" style={{padding:'16px 18px',border:'1px solid rgba(255,69,58,0.15)'}}>
      <p style={{fontSize:11,color:'#FF453A',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10,fontWeight:600,display:'flex',alignItems:'center',gap:6}}><AlertTriangle size={13}/>Anomaly Detection</p>
      {anomalies.map(a=><div key={a.sensor.id} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
        <span style={{color:sColor(a.sensor.type),display:'flex'}}>{sIcon(a.sensor.type)}</span>
        <div style={{flex:1}}>
          <p style={{fontSize:12,fontWeight:600}}>{sLabel(a.sensor.type)} at {a.sensor.location}</p>
          <p style={{fontSize:11,color:'var(--tx3)'}}>Current: <span style={{color:'#FF453A',fontWeight:600}}>{a.value.toFixed(1)}{sUnit(a.sensor.type)}</span> · Avg: {a.avg.toFixed(1)} · Z-score: {a.zscore.toFixed(1)}</p>
        </div>
        <span className="badge b-red" style={{fontSize:10}}>Outlier</span>
      </div>)}
    </div>}

    {view==='overview'&&<>
      <div className="card" style={{padding:'20px 20px 12px'}}>
        <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:14}}>Summary by Parameter Type</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={typeStats} barGap={4}>
            <CartesianGrid strokeDasharray="2 3" stroke="rgba(123,92,255,0.06)"/>
            <XAxis dataKey="type" tick={{fontSize:11,fill:'var(--tx3)'}}/>
            <YAxis tick={{fontSize:11,fill:'var(--tx3)'}} width={34}/>
            <Tooltip content={<TTip/>}/>
            <Bar dataKey="avg" name="Avg" fill="#7B5CFF" opacity={0.75} radius={[4,4,0,0]}/>
            <Bar dataKey="max" name="Max" fill="#FF5C7A" opacity={0.65} radius={[4,4,0,0]}/>
            <Bar dataKey="min" name="Min" fill="#6C8CFF" opacity={0.65} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10,fontWeight:600}}>Trends by Location</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:14}}>
        {places.map(p=>{
          const c = sColor(p.sensors[0]?.type||'')
          const allPoints = p.sensors.flatMap(s=>s.data.map(d=>({t:format(new Date(d.timestamp),'HH:mm'),v:d.value,type:sLabel(s.type)}))).sort((a,b)=>a.t.localeCompare(b.t))
          const gid = `agLoc${p.location.replace(/[^a-zA-Z0-9]/g,'')}`
          return <div key={p.location} className="card" style={{padding:'18px 18px 10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
              <span style={{color:c}}><MapPin size={13}/></span>
              <span style={{fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:c}}>{p.location.split(',')[0].trim()}</span>
              <span style={{fontSize:11,color:'var(--tx3)',marginLeft:'auto'}}>{p.sensors.length} sensors · {p.sensors.map(s=>sLabel(s.type)).join(', ')}</span>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={allPoints}>
                <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.2}/><stop offset="100%" stopColor={c} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="2 3" stroke="rgba(123,92,255,0.05)"/>
                <XAxis dataKey="t" tick={{fontSize:9,fill:'var(--tx3)'}}/>
                <YAxis tick={{fontSize:9,fill:'var(--tx3)'}} width={32}/>
                <Tooltip content={<TTip/>}/>
                <Area type="monotone" dataKey="v" name="Value" stroke={c} strokeWidth={1.8} fill={`url(#${gid})`} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        })}
      </div>
    </>}

    {view==='table'&&<div className="card" style={{padding:'18px 20px',overflowX:'auto'}}>
      <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:14}}>Sensor Statistics</p>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)',textAlign:'left'}}>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Sensor</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Location</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Type</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Count</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Avg</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Min</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Max</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Std Dev</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Trend</th>
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Status</th>
          </tr>
        </thead>
        <tbody>
          {sensorStats.map(st=>{
            const s=st.sensor
            const trendColor = st.trend>0.01?'#30D158':st.trend<-0.01?'#FF453A':'var(--tx3)'
            return <tr key={s.id} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
              <td style={{padding:'10px 12px',fontWeight:600}}>#{s.id}</td>
              <td style={{padding:'10px 12px',color:'var(--tx2)',fontSize:11}}>{s.location}</td>
              <td style={{padding:'10px 12px'}}><span style={{display:'inline-flex',alignItems:'center',gap:6}}><span style={{color:sColor(s.type)}}>{sIcon(s.type)}</span><span style={{textTransform:'capitalize',fontSize:11}}>{sLabel(s.type)}</span></span></td>
              <td style={{padding:'10px 12px',color:'var(--tx3)'}}>{st.count}</td>
              <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:500,color:sColor(s.type)}}>{st.avg.toFixed(1)}</td>
              <td style={{padding:'10px 12px',color:'var(--tx3)'}}>{st.min.toFixed(1)}</td>
              <td style={{padding:'10px 12px',color:'var(--tx3)'}}>{st.max.toFixed(1)}</td>
              <td style={{padding:'10px 12px',color:'var(--tx3)',fontFamily:'monospace'}}>{st.std.toFixed(2)}</td>
              <td style={{padding:'10px 12px',color:trendColor,fontWeight:600}}>{st.trend>0.01?'↗ Rising':st.trend<-0.01?'↘ Falling':'→ Stable'}</td>
              <td style={{padding:'10px 12px'}}><span className={`badge ${s.status==='active'?'b-green':'b-red'}`}><span className={`dot ${s.status==='active'?'dot-green':'dot-red'}`}/>{s.status}</span></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>}

    {view==='compare'&&<>
      <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10,fontWeight:600}}>Location Comparison</p>
      <div className="card" style={{padding:'20px',overflowX:'auto'}}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={places.map(p=>{
            const row:{[k:string]:any}={name:p.location.split(',')[0].trim()}
            p.sensors.forEach(s=>{const v=latestOf(s)?.value;if(v!=null)row[sLabel(s.type)]=parseFloat(v.toFixed(1))})
            return row
          })}>
            <CartesianGrid strokeDasharray="2 3" stroke="rgba(123,92,255,0.06)"/>
            <XAxis dataKey="name" tick={{fontSize:10,fill:'var(--tx3)'}}/>
            <YAxis tick={{fontSize:10,fill:'var(--tx3)'}} width={34}/>
            <Tooltip content={<TTip/>}/>
            {[...new Set(sensors.map(s=>s.type))].map(t=><Bar key={t} dataKey={sLabel(t)} fill={sColor(t)} opacity={0.7} radius={[4,4,0,0]}/>)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
        {places.map(p=><div key={p.location} className="card" style={{padding:'16px 18px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <MapPin size={14} color="#7B5CFF"/>
            <span style={{fontSize:13,fontWeight:700}}>{p.location.split(',')[0].trim()}</span>
            <span className="badge b-cyan" style={{marginLeft:'auto'}}>{p.sensors.length} sensors</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {p.sensors.map(s=>{const v=latestOf(s)?.value;return <div key={s.id} style={{textAlign:'center',padding:'8px 4px',background:'rgba(255,255,255,0.02)',borderRadius:8}}>
              <span style={{color:sColor(s.type),display:'flex',justifyContent:'center',marginBottom:4}}>{sIcon(s.type)}</span>
              <p className="val" style={{fontSize:16,color:sColor(s.type)}}>{v!=null?v.toFixed(1):'—'}</p>
              <p style={{fontSize:9,color:'var(--tx3)',marginTop:2}}>{sLabel(s.type)}</p>
            </div>})}
          </div>
        </div>)}
      </div>
    </>}
  </div>
}

// ─── Alerts ────────────────────────────────────────────────────────────────────
function AlertsTab({sensors,alerts,onRefresh}:{sensors:Sensor[];alerts:any[];onRefresh:()=>void}) {
  const thresholdAlerts = useMemo(()=>{
    const a:any[]=[]
    const thresholds:{[key:string]:{warn:number;crit:number}}={
      temperature:{warn:35,crit:40},
      humidity:{warn:80,crit:95},
      air_quality:{warn:150,crit:200},
    }
    for(const s of sensors){
      const t=thresholds[s.type]
      if(!t) continue
      const latest=latestOf(s)
      if(!latest) continue
      if(latest.value>=t.crit) a.push({id:`${s.id}-crit`,sensor:s,level:'critical',value:latest.value,threshold:t.crit,time:latest.timestamp,message:`${sLabel(s.type)} at ${s.location} is ${latest.value}${sUnit(s.type)} (critical: ${t.crit}${sUnit(s.type)})`})
      else if(latest.value>=t.warn) a.push({id:`${s.id}-warn`,sensor:s,level:'warning',value:latest.value,threshold:t.warn,time:latest.timestamp,message:`${sLabel(s.type)} at ${s.location} is ${latest.value}${sUnit(s.type)} (warning: ${t.warn}${sUnit(s.type)})`})
    }
    return a.sort((x,y)=>new Date(y.time).getTime()-new Date(x.time).getTime())
  },[sensors])

  const allAlerts = [...thresholdAlerts,...(alerts||[]).map(a=>({...a,level:a.level||'info',source:'system'}))]
    .sort((a,b)=>new Date(b.time||b.timestamp||0).getTime()-new Date(a.time||a.timestamp||0).getTime())

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
      <p className="sec">Alerts & Thresholds</p>
      <button className="btn btn-ghost btn-sm" onClick={onRefresh}><RefreshCw size={13}/></button>
    </div>

    <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(255,165,0,0.12)'}}>
      <p style={{fontSize:11,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10,fontWeight:600}}>Active Thresholds</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
        {[{type:'temperature',warn:35,crit:40,unit:'°C'},{type:'humidity',warn:80,crit:95,unit:'%'},{type:'air_quality',warn:150,crit:200,unit:'AQI'}].map(t=><div key={t.type} style={{padding:'10px 14px',background:'rgba(255,255,255,0.02)',borderRadius:8,border:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
            <span style={{color:sColor(t.type),display:'flex'}}>{sIcon(t.type)}</span>
            <span style={{fontSize:11.5,fontWeight:600,textTransform:'capitalize'}}>{sLabel(t.type)}</span>
          </div>
          <div style={{display:'flex',gap:12,fontSize:11}}>
            <span style={{color:'#FFD60A'}}>⚠ Warn: {t.warn}{t.unit}</span>
            <span style={{color:'#FF453A'}}>🔴 Crit: {t.crit}{t.unit}</span>
          </div>
        </div>)}
      </div>
    </div>

    {!allAlerts.length&&<div className="card" style={{padding:'50px 20px',textAlign:'center',borderStyle:'dashed'}}>
      <CheckCircle size={48} style={{color:'#30D158',opacity:0.3,marginBottom:16}}/>
      <p style={{fontSize:15,color:'var(--tx3)',fontWeight:500}}>All Clear</p>
      <p style={{fontSize:13,color:'var(--tx3)',marginTop:4}}>No alerts or threshold violations detected.</p>
    </div>}

    {allAlerts.map(a=>{
      const isC=a.level==='critical'
      const col=isC?'#FF453A':a.level==='warning'?'#FFD60A':'#7B5CFF'
      return <div key={a.id||a.message} className="card" style={{padding:'14px 18px',border:`1px solid ${col}22`,background:`linear-gradient(135deg,${col}08,transparent)`}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:`${col}16`,border:`1px solid ${col}30`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            {isC?<Zap size={16} color={col}/>:<AlertTriangle size={16} color={col}/>}
          </div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span className={`badge ${isC?'b-red':'b-amber'}`} style={{fontSize:9}}>{a.level.toUpperCase()}</span>
              {a.sensor&&<span style={{fontSize:11,color:'var(--tx3)'}}>{sLabel(a.sensor.type)} · {a.sensor.location}</span>}
            </div>
            <p style={{fontSize:13,fontWeight:500,lineHeight:1.4}}>{a.message}</p>
            {a.time&&<p style={{fontSize:10.5,color:'var(--tx3)',marginTop:4}}>{format(new Date(a.time),'MMM d, HH:mm')}</p>}
          </div>
          {a.value!=null&&<div style={{textAlign:'right',flexShrink:0}}>
            <p className="val" style={{fontSize:20,color:col,fontWeight:600}}>{a.value.toFixed?a.value.toFixed(1):a.value}</p>
            {a.threshold&&<p style={{fontSize:10,color:'var(--tx3)'}}>Threshold: {a.threshold}</p>}
          </div>}
        </div>
      </div>
    })}
  </div>
}


// ─── News ─────────────────────────────────────────────────────────────────────
/** "3h ago" reads better than a timestamp for a live feed. */
function ago(iso:string|null):string {
  if(!iso) return ''
  const s=(Date.now()-Date.parse(iso))/1000
  if(isNaN(s)) return ''
  if(s<60) return 'just now'
  if(s<3600) return `${Math.floor(s/60)}m ago`
  if(s<86400) return `${Math.floor(s/3600)}h ago`
  if(s<604800) return `${Math.floor(s/86400)}d ago`
  return format(new Date(iso),'MMM d, yyyy')
}

function NewsTab({news,live,fetchedAt}:{news:NewsItem[];live:boolean;fetchedAt:string|null}) {
  // The article opened in the reader; null means the list.
  const [open,setOpen]=useState<NewsItem|null>(null)
  const [source,setSource]=useState<string|null>(null)
  // createPortal needs a real document, which the server render has not got.
  const [mounted,setMounted]=useState(false)
  useEffect(()=>setMounted(true),[])

  // Escape closes the reader, as a dialog should.
  useEffect(()=>{
    if(!open) return
    const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape') setOpen(null) }
    window.addEventListener('keydown',onKey)
    return ()=>window.removeEventListener('keydown',onKey)
  },[open])

  const sources=[...new Set(news.map(n=>n.source))]
  const shown=source?news.filter(n=>n.source===source):news

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:13}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      {/* All on the left: the floating Refresh occupies the top right, and
          anything here would sit underneath it.
          No Refresh of its own either -- the page's one force-refetches on this
          tab, so a second would be duplication. */}
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <p className="sec" style={{margin:0}}>Environmental News</p>
        {/* Says plainly whether these are live articles or the stored fallback,
            so a reader is never misled about how current the page is. */}
        {live
          ? <span className="badge b-green"><span className="dot dot-green"/>live</span>
          : <span className="badge b-red">offline · stored</span>}
        {fetchedAt&&<span className="val" style={{fontSize:10.5,color:'var(--tx3)'}}>updated {ago(fetchedAt)}</span>}
      </div>
    </div>

    {/* Filter by publisher. */}
    {sources.length>1&&<div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
      <button className={`chip${source===null?' on':''}`} onClick={()=>setSource(null)}>All ({news.length})</button>
      {sources.map(s=><button key={s} className={`chip${source===s?' on':''}`} onClick={()=>setSource(s)}>
        {s} ({news.filter(n=>n.source===s).length})
      </button>)}
    </div>}

    {!shown.length&&<p style={{color:'var(--tx3)',textAlign:'center',padding:'50px 0'}}>No articles yet.</p>}

    {shown.map((n,i)=><div key={n.id} className="card" style={{padding:'20px 22px',animationDelay:`${Math.min(i,8)*.05}s`}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:8}}>
        <h3 style={{fontSize:15,fontWeight:700,lineHeight:1.4,fontFamily:'inherit'}}>{n.title}</h3>
        <span className="tag" style={{flexShrink:0}}><Globe size={10}/>{n.source}</span>
      </div>

      {/* Byline: who published it, who wrote it, when. */}
      <p style={{fontSize:11.5,color:'var(--tx3)',marginBottom:10,display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
        <span>{n.source}</span>
        {n.author&&<><span aria-hidden="true">·</span><span>By {n.author}</span></>}
        {n.publishedAt&&<><span aria-hidden="true">·</span><span className="val">{ago(n.publishedAt)}</span></>}
        {n.category&&<><span aria-hidden="true">·</span><span>{n.category}</span></>}
      </p>

      <p style={{fontSize:13.5,color:'var(--tx2)',lineHeight:1.65,marginBottom:12,
        display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{n.summary}</p>

      <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(n)}
        style={{display:'inline-flex',alignItems:'center',gap:5}}>
        See more<ChevronRight size={12}/>
      </button>
    </div>)}

    {/* Reader. RSS carries a summary, not the body, so the full text lives on the
        publisher's site -- this shows everything the feed gives and links out for
        the rest, rather than pretending to have the article. */}
    {/*
      * Portalled to <body> on purpose.
      *
      * The tab's .anim-up wrapper keeps a transform from its slideUp animation,
      * and a transformed ancestor becomes the containing block for
      * position:fixed. Rendered in place, this overlay anchored to that wrapper
      * instead of the viewport -- with 139 articles the wrapper is ~13,000px
      * tall, so the reader opened far below the fold while the backdrop still
      * dimmed the screen. The portal takes it out of that subtree entirely.
      */}
    {open&&mounted&&createPortal(
      <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setOpen(null)}}>
      <div className="modal" style={{padding:'22px 24px',overflowY:'auto'}} role="dialog" aria-modal="true" aria-label={open.title}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:12}}>
          <span className="tag"><Globe size={10}/>{open.source}</span>
          <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(null)} aria-label="Close"><X size={14}/></button>
        </div>

        <h2 style={{fontSize:20,fontWeight:700,lineHeight:1.3,marginBottom:10}}>{open.title}</h2>

        <div style={{fontSize:12,color:'var(--tx3)',marginBottom:16,lineHeight:1.9}}>
          <p>Published by <strong style={{color:'var(--tx2)'}}>{open.source}</strong></p>
          {open.author&&<p>Written by <strong style={{color:'var(--tx2)'}}>{open.author}</strong></p>}
          {open.publishedAt&&<p className="val">{format(new Date(open.publishedAt),'EEEE, MMMM d, yyyy · HH:mm')} ({ago(open.publishedAt)})</p>}
          {open.category&&<p>Section: {open.category}</p>}
        </div>

        <p style={{fontSize:14,color:'var(--tx2)',lineHeight:1.75,marginBottom:18}}>{open.summary}</p>

        {open.url
          ? <a className="btn btn-green btn-sm" href={open.url} target="_blank" rel="noopener noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:6,textDecoration:'none'}}>
              Read full article on {open.source}<ChevronRight size={13}/>
            </a>
          : <p style={{fontSize:11.5,color:'var(--tx3)'}}>No link available for this stored article.</p>}
      </div>
    </div>, document.body)}
  </div>
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
function CampaignsTab({campaigns,user,onRefresh}:{campaigns:Campaign[];user:User;onRefresh:()=>void}) {
  const [show,setShow]=useState(false); const [title,setTitle]=useState(''); const [desc,setDesc]=useState(''); const [loading,setLoading]=useState(false); const [error,setError]=useState('')
  // No creatorId/userId: the server uses the bearer token's identity.
  const create=async()=>{ if(!title.trim())return; setLoading(true); try{ await apiPost('/api/campaigns',{title,description:desc}); setTitle('');setDesc('');setShow(false);onRefresh() }catch(e){ setError(e instanceof Error?e.message:'Failed to create campaign') } finally{ setLoading(false) } }
  const join=async(id:number)=>{ try{ await apiPost('/api/campaigns/join',{campaignId:id}); onRefresh() }catch(e){ setError(e instanceof Error?e.message:'Failed to join') } }
  const isIn=(c:Campaign)=>c.participants.some(p=>p.id===user.id)||c.creator.id===user.id

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:16}}>
    {/* paddingRight reserves the corner for the page's floating Refresh, which
        this row's right-hand button would otherwise sit underneath. */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingRight:46}}>
      <p className="sec">Campaigns</p>
      <button className="btn btn-green btn-sm" onClick={()=>setShow(true)}><Plus size={13}/>New</button>
    </div>
    {show&&<div className="card" style={{padding:'20px 22px',borderColor:'rgba(123,92,255,0.28)'}}>
      <p style={{fontWeight:700,marginBottom:14,color:'#7B5CFF',fontSize:13}}>Create Campaign</p>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <input className="inp" placeholder="Campaign title" value={title} onChange={e=>setTitle(e.target.value)}/>
        <textarea className="inp" placeholder="What is this campaign about?" value={desc} onChange={e=>setDesc(e.target.value)} rows={3}/>
        <div style={{display:'flex',gap:8}}><button className="btn btn-green" onClick={create} disabled={loading}>{loading?'Creating...':'Create'}</button><button className="btn btn-ghost" onClick={()=>setShow(false)}>Cancel</button></div>
      </div>
    </div>}
    {error&&<p style={{color:'#FF453A',fontSize:12}}>{error}</p>}
    {!campaigns.length&&<p style={{color:'var(--tx3)',textAlign:'center',padding:'50px 0'}}>No campaigns yet. Start one!</p>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:13}}>
      {campaigns.map(c=><div key={c.id} className="card" style={{padding:'18px 20px'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:10}}>
          <h3 style={{fontSize:14,fontWeight:700,lineHeight:1.35}}>{c.title}</h3>
          {isIn(c)&&<span className="badge b-green"><CheckCircle size={9}/>Joined</span>}
        </div>
        <p style={{fontSize:13,color:'var(--tx2)',lineHeight:1.55,marginBottom:14}}>{c.description}</p>
        <div className="hr"/>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:11.5,color:'var(--tx3)',display:'flex',alignItems:'center',gap:4}}><Users size={11}/>{c.participants.length} joined · {c.creator.name||'Anonymous'}</span>
          {!isIn(c)&&<button className="btn btn-green btn-xs" onClick={()=>join(c.id)}>Join</button>}
        </div>
      </div>)}
    </div>
  </div>
}

// ─── Groups ───────────────────────────────────────────────────────────────────
function GroupsTab({groups,user,onRefresh}:{groups:Group[];user:User;onRefresh:()=>void}) {
  const [show,setShow]=useState(false); const [name,setName]=useState(''); const [issue,setIssue]=useState(''); const [loading,setLoading]=useState(false)
  const [activeG,setActiveG]=useState<Group|null>(null); const [msgs,setMsgs]=useState<GroupMessage[]>([]); const [txt,setTxt]=useState(''); const [sending,setSending]=useState(false)
  const [error,setError]=useState(''); const [streamKey,setStreamKey]=useState(0)
  const chatRef=useRef<HTMLDivElement>(null)
  // Bumped after create/join so the stream reconnects and picks up the new
  // membership, which the server resolves at connect time.
  const onStreamRefresh=()=>setStreamKey(k=>k+1)

  const scroll=(d=60)=>setTimeout(()=>chatRef.current?.scrollTo({top:chatRef.current.scrollHeight,behavior:'smooth'}),d)
  // Appends only if we have not already seen this id: the author is a member,
  // so their own message also arrives back over the stream.
  const addMsg=(m:GroupMessage)=>setMsgs(p=>p.some(x=>x.id===m.id)?p:[...p,m])

  // No creatorId/userId in any of these: the server uses the token's identity.
  const create=async()=>{ if(!name.trim())return; setLoading(true); try{ await apiPost('/api/groups',{name,issue}); setName('');setIssue('');setShow(false);onStreamRefresh();onRefresh() }catch(e){ setError(e instanceof Error?e.message:'Failed to create group') } finally{ setLoading(false) } }
  const join=async(id:number)=>{ try{ await apiPost('/api/groups/join',{groupId:id}); onStreamRefresh(); onRefresh() }catch(e){ setError(e instanceof Error?e.message:'Failed to join') } }
  const openChat=async(g:Group)=>{ setActiveG(g); setError(''); try{ const r=await apiGet<Page<GroupMessage>>(`/api/messages?groupId=${g.id}`); setMsgs(r.items); scroll(80) }catch(e){ setMsgs([]); setError(e instanceof Error?e.message:'Failed to load chat') } }
  const send=async()=>{ if(!txt.trim()||!activeG)return; setSending(true); try{ const m=await apiPost<GroupMessage>('/api/messages',{content:txt,groupId:activeG.id}); addMsg(m); setTxt(''); scroll(50) }catch(e){ setError(e instanceof Error?e.message:'Failed to send') } finally{ setSending(false) } }
  const isMem=(g:Group)=>g.members.some(m=>m.id===user.id)||g.creator.id===user.id

  // Live chat for the open group.
  useEventStream((type,payload)=>{
    if(type!=='message:new'||!activeG) return
    const m=payload as GroupMessage
    if(m.groupId!==activeG.id) return
    addMsg(m); scroll(30)
  },true,streamKey)

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:16}}>
    {/* paddingRight reserves the corner for the page's floating Refresh. */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingRight:46}}>
      <p className="sec">Community Groups</p>
      <button className="btn btn-green btn-sm" onClick={()=>setShow(true)}><Plus size={13}/>New Group</button>
    </div>
    {error&&<p style={{color:'#FF453A',fontSize:12}}>{error}</p>}
    {show&&<div className="card" style={{padding:'20px 22px',borderColor:'rgba(123,92,255,0.28)'}}>
      <p style={{fontWeight:700,marginBottom:14,color:'#7B5CFF',fontSize:13}}>Create Group</p>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <input className="inp" placeholder="Group name" value={name} onChange={e=>setName(e.target.value)}/>
        <input className="inp" placeholder="Environmental issue to address" value={issue} onChange={e=>setIssue(e.target.value)}/>
        <div style={{display:'flex',gap:8}}><button className="btn btn-green" onClick={create} disabled={loading}>{loading?'Creating...':'Create'}</button><button className="btn btn-ghost" onClick={()=>setShow(false)}>Cancel</button></div>
      </div>
    </div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:13}}>
      {groups.map(g=><div key={g.id} className="card" style={{padding:'18px 20px'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:8}}>
          <h3 style={{fontSize:13.5,fontWeight:700,fontFamily:'inherit'}}>{g.name}</h3>
          {isMem(g)&&<span className="badge b-green"><CheckCircle size={9}/>Member</span>}
        </div>
        <p style={{fontSize:12.5,color:'var(--tx2)',marginBottom:12}}>{g.issue}</p>
        <div style={{display:'flex',gap:12,marginBottom:14}}>
          <span style={{fontSize:11.5,color:'var(--tx3)',display:'flex',alignItems:'center',gap:4}}><Users size={10}/>{g.members.length+1}</span>
          <span style={{fontSize:11.5,color:'var(--tx3)',display:'flex',alignItems:'center',gap:4}}><MessageSquare size={10}/>{g._count.messages}</span>
        </div>
        {isMem(g)?<button className="btn btn-green btn-sm" style={{width:'100%'}} onClick={()=>openChat(g)}><MessageSquare size={12}/>Open Chat</button>:<button className="btn btn-ghost btn-sm" style={{width:'100%'}} onClick={()=>join(g.id)}>Join Group</button>}
        <div style={{marginTop:8}}><ShareButtons groupName={g.name} issue={g.issue} groupId={g.id}/></div>
      </div>)}
    </div>

    {activeG&&<div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setActiveG(null)}}>
      <div className="modal" style={{height:520}}>
        <div style={{padding:'16px 18px',borderBottom:'1px solid rgba(123,92,255,0.1)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div><p style={{fontWeight:700,fontSize:14}}>{activeG.name}</p><p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{activeG.issue}</p></div>
          <button onClick={()=>setActiveG(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)',padding:4}}><X size={16}/></button>
        </div>
        <div ref={chatRef} className="chat-scroll">
          {!msgs.length&&<p style={{color:'var(--tx3)',textAlign:'center',margin:'auto',fontSize:13}}>Say hello! 👋</p>}
          {msgs.map(m=><div key={m.id} style={{display:'flex',flexDirection:'column',alignItems:m.user.id===user.id?'flex-end':'flex-start',gap:3}}>
            <p style={{fontSize:9.5,color:'var(--tx3)',paddingInline:6}}>{m.user.name||'Anonymous'}</p>
            <div className={`bubble ${m.user.id===user.id?'b-me':'b-them'}`}>{m.content}</div>
            <p style={{fontSize:9.5,color:'var(--tx3)',paddingInline:6}}>{format(new Date(m.createdAt),'HH:mm')}</p>
          </div>)}
        </div>
        <div style={{padding:'12px 14px',borderTop:'1px solid rgba(123,92,255,0.08)',display:'flex',gap:10,flexShrink:0}}>
          <input className="inp" placeholder="Message..." value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}/>
          <button className="btn btn-green" style={{padding:'0 16px',flexShrink:0}} onClick={send} disabled={sending}><Send size={14}/></button>
        </div>
      </div>
    </div>}
  </div>
}

// ─── Fundraisers ──────────────────────────────────────────────────────────────
function FundraisersTab({fundraisers,user,onRefresh,onToast}:{fundraisers:Fundraiser[];user:User;onRefresh:()=>void;onToast:(m:string,t:'ok'|'err'|'info')=>void}) {
  const [show,setShow]=useState(false); const [cause,setCause]=useState(''); const [desc,setDesc]=useState(''); const [goal,setGoal]=useState(''); const [loading,setLoading]=useState(false)
  const [paying,setPaying]=useState<Fundraiser|null>(null); const [localFunds,setLocalFunds]=useState<Fundraiser[]>(fundraisers)

  useEffect(()=>setLocalFunds(fundraisers),[fundraisers])

  // No creatorId: the server uses the bearer token's identity.
  const create=async()=>{ if(!cause.trim()||!goal)return; setLoading(true); try{ await apiPost('/api/fundraisers',{cause,description:desc,goal:parseFloat(goal)}); setCause('');setDesc('');setGoal('');setShow(false);onRefresh() }catch(e){ onToast(e instanceof Error?e.message:'Failed to create fundraiser','err') } finally{ setLoading(false) } }

  const handleDonation=(f:Fundraiser,amt:number,method:string)=>{
    setLocalFunds(prev=>prev.map(x=>x.id===f.id?{...x,raised:x.raised+amt}:x))
    onToast(`₹${amt.toLocaleString('en-IN')} donated via ${methodName(method)}!`,'ok')
    onRefresh()
  }

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:16}}>
    {/* paddingRight reserves the corner for the page's floating Refresh. */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingRight:46}}>
      <p className="sec">Fundraisers</p>
      <button className="btn btn-green btn-sm" onClick={()=>setShow(true)}><Plus size={13}/>New Fundraiser</button>
    </div>
    {show&&<div className="card" style={{padding:'20px 22px',borderColor:'rgba(123,92,255,0.28)'}}>
      <p style={{fontWeight:700,marginBottom:14,color:'#7B5CFF',fontSize:13}}>Start a Fundraiser</p>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <input className="inp" placeholder="Cause title" value={cause} onChange={e=>setCause(e.target.value)}/>
        <textarea className="inp" placeholder="Describe the cause..." value={desc} onChange={e=>setDesc(e.target.value)} rows={3}/>
        <div style={{position:'relative'}}><span style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',color:'rgba(123,92,255,0.6)',fontSize:15}}>₹</span><input className="inp" style={{paddingLeft:30}} type="number" placeholder="Funding goal" value={goal} onChange={e=>setGoal(e.target.value)}/></div>
        <div style={{display:'flex',gap:8}}><button className="btn btn-green" onClick={create} disabled={loading}>{loading?'Creating...':'Launch'}</button><button className="btn btn-ghost" onClick={()=>setShow(false)}>Cancel</button></div>
      </div>
    </div>}
    {!localFunds.length&&<p style={{color:'var(--tx3)',textAlign:'center',padding:'50px 0'}}>No fundraisers yet.</p>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))',gap:14}}>
      {localFunds.map(f=>{
        const pct=Math.min(100,(f.raised/f.goal)*100)
        return <div key={f.id} className="card" style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:12}}>
          <div>
            <h3 style={{fontSize:14.5,fontWeight:700,marginBottom:6}}>{f.cause}</h3>
            <p style={{fontSize:13,color:'var(--tx2)',lineHeight:1.55}}>{f.description}</p>
          </div>
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
              <span className="val" style={{fontSize:20,color:'#7B5CFF'}}>₹{f.raised.toLocaleString('en-IN')}</span>
              <span style={{fontSize:12,color:'var(--tx3)'}}>of ₹{f.goal.toLocaleString('en-IN')}</span>
            </div>
            <div className="prog"><div className="prog-fill" style={{width:`${pct}%`}}/></div>
            <p style={{fontSize:11,color:'var(--tx3)',marginTop:5}}>{pct.toFixed(1)}% funded</p>
          </div>
          <div className="hr" style={{margin:'4px 0'}}/>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:11.5,color:'var(--tx3)',display:'flex',alignItems:'center',gap:4}}><HeartHandshake size={12}/>{f.creator.name||'Anonymous'}</span>
            <button className="btn btn-green btn-sm" onClick={()=>setPaying(f)}><Wallet size={12}/>Fund Now</button>
          </div>
        </div>
      })}
    </div>
    {paying&&<PaymentModal fundraiser={paying} user={user} onClose={()=>setPaying(null)} onSuccess={(amt,method)=>handleDonation(paying,amt,method)}/>}
  </div>
}


// ─── App Shell ────────────────────────────────────────────────────────────────
function AppShell({user,onLogout}:{user:User;onLogout:()=>void}) {
  const [tab,setTab]=useState<Tab>('overview')
  const [sensors,setSensors]=useState<Sensor[]>([]); const [news,setNews]=useState<NewsItem[]>([]); const [campaigns,setCampaigns]=useState<Campaign[]>([]); const [groups,setGroups]=useState<Group[]>([]); const [fundraisers,setFundraisers]=useState<Fundraiser[]>([]); const [refreshing,setRefreshing]=useState(false)
  const [newsLive,setNewsLive]=useState(false); const [newsFetchedAt,setNewsFetchedAt]=useState<string|null>(null)
  const [toast,setToast]=useState<{msg:string;type:'ok'|'err'|'info'}|null>(null)
  const [sideOpen,setSideOpen]=useState(true)

  const load=useCallback(async(freshNews=false)=>{
    setRefreshing(true)
    try{
      // sensors returns a plain array; news is wrapped so it can report whether
      // it is live; the community lists are paginated.
      const [s,n,c,g,f]=await Promise.all([
        apiGet<Sensor[]>('/api/sensors'),
        apiGet<NewsResponse>(`/api/news${freshNews?'?refresh=1':''}`),
        apiGet<Page<Campaign>>('/api/campaigns?limit=50'),
        apiGet<Page<Group>>('/api/groups?limit=50'),
        apiGet<Page<Fundraiser>>('/api/fundraisers?limit=50'),
      ])
      setSensors(s); setNews(n.articles); setNewsLive(n.live); setNewsFetchedAt(n.fetchedAt)
      setCampaigns(c.items); setGroups(g.items); setFundraisers(f.items)
    }catch{
      // Keep whatever is on screen rather than blanking the dashboard.
    }finally{ setRefreshing(false) }
  },[])

  useEffect(()=>{load()},[load])
  // Live updates arrive over /api/events. The poll stays as a slow safety net
  // for anything missed while the stream was down, at 5 minutes rather than
  // the old 60s.
  useEffect(()=>{const t=setInterval(load,300000);return()=>clearInterval(t)},[load])

  useEventStream((type,payload)=>{
    if(type==='donation:new'){
      // Patch the one total in place instead of refetching every list.
      const d=payload as {fundraiserId:number;raised:number}
      setFundraisers(p=>p.map(f=>f.id===d.fundraiserId?{...f,raised:d.raised}:f))
    } else if(type==='campaign:new'||type==='group:new'||type==='fundraiser:new'
           ||type==='campaign:join'||type==='group:join'){
      // Creates and joins both change lists and counts that every client shows.
      // Refetch without freshNews: this is community data, and there is no
      // reason to hit the news publishers because someone joined a group.
      load()
    } else if(type==='alert:new'){
      const a=payload as {message:string}
      setToast({msg:a.message,type:'err'})
    }
  })

  const showToast=(msg:string,type:'ok'|'err'|'info')=>setToast({msg,type})

  // No counts: the sidebar carries labels only.
  const nav=[
    {k:'overview',l:'Home',i:<LayoutDashboard size={15}/>},
    {k:'sensors',l:'Sensors',i:<Radio size={15}/>},
    {k:'analytics',l:'Analytics',i:<BarChart3 size={15}/>},
    {k:'alerts',l:'Alerts',i:<Bell size={15}/>},
    {k:'news',l:'News',i:<Newspaper size={15}/>},
    {k:'campaigns',l:'Campaigns',i:<Megaphone size={15}/>},
    {k:'groups',l:'Groups',i:<Users size={15}/>},
    {k:'fundraisers',l:'Fundraisers',i:<HeartHandshake size={15}/>},
  ]

  const roleColor:Record<string,string>={admin:'#FF453A',analyst:'#6C8CFF',public:'#30D158',technician:'#FF5C7A'}
  const rc=roleColor[user.role]||'#7B5CFF'

  return <div style={{display:'flex',minHeight:'100vh',position:'relative'}}>
    <div className="noise"/><div className="glow-orb orb1"/><div className="glow-orb orb2"/><div className="glow-orb orb3"/>

    {/* Sidebar */}
    {/* Liquid glass: the tint is in .sidebar-glass so the whole surface can be
        styled in one place rather than inline. */}
    <aside className="sidebar-glass" style={{width:sideOpen?220:58,flexShrink:0,position:'sticky',top:0,height:'100vh',display:'flex',flexDirection:'column',zIndex:10,transition:'width .22s ease'}}>
      {/* Logo */}
      <div style={{padding:'18px 12px 16px',borderBottom:'1px solid var(--b1)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:34,height:34,flexShrink:0,borderRadius:9,background:'var(--brand-grad)',color:'#FFFFFF',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Logo size={19}/>
          </div>
          {sideOpen&&<div style={{lineHeight:1.2}}><p className="brand-text" style={{fontSize:15,fontWeight:600,letterSpacing:"-0.02em"}}>EarthPulse</p><p style={{fontSize:11.5,color:'var(--tx3)',fontWeight:450}}>Environment Monitor</p></div>}
        </div>
      </div>

      <nav style={{flex:1,padding:'10px 8px',overflowY:'auto',display:'flex',flexDirection:'column',gap:3}}>
        {sideOpen&&<p style={{fontSize:9.5,color:'var(--tx3)',letterSpacing:'0.18em',textTransform:'uppercase',padding:'6px 10px',marginBottom:2}}>Menu</p>}
        {nav.map(n=><div key={n.k} className={`nav-link ${tab===n.k?'on':''}`} onClick={()=>setTab(n.k as Tab)} title={!sideOpen?n.l:undefined} style={{justifyContent:sideOpen?'flex-start':'center',padding:sideOpen?'9px 12px':'9px 0'}}>
          {n.i}
          {/* No count badges: the numbers were noise next to the labels. */}
          {sideOpen&&<span style={{flex:1}}>{n.l}</span>}
        </div>)}
      </nav>

      <div style={{padding:'10px 8px',borderTop:'1px solid rgba(123,92,255,0.07)'}}>
        {sideOpen&&<div style={{display:'flex',alignItems:'center',gap:9,padding:'9px 11px',borderRadius:10,background:'rgba(123,92,255,0.04)',border:'1px solid rgba(123,92,255,0.07)',marginBottom:9}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:`${rc}18`,border:`1px solid ${rc}30`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><UserCircle size={14} color={rc}/></div>
          <div style={{overflow:'hidden',flex:1}}>
            <p style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.name||user.email}</p>
            <p style={{fontSize:9.5,color:rc,textTransform:'uppercase',letterSpacing:'0.06em'}}>{user.role}</p>
          </div>
          {user.isVerified&&<CheckCircle size={12} color="#30D158"/>}
        </div>}
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>setSideOpen(p=>!p)} className="btn btn-ghost btn-xs" style={{padding:'7px 10px',flex:sideOpen?'none':1}}>{sideOpen?'◁':'▷'}</button>
          {sideOpen&&<button onClick={onLogout} className="btn btn-ghost btn-xs" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:5}}><LogOut size={12}/>Logout</button>}
        </div>
      </div>
    </aside>

    {/* Main */}
    <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',zIndex:1}}>
      {/* No page header on any tab: it only restated the tab name the sidebar
          already highlights. Refresh floats over the page instead, and the tab
          content starts at the top. */}

      {/* Content — Home is full-bleed so the globe reaches every edge.
          position:relative anchors the floating Refresh below. */}
      <div style={{flex:1,overflowY:tab==='overview'?'hidden':'auto',padding:tab==='overview'?0:'22px 26px',position:'relative'}}>
        {/* One Refresh for every tab, floating in the page space.
            On News it forces a refetch past the 10-minute feed cache, which is
            what a reader means by Refresh there; elsewhere that would only
            pester the publishers, so it stays cached.
            Wrapped, not passed bare: onClick hands the button a MouseEvent,
            which as load's first arg would read as freshNews=true. */}
        {/* Icon only. aria-label/title carry the meaning the text used to --
            without them this is an unlabelled button to a screen reader. */}
        <button className="btn btn-ghost btn-xs page-refresh" onClick={()=>load(tab==='news')} disabled={refreshing}
          aria-label={refreshing?'Syncing':'Refresh'} title={refreshing?'Syncing':'Refresh'}>
          <RefreshCw size={14} style={{animation:refreshing?'spin 1s linear infinite':'none'}}/>
        </button>

        {tab==='overview'&&<Overview sensors={sensors}/>}
        {tab==='sensors'&&<Monitoring sensors={sensors} onRefresh={()=>load()}/>}
        {tab==='analytics'&&<Analytics sensors={sensors}/>}
        {tab==='alerts'&&<AlertsTab sensors={sensors} alerts={[]} onRefresh={()=>load()}/>}
        {tab==='news'&&<NewsTab news={news} live={newsLive} fetchedAt={newsFetchedAt}/>}
        {tab==='campaigns'&&<CampaignsTab campaigns={campaigns} user={user} onRefresh={()=>load()}/>}
        {tab==='groups'&&<GroupsTab groups={groups} user={user} onRefresh={()=>load()}/>}
        {tab==='fundraisers'&&<FundraisersTab fundraisers={fundraisers} user={user} onRefresh={()=>load()} onToast={showToast}/>}
      </div>
    </main>

    {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [user,setUser]=useState<User|null>(null); const [ready,setReady]=useState(false); const [toast,setToast]=useState<string>('')

  useEffect(()=>{
    const u=localStorage.getItem('user'); const t=localStorage.getItem('token')
    if(u&&t){ try{setUser(JSON.parse(u))}catch{} }
    // Check if coming back from email verification
    const params=new URLSearchParams(window.location.search)
    if(params.get('verified')==='1'){ setToast('Email verified! You are now fully verified.'); window.history.replaceState({},'','/') }
    setReady(true)
  },[])

  if(!ready) return <div style={{background:'var(--bg)',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:40,height:40,borderRadius:'50%',border:'2px solid rgba(123,92,255,0.2)',borderTopColor:'#7B5CFF',animation:'spin 0.8s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>

  if(!user) return <>
    <AuthScreen onAuth={(u,t,msg)=>{setUser(u);if(msg)setToast(msg)}}/>
    {toast&&<div className="toast" style={{zIndex:999}}><CheckCircle size={16} color="#30D158"/><span style={{fontSize:13}}>{toast}</span><button onClick={()=>setToast('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)'}}><X size={13}/></button></div>}
  </>

  return <>
    <AppShell user={user} onLogout={()=>{localStorage.removeItem('user');localStorage.removeItem('token');setUser(null)}}/>
    {toast&&<div className="toast"><CheckCircle size={16} color="#30D158"/><span style={{fontSize:13}}>{toast}</span><button onClick={()=>setToast('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)'}}><X size={13}/></button></div>}
  </>
}
