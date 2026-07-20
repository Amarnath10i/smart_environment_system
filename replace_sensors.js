const fs = require('fs');
const content = fs.readFileSync('./components/Dashboard.tsx', 'utf8');

const sensorsStart = content.indexOf('// ─── Sensors ──────────────────────────────────────────────────────────────────');
const analyticsStart = content.indexOf('// ─── Analytics ────────────────────────────────────────────────────────────────');
const endAnalytics = content.indexOf('// ─── News ─────────────────────────────────────────────────────────────────────');

console.log('Sensors:', sensorsStart);
console.log('Analytics:', analyticsStart);
console.log('End Analytics:', endAnalytics);

if (sensorsStart === -1 || analyticsStart === -1 || endAnalytics === -1) {
  console.error('Markers not found');
  process.exit(1);
}

const oldSensors = content.slice(sensorsStart, analyticsStart);
const oldAnalytics = content.slice(analyticsStart, endAnalytics);

console.log('Old sensors length:', oldSensors.length);
console.log('Old analytics length:', oldAnalytics.length);

const newMonitoring = `// ─── Monitoring ────────────────────────────────────────────────────────────────
function Monitoring({sensors,onRefresh}:{sensors:Sensor[];onRefresh:()=>void}) {
  // Group sensors by physical location
  const places = useMemo(()=>{
    const m = new Map<string,{location:string;lat:number|null;lon:number|null;sensors:Sensor[]}>()
    for(const s of sensors){
      if(s.lat==null||s.lon==null) continue
      const cur = m.get(s.location)
      if(!cur) m.set(s.location,{location:s.location,lat:s.lat,lon:s.lon,sensors:[s]})
      else cur.sensors.push(s)
    }
    return [...m.values()].sort((a,b)=>a.location.localeCompare(b.location))
  },[sensors])

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:18}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
      <p className="sec">Monitoring Stations</p>
      <button className="btn btn-ghost btn-sm" onClick={onRefresh}><RefreshCw size={13}/></button>
    </div>

    {!places.length && <p style={{color:'var(--tx3)',textAlign:'center',padding:'50px 0'}}>No sensors with coordinates configured.</p>}

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:14}}>
      {places.map(p=>{
        const active = p.sensors.filter(s=>s.status==='active')
        const freshest = Math.max(...p.sensors.map(s=>new Date(latestOf(s)?.timestamp||0).getTime()))
        return <div key={p.location} className="card" style={{padding:'20px 22px',position:'relative',border:'1px solid rgba(123,92,255,0.08)',background:'linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:44,height:44,borderRadius:12,background:'rgba(123,92,255,0.12)',border:'1px solid rgba(123,92,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',color:'#7B5CFF',flexShrink:0}}><MapPin size={18}/></div>
              <div>
                <p style={{fontSize:14.5,fontWeight:700,lineHeight:1.3}}>{p.location.split(',')[0].trim()}</p>
                <p style={{fontSize:11,color:'var(--tx3)',marginTop:2,display:'flex',alignItems:'center',gap:3}}><MapPin size={9}/>{p.location}</p>
              </div>
            </div>
            <span className={\`badge \${active.length===p.sensors.length?'b-green':'b-amber'}\`}>
              <span className={\`dot \${active.length===p.sensors.length?'dot-green':'dot-amber'}\`}/>
              {active.length}/{p.sensors.length} active
            </span>
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

          {/* Status bar */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.05)'}}>
            <span style={{fontSize:10.5,color:'var(--tx3)',fontFamily:'inherit'}}><Radio size={10} style={{marginRight:4,color:active.length===p.sensors.length?'#30D158':'#FF453A'}}/>{active.length===p.sensors.length?'All sensors reporting':'Some sensors offline'}</span>
            <span style={{fontSize:10.5,color:'var(--tx3)',fontFamily:'inherit'}}>Updated {freshest?format(new Date(freshest),'HH:mm'):'—'}</span>
          </div>
        </div>
      })}
    </div>
  </div>
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function Analytics({sensors}:{sensors:Sensor[]}) {
  // Detailed analytics: per-location trends, statistical summaries, comparison views, anomaly detection.
  
  // Group sensors by location for place-based analysis
  const places = useMemo(()=>{
    const m = new Map<string,{location:string;lat:number|null;lon:number|null;sensors:Sensor[]}>()
    for(const s of sensors){
      if(s.lat==null||s.lon==null) continue
      const cur = m.get(s.location)
      if(!cur) m.set(s.location,{location:s.location,lat:s.lat,lon:s.lon,sensors:[s]})
      else cur.sensors.push(s)
    }
    return [...m.values()].sort((a,b)=>a.location.localeCompare(b.location))
  },[sensors])

  // Per-sensor statistics
  const sensorStats = sensors.map(s=>{
    const vals = s.data.map(d=>d.value)
    if(!vals.length) return {sensor:s,avg:0,min:0,max:0,std:0,count:0,trend:0}
    const avg = vals.reduce((a,b)=>a+b,0)/vals.length
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const std = Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-avg,2),0)/vals.length)
    // Simple linear trend: positive = increasing
    const trend = vals.length > 1 ? (vals[vals.length-1] - vals[0]) / vals.length : 0
    return {sensor:s,avg,min,max,std,count:vals.length,trend}
  })

  // Per-location statistics
  const placeStats = places.map(p=>{
    const allVals = p.sensors.flatMap(s=>s.data.map(d=>d.value))
    if(!allVals.length) return {place:p,avg:0,min:0,max:0,count:0}
    const avg = allVals.reduce((a,b)=>a+b,0)/allVals.length
    const min = Math.min(...allVals)
    const max = Math.max(...allVals)
    return {place:p,avg,min,max,count:allVals.length}
  })

  // Per-type statistics
  const byType = sensors.reduce((acc,s)=>{const t=sLabel(s.type);if(!acc[t])acc[t]=[];acc[t].push(s);return acc},{} as Record<string,Sensor[]>)
  const typeStats = Object.entries(byType).map(([type,slist])=>{const all=slist.flatMap(s=>s.data.map(d=>d.value));if(!all.length)return{type,avg:0,min:0,max:0,count:0};return{type,avg:all.reduce((a,b)=>a+b,0)/all.length,min:Math.min(...all),max:Math.max(...all),count:all.length,sensors:slist.length}})

  return <div className="anim-up" style={{display:'flex',flexDirection:'column',gap:18}}>
    <p className="sec">Analytics & Trends</p>

    {/* Summary Cards */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(123,92,255,0.1)',background:'linear-gradient(135deg,rgba(123,92,255,0.05),rgba(108,140,255,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Total Sensors</p>
        <p className="val" style={{fontSize:28,color:'#7B5CFF'}}>{sensors.length}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{sensors.filter(s=>s.status==='active').length} active</p>
      </div>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(108,140,255,0.1)',background:'linear-gradient(135deg,rgba(108,140,255,0.05),rgba(123,92,255,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Monitoring Locations</p>
        <p className="val" style={{fontSize:28,color:'#6C8CFF'}}>{places.length}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{places.reduce((a,p)=>a+p.sensors.length,0)} sensors</p>
      </div>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(255,92,122,0.1)',background:'linear-gradient(135deg,rgba(255,92,122,0.05),rgba(255,92,122,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Sensor Types</p>
        <p className="val" style={{fontSize:28,color:'#FF5C7A'}}>{Object.keys(byType).length}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{Object.entries(byType).map(([t,arr])=>t+': '+arr.length).join(', ')}</p>
      </div>
      <div className="card" style={{padding:'16px 18px',border:'1px solid rgba(48,209,88,0.1)',background:'linear-gradient(135deg,rgba(48,209,88,0.05),rgba(48,209,88,0.02))'}}>
        <p style={{fontSize:10.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Data Points</p>
        <p className="val" style={{fontSize:28,color:'#30D158'}}>{sensors.reduce((a,s)=>a+s.data.length,0)}</p>
        <p style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>Avg {Math.round(sensors.reduce((a,s)=>a+s.data.length,0)/sensors.length)} per sensor</p>
      </div>
    </div>

    {/* Type-level Overview */}
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

    {/* Detailed per-location charts */}
    <p style={{fontSize:11,color:'var(--tx3)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:10,fontWeight:600}}>Trends by Location</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:14}}>
      {places.map(p=>{
        const c = sColor(p.sensors[0]?.type||'')
        // Combine all sensor readings for this location, sorted by time
        const allPoints = p.sensors.flatMap(s=>s.data.map(d=>({t:format(new Date(d.timestamp),'HH:mm'),v:d.value,type:sLabel(s.type),sensorId:s.id})))
          .sort((a,b)=>a.t.localeCompare(b.t))
        return <div key={p.location} className="card" style={{padding:'18px 18px 10px'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
            <span style={{color:c}}><MapPin size={13}/></span>
            <span style={{fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',color:c}}>{p.location.split(',')[0].trim()}</span>
            <span style={{fontSize:11,color:'var(--tx3)',marginLeft:'auto'}}>{p.sensors.length} sensors · {p.sensors.map(s=>sLabel(s.type)).join(', ')}</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={allPoints}>
              <defs><linearGradient id={\`agLoc\${p.location.replace(/[^a-zA-Z]/g,'')}\`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.2}/><stop offset="100%" stopColor={c} stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="2 3" stroke="rgba(123,92,255,0.05)"/>
              <XAxis dataKey="t" tick={{fontSize:9,fill:'var(--tx3)'}}/>
              <YAxis tick={{fontSize:9,fill:'var(--tx3)'}} width={32}/>
              <Tooltip content={<TTip/>}/>
              <Area type="monotone" dataKey="v" name="Value" stroke={c} strokeWidth={1.8} fill={\`url(#agLoc\${p.location.replace(/[^a-zA-Z]/g,'')})\`} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      })}
    </div>

    {/* Detailed per-sensor statistical table */}
    <div className="card" style={{padding:'18px 20px',overflowX:'auto'}}>
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
              <td style={{padding:'10px 12px'}}><span className={\`badge \${s.status==='active'?'b-green':'b-red'}\`}><span className={\`dot \${s.status==='active'?'dot-green':'dot-red'}\`}/>{s.status}</span></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}`;

const newContent = content.slice(0, sensorsStart) + newMonitoring + newAnalytics + content.slice(endAnalytics);

fs.writeFileSync('./components/Dashboard.tsx', newContent);
console.log('Done writing file - replaced Sensors with Monitoring and enhanced Analytics');