/**
 * fix_dashboard.js
 * 
 * Surgically replaces the old Sensors + Analytics sections in Dashboard.tsx
 * with advanced Monitoring, Analytics, and Alerts tabs.
 * 
 * Strategy:
 *   1. Find the FIRST occurrence of "// ─── Sensors" (line 443)
 *   2. Find "// ─── News" (line 814) — everything between is Sensors+Analytics
 *   3. Splice in the new Monitoring + Analytics + Alerts code
 *   4. Update the Tab type to include 'alerts'
 *   5. Update the nav array to include Alerts
 *   6. Update the routing to wire Sensors→Monitoring, add Alerts tab
 */

const fs = require('fs');
const path = './components/Dashboard.tsx';

let src = fs.readFileSync(path, 'utf8');

// ── Step 1: Locate markers ────────────────────────────────────────────────────
const sensorsMarker = '// ─── Sensors';
const newsMarker    = '// ─── News';

const i1 = src.indexOf(sensorsMarker);
const i2 = src.indexOf(newsMarker);

if (i1 === -1) { console.error('ERROR: Could not find Sensors marker'); process.exit(1); }
if (i2 === -1) { console.error('ERROR: Could not find News marker');    process.exit(1); }

console.log(`Sensors marker at char ${i1}`);
console.log(`News marker at char ${i2}`);
console.log(`Replacing ${i2 - i1} characters of old Sensors+Analytics`);

