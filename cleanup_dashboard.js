const fs = require('fs');

const path = 'components/Dashboard.tsx';
let src = fs.readFileSync(path, 'utf8');

// 1. Remove the old Sensors and Analytics body block that was left behind
const startStr = "  const [locLoading,setLocLoading]=useState(false)";
const endStr = "// ─── News";

const idx1 = src.indexOf(startStr);
const idx2 = src.indexOf(endStr);

if (idx1 !== -1 && idx2 !== -1 && idx1 < idx2) {
  src = src.substring(0, idx1) + src.substring(idx2);
  console.log("Successfully removed old Sensors and Analytics body.");
} else {
  console.log("WARNING: Could not find the old block to remove.");
}

// 2. Add 'alerts' to Tab type if not present
if (src.includes("type Tab = 'overview'|'sensors'|'analytics'|'news'")) {
  src = src.replace(
    "type Tab = 'overview'|'sensors'|'analytics'|'news'", 
    "type Tab = 'overview'|'sensors'|'analytics'|'alerts'|'news'"
  );
}

// 3. Update the nav array
if (!src.includes("l:'Alerts'")) {
  src = src.replace(
    "{k:'analytics',l:'Analytics',i:<BarChart3 size={15}/>},",
    "{k:'analytics',l:'Analytics',i:<BarChart3 size={15}/>},\n    {k:'alerts',l:'Alerts',i:<Bell size={15}/>},"
  );
}

// 4. Update the render logic for the tabs in AppShell
if (!src.includes("tab==='alerts'")) {
  src = src.replace(
    "{tab==='analytics'&&<Analytics sensors={sensors}/>}",
    "{tab==='analytics'&&<Analytics sensors={sensors}/>}\n        {tab==='alerts'&&<AlertsTab sensors={sensors} alerts={[]} onRefresh={()=>load()}/>}"
  );
}

if (src.includes("<Sensors sensors={sensors}")) {
  src = src.replace(
    "{tab==='sensors'&&<Sensors sensors={sensors} onRefresh={()=>load()}/>}",
    "{tab==='sensors'&&<Monitoring sensors={sensors} onRefresh={()=>load()}/>}"
  );
}

fs.writeFileSync(path, src, 'utf8');
console.log("Dashboard.tsx cleaned and updated successfully.");
