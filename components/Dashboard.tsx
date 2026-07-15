'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
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
interface NewsItem { id:number; title:string; content:string; source:string; createdAt:string }
// Listings identify people by id and name only -- the API no longer returns
// other users' email addresses to unauthenticated callers.
interface Person { id:number; name:string|null }
interface Campaign { id:number; title:string; description:string; creator:Person; participants:Person[] }
interface Group { id:number; name:string; issue:string; creator:Person; members:Person[]; _count:{messages:number} }
interface GroupMessage { id:number; groupId?:number; content:string; createdAt:string; user:Person }
interface Fundraiser { id:number; cause:string; description:string; goal:number; raised:number; creator:Person }
type Tab = 'overview'|'sensors'|'analytics'|'news'|'campaigns'|'groups'|'fundraisers'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sIcon = (t:string) => { switch(t){case'temperature':return<Thermometer size={15}/>;case'humidity':return<Droplets size={15}/>;case'air_quality':return<Wind size={15}/>;default:return<Activity size={15}/>} }
const sUnit = (t:string) => ({temperature:'°C',humidity:'%',air_quality:'AQI'}[t]??'')
const sColor = (t:string) => ({temperature:'#FF5C7A',humidity:'#6C8CFF',air_quality:'#B47CFF'}[t]??'#E45FC4')
const sLabel = (t:string) => t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
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

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:40}}>

    {/* ─── Hero: the globe, and the conditions at whatever it is looking at ── */}
    <section>
      <div style={{marginBottom:16}}>
        <h2 style={{fontSize:26,fontWeight:600,letterSpacing:'-0.03em',color:'var(--tx1)'}}>Live conditions</h2>
        <p style={{fontSize:14,color:'var(--tx3)',marginTop:3}}>
          {places.length} monitored {places.length===1?'location':'locations'} · {activeCount} of {sensors.length} sensors reporting
        </p>
      </div>

      <div className="globe-hero">
        <div className="globe-stage">
          <GlobeView markers={markers} selectedId={sel} onSelect={setSel}/>
          {/* Place chips float over the globe rather than stacking below it. */}
          <div className="globe-chips">
            {allPlaces.map(p=>{
              const on=p.key===sel
              const isHere=p.key===HERE_KEY
              return <button key={p.key} onClick={()=>setSel(p.key)} className={`chip${on?' on':''}`}>
                {isHere
                  ? <Navigation size={11} style={{color:'#FFFFFF'}}/>
                  : <span className="dot" style={{background:sColor(p.sensors[0]?.type??''),animation:'none',width:6,height:6}}/>}
                {p.name}
              </button>
            })}
          </div>
        </div>

        {active && <aside className="glass place-panel">
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
            <div>
              <h3 style={{fontSize:22,fontWeight:600,letterSpacing:'-0.025em'}}>{active.name}</h3>
              <p style={{fontSize:13,color:'var(--tx3)',marginTop:2}}>{active.city||'—'}</p>
            </div>
            <span className="badge b-green"><span className="dot dot-green"/>live</span>
          </div>

          <p style={{fontSize:11.5,color:'var(--tx3)',marginTop:8,display:'flex',alignItems:'center',gap:5}}>
            <MapPin size={11}/>{active.lat.toFixed(4)}°, {active.lon.toFixed(4)}°
          </p>

          <div className="hr"/>

          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {/* "Your location" has no instruments — it reads from Open-Meteo. */}
            {active.key===HERE_KEY&&here?([
              {k:'Temperature',v:here.temperature,u:'°C',c:'#FF5C7A',i:<Thermometer size={15}/>},
              {k:'Humidity',v:here.humidity,u:'%',c:'#6C8CFF',i:<Droplets size={15}/>},
              {k:'Wind',v:here.windspeed,u:'km/h',c:'#B47CFF',i:<Wind size={15}/>},
              {k:'UV Index',v:here.uv,u:'',c:'#E45FC4',i:<Activity size={15}/>},
            ]).map(r=><div key={r.k} className="reading">
              <span style={{display:'flex',alignItems:'center',gap:9}}>
                <span style={{color:r.c,display:'flex'}}>{r.i}</span>
                <span style={{fontSize:14,color:'var(--tx2)'}}>{r.k}</span>
              </span>
              <span className="val" style={{fontSize:21,fontWeight:600,color:'var(--tx1)'}}>
                {r.v!=null?r.v.toFixed(1):'—'}
                <span style={{fontSize:11,color:'var(--tx3)',marginLeft:3,fontWeight:400}}>{r.u}</span>
              </span>
            </div>):active.sensors.map(s=>{
              const v=latestOf(s)?.value
              const c=sColor(s.type)
              return <div key={s.id} className="reading">
                <span style={{display:'flex',alignItems:'center',gap:9}}>
                  <span style={{color:c,display:'flex'}}>{sIcon(s.type)}</span>
                  <span style={{fontSize:14,color:'var(--tx2)'}}>{sLabel(s.type)}</span>
                </span>
                <span className="val" style={{fontSize:21,fontWeight:600,color:'var(--tx1)'}}>
                  {v!=null?v.toFixed(1):'—'}
                  <span style={{fontSize:11,color:'var(--tx3)',marginLeft:3,fontWeight:400}}>{sUnit(s.type)}</span>
                </span>
              </div>
            })}
          </div>

          {active.key===HERE_KEY
            ? <p style={{fontSize:11,color:'var(--tx3)',marginTop:14}}>Live · Open-Meteo</p>
            : latestOf(active.sensors[0]) && <p style={{fontSize:11,color:'var(--tx3)',marginTop:14}}>
                Updated {format(new Date(latestOf(active.sensors[0])!.timestamp),'HH:mm')}
              </p>}
        </aside>}
      </div>
    </section>

    {/* ─── Trends ─────────────────────────────────────────────────────────── */}
    <section>
      <div style={{marginBottom:14}}>
        <h2 style={{fontSize:20,fontWeight:600,letterSpacing:'-0.025em'}}>Trends</h2>
        <p style={{fontSize:13,color:'var(--tx3)',marginTop:2}}>Recent history per instrument</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(420px,1fr))',gap:16}}>
        {byType.map(s=>{
          const c=sColor(s.type)
          const pts=s.data.map(d=>({t:format(new Date(d.timestamp),'HH:mm'),v:parseFloat(d.value.toFixed(2))}))
          const last=pts.length?pts[pts.length-1].v:null
          return <div key={s.type} className="card" style={{padding:'18px 18px 10px'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{color:c,display:'flex'}}>{sIcon(s.type)}</span>
                <div>
                  <p style={{fontSize:15,fontWeight:590,letterSpacing:'-0.015em'}}>{sLabel(s.type)}</p>
                  <div style={{display:'flex',alignItems:'center',gap:4,marginTop:1}}>
                    <MapPin size={10} style={{color:'var(--tx3)'}}/><span style={{fontSize:11.5,color:'var(--tx3)'}}>{s.location}</span>
                  </div>
                </div>
              </div>
              {last!==null&&<p className="val" style={{fontSize:19,fontWeight:600}}>{last}<span style={{fontSize:11,color:'var(--tx3)',marginLeft:2}}>{sUnit(s.type)}</span></p>}
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={pts} margin={{top:4,right:4,left:0,bottom:0}}>
                <defs><linearGradient id={`g${s.type}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.22}/><stop offset="100%" stopColor={c} stopOpacity={0.01}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.07)" vertical={false}/>
                <XAxis dataKey="t" tick={{fontSize:10,fill:'var(--tx3)'}} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={44}/>
                <YAxis tick={{fontSize:10,fill:'var(--tx3)'}} width={30} tickLine={false} axisLine={false}/>
                <Tooltip content={<TTip/>}/>
                <Area type="monotone" dataKey="v" name={sLabel(s.type)} stroke={c} strokeWidth={2} fill={`url(#g${s.type})`} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        })}
      </div>
    </section>
  </div>
}


// ─── Sensors ──────────────────────────────────────────────────────────────────
// ─── Sensors ──────────────────────────────────────────────────────────────────
function Sensors({sensors,onRefresh}:{sensors:Sensor[];onRefresh:()=>void}) {
  const [locLoading,setLocLoading]=useState(false)
  const [locError,setLocError]=useState('')
  const [userCity,setUserCity]=useState('')
  const [userCoords,setUserCoords]=useState<{lat:number;lon:number}|null>(null)
  const [weather,setWeather]=useState<any>(null)
  const [weatherLoaded,setWeatherLoaded]=useState(false)

  // Weather code → description
  const wmoDesc=(code:number)=>{
    if(code===0)return'Clear Sky'
    if(code<=2)return'Partly Cloudy'
    if(code===3)return'Overcast'
    if(code<=9)return'Fog'
    if(code<=19)return'Drizzle'
    if(code<=29)return'Rain'
    if(code<=39)return'Snow'
    if(code<=49)return'Fog'
    if(code<=59)return'Drizzle'
    if(code<=69)return'Rain'
    if(code<=79)return'Snow'
    if(code<=84)return'Rain Showers'
    if(code<=94)return'Thunderstorm'
    return'Storm'
  }

  const wmoEmoji=(code:number)=>{
    if(code===0)return'☀️'
    if(code<=2)return'⛅'
    if(code===3)return'☁️'
    if(code<=9)return'🌫️'
    if(code<=29)return'🌦️'
    if(code<=39)return'❄️'
    if(code<=59)return'🌧️'
    if(code<=69)return'🌨️'
    if(code<=84)return'⛈️'
    return'🌩️'
  }

  const fetchWeather=()=>{
    if(!navigator.geolocation){setLocError('Geolocation not supported by your browser.');return}
    setLocLoading(true); setLocError(''); setWeather(null); setWeatherLoaded(false)

    navigator.geolocation.getCurrentPosition(
      async pos=>{
        const {latitude:lat,longitude:lon}=pos.coords
        setUserCoords({lat,lon})

        // Reverse geocode — get real city name
        try {
          const geo=await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            {headers:{'Accept-Language':'en'}}
          )
          const gd=await geo.json()
          const city=gd.address?.city||gd.address?.town||gd.address?.village||gd.address?.county||gd.address?.state||'Your Location'
          const state=gd.address?.state||''
          const country=gd.address?.country||''
          setUserCity([city,state,country].filter(Boolean).join(', '))
        } catch {
          setUserCity(`${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`)
        }

        // Fetch Open-Meteo weather for exact coordinates
        try {
          const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relativehumidity_2m,apparent_temperature,precipitation_probability,windspeed_10m,winddirection_10m,uv_index,visibility&current_weather=true&timezone=auto&forecast_days=1`
          const res=await fetch(url)
          const data=await res.json()

          // Get current hour index
          const now=new Date()
          const currentHour=now.getHours()

          const hourly=data.hourly
          const current=data.current_weather

          setWeather({
            temperature: current?.temperature,
            windspeed: current?.windspeed,
            weathercode: current?.weathercode,
            isDay: current?.is_day,
            apparent_temperature: hourly?.apparent_temperature?.[currentHour],
            humidity: hourly?.relativehumidity_2m?.[currentHour],
            precipitation_probability: hourly?.precipitation_probability?.[currentHour],
            uv_index: hourly?.uv_index?.[currentHour],
            visibility: hourly?.visibility?.[currentHour],
            winddirection: hourly?.winddirection_10m?.[currentHour],
            // Next 8 hours for chart
            hourlyTemps: hourly?.temperature_2m?.slice(currentHour, currentHour+8).map((t:number,i:number)=>({
              time: `${(currentHour+i)%24}:00`,
              temp: parseFloat(t.toFixed(1)),
              humidity: hourly?.relativehumidity_2m?.[currentHour+i]??null,
            }))
          })
          setWeatherLoaded(true)
        } catch {
          setLocError('Failed to fetch weather data. Please try again.')
        }
        setLocLoading(false)
      },
      err=>{
        setLocLoading(false)
        if(err.code===1) setLocError('Location access denied. Please allow location in your browser settings.')
        else if(err.code===2) setLocError('Location unavailable. Please try again.')
        else setLocError('Location request timed out. Please try again.')
      },
      {timeout:12000,enableHighAccuracy:true}
    )
  }

  const windDir=(deg:number)=>{
    const dirs=['N','NE','E','SE','S','SW','W','NW']
    return dirs[Math.round(deg/45)%8]
  }

  const uvLevel=(uv:number)=>{
    if(uv<=2)return{label:'Low',color:'#30D158'}
    if(uv<=5)return{label:'Moderate',color:'#FFD60A'}
    if(uv<=7)return{label:'High',color:'#FF5C7A'}
    if(uv<=10)return{label:'Very High',color:'#FF453A'}
    return{label:'Extreme',color:'#B47CFF'}
  }

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:18}}>

    {/* Header */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
      <p className="sec">Live Weather at Your Location</p>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {weatherLoaded&&(
          <button className="btn btn-ghost btn-xs" onClick={()=>{setWeather(null);setWeatherLoaded(false);setUserCity('');setUserCoords(null)}}>
            ✕ Clear
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={fetchWeather} disabled={locLoading}
          style={{display:'flex',alignItems:'center',gap:6}}>
          <MapPin size={13}/>
          {locLoading
            ? <span style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{width:11,height:11,borderRadius:'50%',border:'1.5px solid rgba(123,92,255,0.3)',borderTopColor:'#7B5CFF',animation:'spin 0.9s linear infinite',display:'inline-block'}}/>
                Fetching...
              </span>
            : weatherLoaded ? 'Refresh' : 'Get My Weather'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}><RefreshCw size={13}/></button>
      </div>
    </div>

    {/* Error */}
    {locError&&(
      <div style={{background:'rgba(255,69,58,0.08)',border:'1px solid rgba(255,69,58,0.22)',borderRadius:10,padding:'12px 16px',display:'flex',gap:10,alignItems:'flex-start'}}>
        <AlertTriangle size={15} color="#FF453A" style={{flexShrink:0,marginTop:1}}/>
        <div>
          <p style={{fontSize:13,color:'#FF453A',fontWeight:600,marginBottom:3}}>Error</p>
          <p style={{fontSize:12.5,color:'rgba(255,69,58,0.75)'}}>{locError}</p>
        </div>
        <button onClick={()=>setLocError('')} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'rgba(255,69,58,0.5)',padding:2}}><X size={14}/></button>
      </div>
    )}

    {/* Prompt card (before fetch) */}
    {!weatherLoaded&&!locLoading&&!locError&&(
      <div className="card" style={{padding:'48px 24px',textAlign:'center',borderStyle:'dashed'}}>
        <div style={{fontSize:48,marginBottom:16}}>🌍</div>
        <p style={{fontSize:15,fontWeight:700,marginBottom:8,fontFamily:'inherit'}}>Real-Time Weather for Your Location</p>
        <p style={{fontSize:13,color:'var(--tx3)',marginBottom:24,lineHeight:1.6}}>Click "Get My Weather" to fetch live temperature, humidity, UV index, wind and more for your exact coordinates via Open-Meteo.</p>
        <button className="btn btn-green" style={{margin:'0 auto',padding:'11px 28px'}} onClick={fetchWeather}>
          <MapPin size={15}/>Get My Weather
        </button>
      </div>
    )}

    {/* Loading skeleton */}
    {locLoading&&(
      <div className="card" style={{padding:'40px 24px',textAlign:'center'}}>
        <div style={{width:48,height:48,borderRadius:'50%',border:'2.5px solid rgba(123,92,255,0.15)',borderTopColor:'#7B5CFF',animation:'spin 0.9s linear infinite',margin:'0 auto 18px'}}/>
        <p style={{fontSize:14,fontWeight:600,marginBottom:6}}>Detecting your location...</p>
        <p style={{fontSize:12.5,color:'var(--tx3)'}}>Fetching live weather from Open-Meteo</p>
      </div>
    )}

    {/* Weather display */}
    {weatherLoaded&&weather&&(
      <div style={{display:'flex',flexDirection:'column',gap:14}}>

        {/* Location + main temp hero */}
        <div className="card" style={{padding:'24px 26px',background:'linear-gradient(135deg,rgba(123,92,255,0.07),rgba(108,140,255,0.04))'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:16}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <MapPin size={14} color="#6C8CFF"/>
                <p style={{fontSize:13,color:'#6C8CFF',fontWeight:600}}>{userCity}</p>
              </div>
              {userCoords&&<p className="val" style={{fontSize:10.5,color:'var(--tx3)',marginBottom:16}}>
                {userCoords.lat.toFixed(5)}°N · {userCoords.lon.toFixed(5)}°E
              </p>}
              <div style={{display:'flex',alignItems:'flex-end',gap:12}}>
                <span style={{fontSize:72,lineHeight:1}}>{wmoEmoji(weather.weathercode)}</span>
                <div>
                  <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                    <span className="val" style={{fontSize:56,fontWeight:400,color:'#7B5CFF',lineHeight:1}}>{weather.temperature?.toFixed(1)}</span>
                    <span style={{fontSize:22,color:'var(--tx3)'}}>°C</span>
                  </div>
                  <p style={{fontSize:14,color:'var(--tx2)',marginTop:4}}>{wmoDesc(weather.weathercode)}</p>
                  {weather.apparent_temperature!=null&&(
                    <p style={{fontSize:12,color:'var(--tx3)',marginTop:3}}>Feels like {weather.apparent_temperature.toFixed(1)}°C</p>
                  )}
                </div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:140}}>
              <span className={`badge ${weather.isDay?'b-amber':'b-purple'}`} style={{alignSelf:'flex-end',marginBottom:4}}>
                {weather.isDay?'☀️ Daytime':'🌙 Nighttime'}
              </span>
              {weather.humidity!=null&&<div style={{background:'rgba(255,255,255,0.05)',borderRadius:10,padding:'10px 14px'}}>
                <p style={{fontSize:10,color:'var(--tx3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>Humidity</p>
                <p className="val" style={{fontSize:22,color:'#6C8CFF'}}>{weather.humidity}<span style={{fontSize:13,color:'var(--tx3)',marginLeft:2}}>%</span></p>
                <div className="prog" style={{marginTop:6}}><div className="prog-fill" style={{width:`${weather.humidity}%`,background:'linear-gradient(90deg,#6C8CFF,#7B5CFF)'}}/></div>
              </div>}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}}>
          {[
            {label:'Wind Speed',value:`${weather.windspeed?.toFixed(1)}`,unit:'km/h',icon:'💨',color:'#B47CFF',sub:weather.winddirection!=null?`Direction: ${windDir(weather.winddirection)}`:''},
            {label:'Precipitation',value:`${weather.precipitation_probability??'—'}`,unit:'%',icon:'🌧️',color:'#6C8CFF',sub:'Chance of rain'},
            {label:'UV Index',value:`${weather.uv_index?.toFixed(1)??'—'}`,unit:'',icon:'🔆',color:uvLevel(weather.uv_index??0).color,sub:`${uvLevel(weather.uv_index??0).label} risk`},
            {label:'Visibility',value:weather.visibility!=null?`${(weather.visibility/1000).toFixed(1)}`:'—',unit:'km',icon:'👁️',color:'#FF5C7A',sub:'Horizontal range'},
          ].map(item=>(
            <div key={item.label} className="card2" style={{padding:'14px 16px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>{item.label}</p>
                <span style={{fontSize:16}}>{item.icon}</span>
              </div>
              <div style={{display:'flex',alignItems:'baseline',gap:3,marginBottom:4}}>
                <span className="val" style={{fontSize:24,color:item.color,textShadow:`0 0 14px ${item.color}55`}}>{item.value}</span>
                {item.unit&&<span style={{fontSize:12,color:'var(--tx3)'}}>{item.unit}</span>}
              </div>
              {item.sub&&<p style={{fontSize:11,color:'var(--tx3)'}}>{item.sub}</p>}
            </div>
          ))}
        </div>

        {/* Hourly chart */}
        {weather.hourlyTemps?.length>0&&(
          <div className="card" style={{padding:'18px 18px 10px'}}>
            <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,marginBottom:14}}>Next 8 Hours — Temperature & Humidity</p>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={weather.hourlyTemps}>
                <defs>
                  <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF5C7A" stopOpacity={0.25}/>
                    <stop offset="100%" stopColor="#FF5C7A" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="gradHumid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6C8CFF" stopOpacity={0.2}/>
                    <stop offset="100%" stopColor="#6C8CFF" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 3" stroke="rgba(123,92,255,0.06)"/>
                <XAxis dataKey="time" tick={{fontSize:10,fill:'var(--tx3)'}}/>
                <YAxis yAxisId="temp" tick={{fontSize:10,fill:'var(--tx3)'}} width={30}/>
                <YAxis yAxisId="humid" orientation="right" tick={{fontSize:10,fill:'var(--tx3)'}} width={30}/>
                <Tooltip content={<TTip/>}/>
                <Area yAxisId="temp" type="monotone" dataKey="temp" name="Temp °C" stroke="#FF5C7A" strokeWidth={2} fill="url(#gradTemp)" dot={false}/>
                <Area yAxisId="humid" type="monotone" dataKey="humidity" name="Humidity %" stroke="#6C8CFF" strokeWidth={1.5} fill="url(#gradHumid)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Attribution */}
        <p style={{fontSize:11,color:'var(--tx3)',textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
          <Globe size={11}/> Weather data by <a href="https://open-meteo.com" target="_blank" rel="noreferrer" style={{color:'rgba(123,92,255,0.6)',textDecoration:'none'}}>Open-Meteo</a> · Free & open-source API · Updated hourly
        </p>
      </div>
    )}

    {/* DB Sensors always shown below */}
    <div style={{marginTop:8}}>
      <p className="sec" style={{marginBottom:14}}>Database Sensors</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:13}}>
        {sensors.map(s=>{
          const c=sColor(s.type); const v=latestOf(s)?.value
          return <div key={s.id} className="card" style={{padding:'18px 20px'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:38,height:38,borderRadius:10,background:`${c}16`,border:`1px solid ${c}28`,display:'flex',alignItems:'center',justifyContent:'center',color:c,flexShrink:0}}>{sIcon(s.type)}</div>
                <div>
                  <p style={{fontSize:13.5,fontWeight:700,textTransform:'capitalize'}}>{sLabel(s.type)}</p>
                  <p style={{fontSize:11,color:'var(--tx3)',display:'flex',alignItems:'center',gap:3,marginTop:2}}><MapPin size={9}/>{s.location}</p>
                </div>
              </div>
              <span className={`badge ${s.status==='active'?'b-green':'b-red'}`}>
                <span className={`dot ${s.status==='active'?'dot-green':'dot-red'}`}/>{s.status}
              </span>
            </div>
            <div style={{display:'flex',alignItems:'baseline',gap:5,marginBottom:10}}>
              <span className="val" style={{fontSize:30,color:c,textShadow:`0 0 16px ${c}55`}}>{v!=null?v.toFixed(1):'—'}</span>
              <span style={{fontSize:14,color:'var(--tx3)'}}>{sUnit(s.type)}</span>
            </div>
            <div className="hr"/>
            <p style={{fontSize:11,color:'var(--tx3)',fontFamily:'inherit'}}>
              ID #{s.id} · Updated {latestOf(s)?format(new Date(latestOf(s)!.timestamp),'HH:mm'):'N/A'}
            </p>
          </div>
        })}
      </div>
    </div>
  </div>
}
// ─── Analytics ────────────────────────────────────────────────────────────────
function Analytics({sensors}:{sensors:Sensor[]}) {
  // Deduplicate by type — latest sensor wins
  const byType = sensors.reduce((acc,s)=>{
    if(!acc[s.type]) acc[s.type]=s
    return acc
  },{} as Record<string,Sensor>)

  const summary = Object.entries(byType).map(([type,s])=>{
    const vals=s.data.map(d=>d.value)
    return {type:sLabel(type),avg:vals.reduce((a,b)=>a+b,0)/vals.length,max:Math.max(...vals),min:Math.min(...vals),color:sColor(type)}
  })

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:18}}>
    <p className="sec">Analytics & Trends</p>
    <div className="card" style={{padding:'20px 20px 12px'}}>
      <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:14}}>Avg / Max / Min per Type</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={summary} barGap={4}>
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

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}}>
      {Object.entries(byType).map(([type,s])=>{
        const c=sColor(type)
        const pts=[...s.data].reverse().map(d=>({t:format(new Date(d.timestamp),'HH:mm'),v:parseFloat(d.value.toFixed(2))}))
        return <div key={type} className="card" style={{padding:'18px 18px 10px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <span style={{color:c}}>{sIcon(type)}</span>
            <span style={{fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:c}}>{sLabel(type)}</span>
            <span className="badge b-cyan" style={{marginLeft:'auto'}}>{s.data.length} pts</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={pts}>
              <defs><linearGradient id={`ag${type}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.2}/><stop offset="100%" stopColor={c} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="2 3" stroke="rgba(123,92,255,0.05)"/>
              <XAxis dataKey="t" tick={{fontSize:9,fill:'var(--tx3)'}}/>
              <YAxis tick={{fontSize:9,fill:'var(--tx3)'}} width={32}/>
              <Tooltip content={<TTip/>}/>
              <Area type="monotone" dataKey="v" name={sLabel(type)} stroke={c} strokeWidth={1.8} fill={`url(#ag${type})`} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      })}
    </div>
  </div>
}

// ─── News ─────────────────────────────────────────────────────────────────────
function NewsTab({news}:{news:NewsItem[]}) {
  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:13}}>
    <p className="sec">Environmental News</p>
    {!news.length&&<p style={{color:'var(--tx3)',textAlign:'center',padding:'50px 0'}}>No articles yet.</p>}
    {news.map((n,i)=><div key={n.id} className="card" style={{padding:'20px 22px',animationDelay:`${i*.07}s`}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:10}}>
        <h3 style={{fontSize:15,fontWeight:700,lineHeight:1.4,fontFamily:'inherit'}}>{n.title}</h3>
        <span className="tag" style={{flexShrink:0}}><Globe size={10}/>{n.source}</span>
      </div>
      <p style={{fontSize:13.5,color:'var(--tx2)',lineHeight:1.65,marginBottom:12}}>{n.content}</p>
      <p className="val" style={{fontSize:11,color:'var(--tx3)'}}>{format(new Date(n.createdAt),'MMM d, yyyy')}</p>
    </div>)}
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
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
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
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
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
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
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
  const [toast,setToast]=useState<{msg:string;type:'ok'|'err'|'info'}|null>(null)
  const [sideOpen,setSideOpen]=useState(true)

  const load=useCallback(async()=>{
    setRefreshing(true)
    try{
      // sensors/news return plain arrays; the community lists are paginated.
      const [s,n,c,g,f]=await Promise.all([
        apiGet<Sensor[]>('/api/sensors'),
        apiGet<NewsItem[]>('/api/news'),
        apiGet<Page<Campaign>>('/api/campaigns?limit=50'),
        apiGet<Page<Group>>('/api/groups?limit=50'),
        apiGet<Page<Fundraiser>>('/api/fundraisers?limit=50'),
      ])
      setSensors(s); setNews(n); setCampaigns(c.items); setGroups(g.items); setFundraisers(f.items)
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
    } else if(type==='campaign:new'||type==='group:new'){
      load()
    } else if(type==='alert:new'){
      const a=payload as {message:string}
      setToast({msg:a.message,type:'err'})
    }
  })

  const showToast=(msg:string,type:'ok'|'err'|'info')=>setToast({msg,type})

  const nav=[
    {k:'overview',l:'Overview',i:<LayoutDashboard size={15}/>},
    {k:'sensors',l:'Sensors',i:<Radio size={15}/>,c:sensors.length},
    {k:'analytics',l:'Analytics',i:<BarChart3 size={15}/>},
    {k:'news',l:'News',i:<Newspaper size={15}/>,c:news.length},
    {k:'campaigns',l:'Campaigns',i:<Megaphone size={15}/>,c:campaigns.length},
    {k:'groups',l:'Groups',i:<Users size={15}/>,c:groups.length},
    {k:'fundraisers',l:'Fundraisers',i:<HeartHandshake size={15}/>,c:fundraisers.length},
  ]

  const roleColor:Record<string,string>={admin:'#FF453A',analyst:'#6C8CFF',public:'#30D158',technician:'#FF5C7A'}
  const rc=roleColor[user.role]||'#7B5CFF'

  return <div style={{display:'flex',minHeight:'100vh',position:'relative'}}>
    <div className="noise"/><div className="glow-orb orb1"/><div className="glow-orb orb2"/><div className="glow-orb orb3"/>

    {/* Sidebar */}
    <aside style={{width:sideOpen?220:58,flexShrink:0,position:'sticky',top:0,height:'100vh',background:'linear-gradient(180deg,rgba(255,255,255,0.022),rgba(255,255,255,0.006))',backdropFilter:'blur(44px) saturate(190%)',WebkitBackdropFilter:'blur(44px) saturate(190%)',borderRight:'1px solid rgba(255,255,255,0.055)',display:'flex',flexDirection:'column',zIndex:10,transition:'width .22s ease'}}>
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
          {sideOpen&&<><span style={{flex:1}}>{n.l}</span>{n.c!=null&&<span className="val" style={{fontSize:10,color:'var(--tx3)',background:'rgba(123,92,255,0.07)',padding:'1px 6px',borderRadius:10}}>{n.c}</span>}</>}
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
      {/* Header */}
      <header style={{padding:'14px 26px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--b1)',background:'linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008))',backdropFilter:'blur(44px) saturate(190%)',WebkitBackdropFilter:'blur(44px) saturate(190%)',flexShrink:0,position:'sticky',top:0,zIndex:50}}>
        <div>
          <h1 style={{fontSize:15.5,fontWeight:700,fontFamily:'inherit'}}>{nav.find(n=>n.k===tab)?.l}</h1>
          <p className="val" style={{fontSize:11,color:'var(--tx3)',marginTop:1}}>{format(new Date(),'EEEE, MMMM d · HH:mm')}</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span className="dot dot-green"/>
            <span className="val" style={{fontSize:11,color:'rgba(123,92,255,0.7)'}}>LIVE</span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={load} disabled={refreshing} style={{display:'flex',alignItems:'center',gap:5}}>
            <RefreshCw size={12} style={{animation:refreshing?'spin 1s linear infinite':'none'}}/>{refreshing?'Syncing':'Refresh'}
          </button>
        </div>
      </header>

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',padding:'22px 26px'}}>
        {tab==='overview'&&<Overview sensors={sensors}/>}
        {tab==='sensors'&&<Sensors sensors={sensors} onRefresh={load}/>}
        {tab==='analytics'&&<Analytics sensors={sensors}/>}
        {tab==='news'&&<NewsTab news={news}/>}
        {tab==='campaigns'&&<CampaignsTab campaigns={campaigns} user={user} onRefresh={load}/>}
        {tab==='groups'&&<GroupsTab groups={groups} user={user} onRefresh={load}/>}
        {tab==='fundraisers'&&<FundraisersTab fundraisers={fundraisers} user={user} onRefresh={load} onToast={showToast}/>}
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