// ── Step 2: New code to inject ────────────────────────────────────────────────
const NEW_CODE = `// ─── Monitoring ────────────────────────────────────────────────────────────────
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
        {/* Type filter */}
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          <button className={\`btn btn-xs \${filterType==='all'?'btn-green':'btn-ghost'}\`} onClick={()=>setFilterType('all')}>All</button>
          {sensorTypes.map(t=><button key={t} className={\`btn btn-xs \${filterType===t?'btn-green':'btn-ghost'}\`} onClick={()=>setFilterType(t)} style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{color:sColor(t),display:'flex'}}>{sIcon(t)}</span>{sLabel(t)}
          </button>)}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}><RefreshCw size={13}/></button>
      </div>
    </div>

    {/* Compare mode banner */}
    {compare.length>0&&<div className="card" style={{padding:'12px 18px',border:'1px solid rgba(123,92,255,0.25)',background:'linear-gradient(135deg,rgba(123,92,255,0.08),rgba(108,140,255,0.04))'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <span style={{fontSize:12,color:'#7B5CFF',fontWeight:600}}><BarChart3 size={13} style={{marginRight:6}}/>Comparing {compare.length} location{compare.length>1?'s':''}</span>
        <button className="btn btn-ghost btn-xs" onClick={()=>setCompare([])}>Clear Comparison</button>
      </div>
      {comparePlaces.length>=2&&<div style={{marginTop:14}}>
        <div style={{display:'grid',gridTemplateColumns:\`repeat(\${Math.min(comparePlaces.length,4)},1fr)\`,gap:12,marginBottom:12}}>
          {comparePlaces.map(p=><div key={p.location} style={{textAlign:'center'}}>
            <p style={{fontSize:11,fontWeight:700,color:'var(--tx2)',marginBottom:6}}>{p.location.split(',')[0].trim()}</p>
            {p.sensors.map(s=>{const v=latestOf(s)?.value;return <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginBottom:4}}>
              <span style={{color:sColor(s.type),display:'flex'}}>{sIcon(s.type)}</span>
              <span className="val" style={{fontSize:18,color:sColor(s.type)}}>{v!=null?v.toFixed(1):'—'}</span>
              <span style={{fontSize:10,color:'var(--tx3)'}}>{sUnit(s.type)}</span>
            </div>})}
          </div>)}
        </div>
        {/* Comparison chart */}
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

    {/* Station cards */}
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
        return <div key={p.location} className="card" style={{padding:'20px 22px',position:'relative',border:\`1px solid \${isComparing?'rgba(123,92,255,0.35)':'rgba(123,92,255,0.08)'}\`,background:isComparing?'linear-gradient(180deg,rgba(123,92,255,0.06),rgba(123,92,255,0))':'linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:44,height:44,borderRadius:12,background:'rgba(123,92,255,0.12)',border:'1px solid rgba(123,92,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',color:'#7B5CFF',flexShrink:0}}><MapPin size={18}/></div>
              <div>
                <p style={{fontSize:14.5,fontWeight:700,lineHeight:1.3}}>{p.location.split(',')[0].trim()}</p>
                <p style={{fontSize:11,color:'var(--tx3)',marginTop:2,display:'flex',alignItems:'center',gap:3}}><MapPin size={9}/>{p.location}</p>
              </div>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button className={\`btn btn-xs \${isComparing?'btn-green':'btn-ghost'}\`} onClick={()=>toggleCompare(p.location)} title="Add to comparison">
                <BarChart3 size={11}/>
              </button>
              <span className={\`badge \${active.length===p.sensors.length?'b-green':'b-amber'}\`}>
                <span className={\`dot \${active.length===p.sensors.length?'dot-green':'dot-amber'}\`}/>
                {active.length}/{p.sensors.length}
              </span>
            </div>
          </div>

          {/* Sensor readings grid */}
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
                  <span className="val" style={{fontSize:22,fontWeight:600,color:sColor(s.type),textShadow:\`0 0 12px \${sColor(s.type)}55\`}}>{v!=null?v.toFixed(1):'—'}</span>
                  <span style={{fontSize:11,color:'var(--tx3)'}}>{sUnit(s.type)}</span>
                </div>
                <p style={{fontSize:10,color:'var(--tx3)',marginTop:4,fontFamily:'inherit'}}>{ts?format(new Date(ts),'HH:mm'):'No data'}</p>
              </div>
            })}
          </div>

          {/* Mini sparkline for first sensor */}
          {p.sensors[0]?.data?.length>1&&<div style={{marginBottom:10}}>
            <ResponsiveContainer width="100%" height={50}>
              <AreaChart data={[...p.sensors[0].data].reverse().slice(-12).map(d=>({t:format(new Date(d.timestamp),'HH:mm'),v:d.value}))}>
                <defs><linearGradient id={\`spark\${p.location.replace(/[^a-zA-Z0-9]/g,'')}\`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sColor(p.sensors[0].type)} stopOpacity={0.2}/><stop offset="100%" stopColor={sColor(p.sensors[0].type)} stopOpacity={0}/></linearGradient></defs>
                <Area type="monotone" dataKey="v" stroke={sColor(p.sensors[0].type)} strokeWidth={1.5} fill={\`url(#spark\${p.location.replace(/[^a-zA-Z0-9]/g,'')})\`} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>}

          {/* Status bar */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
            <span style={{fontSize:10.5,color:'var(--tx3)',fontFamily:'inherit'}}><Radio size={10} style={{marginRight:4,color:active.length===p.sensors.length?'#30D158':'#FF453A'}}/>{active.length===p.sensors.length?'All reporting':'Some offline'}</span>
            <span style={{fontSize:10.5,color:'var(--tx3)',fontFamily:'inherit'}}>Updated {freshest?format(new Date(freshest),'HH:mm'):'—'}</span>
          </div>
        </div>
      })}
    </div>
  </div>
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function Analytics({sensors}:{sensors:Sensor[]}) {
  const [view, setView] = useState<'overview'|'table'|'compare'>('overview')

  // Group sensors by location
  const places = useMemo(()=>{
    const m = new Map<string,{location:string;lat:number|null;lon:number|null;sensors:Sensor[]}>()
    for(const s of sensors){
      const cur = m.get(s.location)
      if(!cur) m.set(s.location,{location:s.location,lat:s.lat,lon:s.lon,sensors:[s]})
      else cur.sensors.push(s)
    }
    return [...m.values()].sort((a,b)=>a.location.localeCompare(b.location))
  },[sensors])

  // Per-sensor statistics
  const sensorStats = useMemo(()=>sensors.map(s=>{
    const vals = s.data.map(d=>d.value)
    if(!vals.length) return {sensor:s,avg:0,min:0,max:0,std:0,count:0,trend:0,range:0}
    const avg = vals.reduce((a,b)=>a+b,0)/vals.length
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const std = Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-avg,2),0)/vals.length)
    const trend = vals.length > 1 ? (vals[vals.length-1] - vals[0]) / vals.length : 0
    return {sensor:s,avg,min,max,std,count:vals.length,trend,range:max-min}
  }),[sensors])

  // Per-type statistics
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

  // Anomaly detection: values outside 2 standard deviations
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
        <button className={\`btn btn-xs \${view==='overview'?'btn-green':'btn-ghost'}\`} onClick={()=>setView('overview')}>Overview</button>
        <button className={\`btn btn-xs \${view==='table'?'btn-green':'btn-ghost'}\`} onClick={()=>setView('table')}>Data Table</button>
        <button className={\`btn btn-xs \${view==='compare'?'btn-green':'btn-ghost'}\`} onClick={()=>setView('compare')}>Compare</button>
      </div>
    </div>

    {/* Summary Cards — always visible */}
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
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>Values outside 2σ</p>
      </div>}
    </div>

    {/* Anomaly alerts */}
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
      {/* Type-level bar chart */}
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

      {/* Per-location trend charts */}
      <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10,fontWeight:600}}>Trends by Location</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:14}}>
        {places.map(p=>{
          const c = sColor(p.sensors[0]?.type||'')
          const allPoints = p.sensors.flatMap(s=>s.data.map(d=>({t:format(new Date(d.timestamp),'HH:mm'),v:d.value,type:sLabel(s.type)}))).sort((a,b)=>a.t.localeCompare(b.t))
          const gid = \`agLoc\${p.location.replace(/[^a-zA-Z0-9]/g,'')}\`
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
                <Area type="monotone" dataKey="v" name="Value" stroke={c} strokeWidth={1.8} fill={\`url(#\${gid})\`} dot={false}/>
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
            <th style={{padding:'8px 12px',color:'var(--tx3)',fontWeight:600,fontSize:10,textTransform:'uppercase'}}>Range</th>
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
              <td style={{padding:'10px 12px',color:'var(--tx3)'}}>{st.range.toFixed(1)}</td>
              <td style={{padding:'10px 12px',color:'var(--tx3)',fontFamily:'monospace'}}>{st.std.toFixed(2)}</td>
              <td style={{padding:'10px 12px',color:trendColor,fontWeight:600}}>{st.trend>0.01?'↗ Rising':st.trend<-0.01?'↘ Falling':'→ Stable'}</td>
              <td style={{padding:'10px 12px'}}><span className={\`badge \${s.status==='active'?'b-green':'b-red'}\`}><span className={\`dot \${s.status==='active'?'dot-green':'dot-red'}\`}/>{s.status}</span></td>
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

      {/* Location stat cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
        {places.map(p=>{
          const allVals = p.sensors.flatMap(s=>s.data.map(d=>d.value))
          const avg = allVals.length?allVals.reduce((a,b)=>a+b,0)/allVals.length:0
          return <div key={p.location} className="card" style={{padding:'16px 18px'}}>
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
          </div>
        })}
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
      if(latest.value>=t.crit) a.push({id:\`\${s.id}-crit\`,sensor:s,level:'critical',value:latest.value,threshold:t.crit,time:latest.timestamp,message:\`\${sLabel(s.type)} at \${s.location} is \${latest.value}\${sUnit(s.type)} (critical: \${t.crit}\${sUnit(s.type)})\`})
      else if(latest.value>=t.warn) a.push({id:\`\${s.id}-warn\`,sensor:s,level:'warning',value:latest.value,threshold:t.warn,time:latest.timestamp,message:\`\${sLabel(s.type)} at \${s.location} is \${latest.value}\${sUnit(s.type)} (warning: \${t.warn}\${sUnit(s.type)})\`})
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

    {/* Threshold config display */}
    <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(255,165,0,0.12)'}}>
      <p style={{fontSize:11,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10,fontWeight:600}}>Active Thresholds</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
        {[{type:'temperature',warn:35,crit:40,unit:'°C'},{type:'humidity',warn:80,crit:95,unit:'%'},{type:'air_quality',warn:150,crit:200,unit:'AQI'}].map(t=><div key={t.type} style={{padding:'10px 14px',background:'rgba(255,255,255,0.02)',borderRadius:8,border:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
            <span style={{color:sColor(t.type),display:'flex'}}>{sIcon(t.type)}</span>
            <span style={{fontSize:11.5,fontWeight:600,textTransform:'capitalize'}}>{sLabel(t.type)}</span>
          </div>
          <div style={{display:'flex',gap:12,fontSize:11}}>
            <span style={{color:'#FFD60A'}}>⚠ Warning: {t.warn}{t.unit}</span>
            <span style={{color:'#FF453A'}}>🔴 Critical: {t.crit}{t.unit}</span>
          </div>
        </div>)}
      </div>
    </div>

    {/* Alert list */}
    {!allAlerts.length&&<div className="card" style={{padding:'50px 20px',textAlign:'center',borderStyle:'dashed'}}>
      <CheckCircle size={48} style={{color:'#30D158',opacity:0.3,marginBottom:16}}/>
      <p style={{fontSize:15,color:'var(--tx3)',fontWeight:500}}>All Clear</p>
      <p style={{fontSize:13,color:'var(--tx3)',marginTop:4}}>No alerts or threshold violations detected.</p>
    </div>}

    {allAlerts.map(a=>{
      const isC=a.level==='critical'
      const col=isC?'#FF453A':a.level==='warning'?'#FFD60A':'#7B5CFF'
      return <div key={a.id||a.message} className="card" style={{padding:'14px 18px',border:\`1px solid \${col}22\`,background:\`linear-gradient(135deg,\${col}08,transparent)\`}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:\`\${col}16\`,border:\`1px solid \${col}30\`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            {isC?<Zap size={16} color={col}/>:<AlertTriangle size={16} color={col}/>}
          </div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span className={\`badge \${isC?'b-red':'b-amber'}\`} style={{fontSize:9}}>{a.level.toUpperCase()}</span>
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

`;

// ── Step 3: Splice ────────────────────────────────────────────────────────────
src = src.slice(0, i1) + NEW_CODE + src.slice(i2);

// ── Step 4: Update Tab type to include 'alerts' ──────────────────────────────
src = src.replace(
  "type Tab = 'overview'|'sensors'|'analytics'|'news'|'campaigns'|'groups'|'fundraisers'",
  "type Tab = 'overview'|'sensors'|'analytics'|'alerts'|'news'|'campaigns'|'groups'|'fundraisers'"
);

// ── Step 5: Update nav array to include Alerts tab ───────────────────────────
src = src.replace(
  "{k:'analytics',l:'Analytics',i:<BarChart3 size={15}/>},",
  "{k:'analytics',l:'Analytics',i:<BarChart3 size={15}/>},\n    {k:'alerts',l:'Alerts',i:<Bell size={15}/>},"
);

// ── Step 6: Update routing — rename Sensors component, add Alerts ────────────
src = src.replace(
  "{tab==='sensors'&&<Sensors sensors={sensors} onRefresh={()=>load()}/>}",
  "{tab==='sensors'&&<Monitoring sensors={sensors} onRefresh={()=>load()}/>}"
);

// Add the alerts tab routing after analytics
src = src.replace(
  "{tab==='analytics'&&<Analytics sensors={sensors}/>}",
  "{tab==='analytics'&&<Analytics sensors={sensors}/>}\n        {tab==='alerts'&&<AlertsTab sensors={sensors} alerts={[]} onRefresh={()=>load()}/>}"
);

// ── Step 7: Write ─────────────────────────────────────────────────────────────
fs.writeFileSync(path, src, 'utf8');

console.log('✅ Dashboard.tsx updated successfully!');
console.log('   - Old Sensors → New Monitoring (with compare, filter, sparklines)');
console.log('   - Old Analytics → New Analytics (overview/table/compare views, anomaly detection)');
console.log('   - New Alerts tab added (threshold monitoring, alert cards)');
console.log('   - Nav and routing updated');
