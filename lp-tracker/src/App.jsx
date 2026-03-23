import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

const SHEET_ID = "1G_eHRjUCxoCDcrNM6TxIuOWecJ4f4CeqUvVUnWRChjA";
const POSITIONS_TAB = "Open Positions";

const FALLBACK_POOLS = [
  { name:"WETH/USDT (0.3%)",    chain:"Eth / Uniswap V3",  token:"ethereum", label:"ETH", deposited:977.38,  currentVal:976.256,  collectedFees:39.954, pendingFees:1.075, entryDate:"2026-02-25", rangeLow:1800.87, rangeHigh:2612.36 },
  { name:"WETH/USDC (0.3%)",    chain:"Base / Uniswap V3", token:"ethereum", label:"ETH", deposited:600.00,  currentVal:604.257,  collectedFees:15.21,  pendingFees:0.536, entryDate:"2026-02-28", rangeLow:1408.16, rangeHigh:2156.02 },
  { name:"WBTC/USDC (0.3%)",    chain:"Eth / Uniswap V3",  token:"bitcoin",  label:"BTC", deposited:1013.33, currentVal:1005.27,  collectedFees:22.424, pendingFees:0.501, entryDate:"2026-02-25", rangeLow:55428.78,rangeHigh:83854.10 },
  { name:"USDC/CBBTC (0.033%)", chain:"Base / Aerodrome",  token:"bitcoin",  label:"BTC", deposited:979.94,  currentVal:975.103,  collectedFees:29.276, pendingFees:0.94,  entryDate:"2026-02-25", rangeLow:63249.83,rangeHigh:74969.69 },
  { name:"SUI/USDC (0.25%)",    chain:"SUI / Cetus",       token:"sui",      label:"SUI", deposited:213.63,  currentVal:206.26,   collectedFees:0,      pendingFees:4.31,  entryDate:"2026-03-03", rangeLow:0.5804,  rangeHigh:1.3938  },
  { name:"SOL/USDC (0.04%)",    chain:"SOL / Orca",        token:"solana",   label:"SOL", deposited:73.23,   currentVal:73.31,    collectedFees:0,      pendingFees:1.24,  entryDate:"2026-03-03", rangeLow:58.998,  rangeHigh:107.03  },
];

const RANGE_MAP = {
  "WETH/USDT (0.3%)":    { rangeLow:1800.87, rangeHigh:2612.36, token:"ethereum", label:"ETH" },
  "WETH/USDC (0.3%)":    { rangeLow:1408.16, rangeHigh:2156.02, token:"ethereum", label:"ETH" },
  "WBTC/USDC (0.3%)":    { rangeLow:55428.78,rangeHigh:83854.10,token:"bitcoin",  label:"BTC" },
  "USDC/CBBTC (0.033%)": { rangeLow:63249.83,rangeHigh:74969.69,token:"bitcoin",  label:"BTC" },
  "SUI/USDC (0.25%)":    { rangeLow:0.5804,  rangeHigh:1.3938,  token:"sui",      label:"SUI" },
  "SOL/USDC (0.04%)":    { rangeLow:58.998,  rangeHigh:107.03,  token:"solana",   label:"SOL" },
};

const GOLD   = "#F0B90B";
const COLORS = ["#F0B90B","#1D9E75","#378ADD","#7F77DD","#D85A30","#3B8BD4"];

const f$    = v => "$" + Number(v).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
const fBig  = v => "$" + Number(v).toLocaleString("en-US", {minimumFractionDigits:0, maximumFractionDigits:0});
const fPct  = (v, sign=true) => (sign&&v>=0?"+":"") + (v*100).toFixed(2)+"%";
const fApr  = v => (v*100).toFixed(1)+"%";
const fDays = d => Math.max(Math.floor((Date.now()-new Date(d))/86400000), 1);

function nearEdgePct(price, low, high) {
  if (price < low || price > high) return 0;
  return Math.min((price-low)/(high-low), (high-price)/(high-low));
}

function parseGSheetResponse(raw) {
  try {
    const json = raw.replace(/^[^(]*\(/, "").replace(/\);?\s*$/, "");
    return JSON.parse(json);
  } catch { return null; }
}

function parseOpenPositions(data) {
  const rows = data?.table?.rows ?? [];
  const pools = [];
  for (const row of rows) {
    const c = row.c ?? [];
    const name = c[0]?.v ?? "";
    if (!name || !name.includes("/") || name.toUpperCase().includes("TOTAL")) continue;
    const chain         = c[1]?.v ?? "";
    const entryDateRaw  = c[2]?.v ?? null;
    const deposited     = Number(c[4]?.v ?? 0);
    const currentVal    = Number(c[5]?.v ?? deposited);
    const pendingFees   = Number(c[7]?.v ?? 0);
    const collectedFees = Number(c[8]?.v ?? 0);
    let entryDate = "2026-02-25";
    if (entryDateRaw) {
      if (typeof entryDateRaw === "string" && entryDateRaw.startsWith("Date(")) {
        const parts = entryDateRaw.replace("Date(","").replace(")","").split(",").map(Number);
        entryDate = `${parts[0]}-${String(parts[1]+1).padStart(2,"0")}-${String(parts[2]).padStart(2,"0")}`;
      } else if (typeof entryDateRaw === "number") {
        const d = new Date((entryDateRaw - 25569) * 86400 * 1000);
        entryDate = d.toISOString().split("T")[0];
      }
    }
    const meta = RANGE_MAP[name] ?? { rangeLow:0, rangeHigh:999999, token:"ethereum", label:"ETH" };
    pools.push({ name, chain, entryDate, deposited, currentVal, collectedFees, pendingFees, ...meta });
  }
  return pools.length > 0 ? pools : null;
}

export default function App() {
  const [prices,      setPrices]      = useState(null);
  const [pools,       setPools]       = useState(FALLBACK_POOLS);
  const [sheetStatus, setSheetStatus] = useState("loading");
  const [priceStatus, setPriceStatus] = useState("loading");
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [tab,         setTab]         = useState("overview");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchSheetData = useCallback(async () => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(POSITIONS_TAB)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error("Sheet fetch failed");
      const raw  = await res.text();
      const data = parseGSheetResponse(raw);
      const parsed = parseOpenPositions(data);
      if (parsed) { setPools(parsed); setSheetStatus("live"); setLastUpdate(new Date()); }
      else throw new Error("No pool data");
    } catch { setSheetStatus("fallback"); setPools(FALLBACK_POOLS); }
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,sui,solana&vs_currencies=usd&include_24hr_change=true",
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data?.bitcoin?.usd) throw new Error();
      setPrices(data); setPriceStatus("live");
    } catch { setPriceStatus("fallback"); }
  }, []);

  useEffect(() => { fetchSheetData(); fetchPrices(); }, [fetchSheetData, fetchPrices]);

  useEffect(() => {
    if (!autoRefresh) return;
    const st = setInterval(fetchSheetData, 5*60*1000);
    const pt = setInterval(fetchPrices,    60*1000);
    return () => { clearInterval(st); clearInterval(pt); };
  }, [autoRefresh, fetchSheetData, fetchPrices]);

  const ep = pools.map(p => {
    const livePrice = prices?.[p.token]?.usd ?? null;
    const change24h = prices?.[p.token]?.usd_24h_change ?? 0;
    const days      = fDays(p.entryDate);
    const totalFees = p.collectedFees + p.pendingFees;
    const priceDiff = p.currentVal - p.deposited;
    const totalPL   = priceDiff + totalFees;
    const roi       = totalPL / p.deposited;
    const dailyFees = totalFees / days;
    const apr       = (dailyFees / p.deposited) * 365;
    const inRange   = livePrice ? (livePrice >= p.rangeLow && livePrice <= p.rangeHigh) : null;
    const rangePos  = livePrice ? Math.min(100, Math.max(0, ((livePrice-p.rangeLow)/(p.rangeHigh-p.rangeLow))*100)) : 50;
    const nearEdge  = inRange && nearEdgePct(livePrice, p.rangeLow, p.rangeHigh) < 0.08;
    const verdict   = days<14?"🆕 New pool":totalPL<0?"❌ In the red":roi>=0.08?"🚀 Top performer":roi>=0.04?"✅ Solid":roi>=0.01?"⚠️ Watch":"✅ Active";
    return { ...p, livePrice, change24h, days, totalFees, priceDiff, totalPL, roi, dailyFees, apr, inRange, rangePos, nearEdge, verdict };
  });

  const tDep   = ep.reduce((s,p)=>s+p.deposited,0);
  const tCurr  = ep.reduce((s,p)=>s+p.currentVal,0);
  const tPL    = ep.reduce((s,p)=>s+p.totalPL,0);
  const tFees  = ep.reduce((s,p)=>s+p.totalFees,0);
  const tDaily = ep.reduce((s,p)=>s+p.dailyFees,0);
  const oROI   = tPL/tDep;
  const inRng  = ep.filter(p=>p.inRange===true).length;
  const warnCt = ep.filter(p=>p.nearEdge||p.inRange===false).length;
  const tix    = [...new Map(pools.map(p=>[p.token,p.label])).entries()];
  const TABS   = [["overview","Overview"],["positions","Positions"],["ranges","Ranges"],["projections","Projections"]];

  if (sheetStatus==="loading"&&priceStatus==="loading") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0D1117",fontFamily:"Arial,sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>💧</div>
        <div style={{color:GOLD,fontSize:14,fontWeight:700}}>Loading your LP data...</div>
        <div style={{color:"#6C757D",fontSize:11,marginTop:8}}>Connecting to Google Sheets & CoinGecko</div>
      </div>
    </div>
  );

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:"#0D1117",minHeight:"100vh",color:"#fff"}}>
      {/* Header */}
      <div style={{background:"#0D1117",borderBottom:"1px solid #1E2A3A",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
        <div>
          <span style={{fontSize:16,fontWeight:700,color:GOLD}}>💧 Scott's LP Tracker</span>
          <div style={{display:"flex",gap:10,marginTop:2}}>
            <span style={{fontSize:9,color:sheetStatus==="live"?"#1D9E75":"#E24B4A"}}>
              {sheetStatus==="live"?`📊 Sheets live · ${lastUpdate?.toLocaleTimeString()}`:"📊 Using cached data"}
            </span>
            <span style={{fontSize:9,color:priceStatus==="live"?"#1D9E75":"#6C757D"}}>
              {priceStatus==="live"?"💰 Prices live":"💰 Prices unavailable"}
            </span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {warnCt>0&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:"#3D2A00",color:GOLD,fontWeight:600}}>⚠️ {warnCt} need attention</span>}
          {priceStatus==="live"&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:inRng===6?"#0F3D2A":inRng>=4?"#2D2000":"#3D1515",color:inRng===6?"#1D9E75":inRng>=4?GOLD:"#E24B4A"}}>{inRng}/6 in range</span>}
          <button onClick={()=>{fetchSheetData();fetchPrices();}} style={{padding:"5px 12px",borderRadius:5,border:"1px solid #2D3F55",background:"transparent",color:"#aaa",fontSize:11,cursor:"pointer"}}>↻ Refresh</button>
          <label style={{fontSize:10,color:"#6C757D",display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)} style={{accentColor:GOLD}}/> Auto
          </label>
        </div>
      </div>

      {/* Price ticker */}
      <div style={{background:"#111820",borderBottom:"1px solid #1E2A3A",padding:"8px 20px",display:"flex",gap:24,overflowX:"auto"}}>
        {tix.map(([id,label])=>{
          const d=prices?.[id];
          return (
            <div key={id} style={{display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap"}}>
              <span style={{fontSize:11,fontWeight:700,color:"#6C757D"}}>{label}</span>
              <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>{d?f$(d.usd):"—"}</span>
              {d&&priceStatus==="live"&&<span style={{fontSize:10,color:d.usd_24h_change>=0?"#1D9E75":"#E24B4A"}}>{d.usd_24h_change>=0?"▲":"▼"}{Math.abs(d.usd_24h_change).toFixed(2)}%</span>}
            </div>
          );
        })}
        {sheetStatus==="live"&&<span style={{fontSize:9,color:"#6C757D",marginLeft:"auto",alignSelf:"center",whiteSpace:"nowrap"}}>Data from Google Sheets · auto-refreshes every 5 min</span>}
      </div>

      {/* Tabs */}
      <div style={{padding:"10px 20px 0",display:"flex",gap:4,borderBottom:"1px solid #1E2A3A"}}>
        {TABS.map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"6px 16px",borderRadius:"6px 6px 0 0",border:`1px solid ${tab===t?"#2D3F55":"#1E2A3A"}`,borderBottom:`1px solid ${tab===t?"#0D1117":"#1E2A3A"}`,background:tab===t?"#0D1117":"#111820",color:tab===t?GOLD:"#6C757D",fontSize:12,fontWeight:tab===t?700:400,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      <div style={{padding:"16px 20px",maxWidth:1200,margin:"0 auto"}}>

        {/* OVERVIEW */}
        {tab==="overview"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
            {[{l:"Total Deposited",v:f$(tDep),c:"#aaa"},{l:"Current Value",v:f$(tCurr),c:"#1D9E75"},{l:"Total P&L",v:(tPL>=0?"+":"")+f$(tPL),c:tPL>=0?"#1D9E75":"#E24B4A"},{l:"Fees Earned",v:f$(tFees),c:GOLD},{l:"Overall ROI",v:fPct(oROI),c:oROI>=0?"#1D9E75":"#E24B4A"}].map(c=>(
              <div key={c.l} style={{background:"#1A2332",borderRadius:10,padding:"12px 14px",border:"0.5px solid #2D3F55"}}>
                <div style={{fontSize:10,color:"#6C757D",marginBottom:4}}>{c.l}</div>
                <div style={{fontSize:17,fontWeight:700,color:c.c}}>{c.v}</div>
              </div>
            ))}
          </div>
          {ep.filter(p=>p.inRange===false||p.nearEdge).length>0&&(
            <div style={{background:"#2D1A00",border:"1px solid #F0B90B44",borderRadius:8,padding:"10px 16px",marginBottom:12,fontSize:12}}>
              <span style={{color:GOLD,fontWeight:700}}>⚠️ </span>
              {ep.filter(p=>p.inRange===false).map(p=><span key={p.name} style={{color:"#E24B4A",marginRight:16}}>{p.name} — OUT OF RANGE</span>)}
              {ep.filter(p=>p.nearEdge).map(p=><span key={p.name} style={{color:GOLD,marginRight:16}}>{p.name} — near boundary</span>)}
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:12,marginBottom:14}}>
            <div style={{background:"#1A2332",borderRadius:10,padding:"14px",border:"0.5px solid #2D3F55"}}>
              <div style={{fontSize:10,color:"#6C757D",marginBottom:10,fontWeight:600}}>P&L per pool</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={ep.map(p=>({name:p.name.split("/")[0],pl:parseFloat(p.totalPL.toFixed(2))}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A"/>
                  <XAxis dataKey="name" tick={{fontSize:10,fill:"#6C757D"}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9,fill:"#6C757D"}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v}/>
                  <Tooltip contentStyle={{background:"#1A2332",border:"1px solid #2D3F55",borderRadius:6,fontSize:11}} formatter={v=>f$(v)}/>
                  <Bar dataKey="pl" radius={[4,4,0,0]}>{ep.map((_,i)=><Cell key={i} fill={COLORS[i]}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:"#1A2332",borderRadius:10,padding:"14px",border:"0.5px solid #2D3F55"}}>
              <div style={{fontSize:10,color:"#6C757D",marginBottom:8,fontWeight:600}}>Capital split</div>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={ep.map(p=>({name:p.name,value:p.deposited}))} cx="50%" cy="50%" innerRadius={32} outerRadius={58} dataKey="value" paddingAngle={2}>
                    {ep.map((_,i)=><Cell key={i} fill={COLORS[i]}/>)}
                  </Pie>
                  <Tooltip contentStyle={{background:"#1A2332",border:"1px solid #2D3F55",borderRadius:6,fontSize:10}} formatter={v=>f$(v)}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px 8px",marginTop:6}}>
                {ep.map((p,i)=><span key={i} style={{fontSize:9,color:"#6C757D",display:"flex",alignItems:"center",gap:3}}><span style={{width:7,height:7,borderRadius:1,background:COLORS[i],display:"inline-block"}}/>{p.name.split("/")[0]}</span>)}
              </div>
            </div>
          </div>
          <div style={{background:"#1A2332",borderRadius:10,border:"0.5px solid #2D3F55",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:"1.8fr 1.3fr 1fr 1fr 1fr 1fr 1fr 80px",padding:"8px 14px",borderBottom:"1px solid #2D3F55"}}>
              {["Pool","Chain","Price","24h","Deposited","P&L","ROI","Range"].map(h=><div key={h} style={{fontSize:10,color:"#6C757D",fontWeight:600}}>{h}</div>)}
            </div>
            {ep.map((p,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"1.8fr 1.3fr 1fr 1fr 1fr 1fr 1fr 80px",padding:"10px 14px",borderBottom:i<ep.length-1?"1px solid #0D1117":"none",background:i%2===0?"#1A2332":"#162030"}}>
                <div style={{fontSize:12,fontWeight:700,color:COLORS[i]}}>{p.name}</div>
                <div style={{fontSize:11,color:"#6C757D"}}>{p.chain}</div>
                <div style={{fontSize:12,fontWeight:600,color:"#fff"}}>{p.livePrice?f$(p.livePrice):"—"}</div>
                <div style={{fontSize:11,color:p.change24h>=0?"#1D9E75":"#E24B4A"}}>{priceStatus==="live"?(p.change24h>=0?"▲":"▼")+Math.abs(p.change24h).toFixed(1)+"%":"—"}</div>
                <div style={{fontSize:11,color:"#aaa"}}>{f$(p.deposited)}</div>
                <div style={{fontSize:12,fontWeight:600,color:p.totalPL>=0?"#1D9E75":"#E24B4A"}}>{p.totalPL>=0?"+":""}{f$(p.totalPL)}</div>
                <div style={{fontSize:11,color:p.roi>=0?"#1D9E75":"#E24B4A"}}>{fPct(p.roi)}</div>
                <div style={{textAlign:"center"}}>
                  {p.inRange===null?<span style={{fontSize:9,color:"#6C757D"}}>—</span>:
                  <span style={{padding:"2px 6px",borderRadius:4,fontSize:9,fontWeight:700,background:!p.inRange?"#3D1515":p.nearEdge?"#3D2A00":"#0F3D2A",color:!p.inRange?"#E24B4A":p.nearEdge?GOLD:"#1D9E75"}}>
                    {!p.inRange?"✗ OUT":p.nearEdge?"⚠ EDGE":"✓ IN"}
                  </span>}
                </div>
              </div>
            ))}
          </div>
        </>}

        {/* POSITIONS */}
        {tab==="positions"&&ep.map((p,i)=>(
          <div key={i} style={{background:"#1A2332",borderRadius:10,padding:"16px",marginBottom:12,border:`0.5px solid ${p.totalPL<0?"#E24B4A55":p.nearEdge?"#F0B90B55":COLORS[i]+"55"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:COLORS[i]}}>{p.name}</div>
                <div style={{fontSize:11,color:"#6C757D"}}>{p.chain} · Opened {p.entryDate} · {p.days} days open</div>
                <div style={{marginTop:4}}><span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"#1E2A3A",color:"#aaa"}}>{p.verdict}</span></div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:17,fontWeight:700,color:p.totalPL>=0?"#1D9E75":"#E24B4A"}}>{p.totalPL>=0?"+":""}{f$(p.totalPL)}</div>
                <div style={{fontSize:10,color:"#6C757D"}}>{fPct(p.roi)} ROI · {fApr(p.apr)} APR/yr</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:p.livePrice?14:0}}>
              {[["Deposited",f$(p.deposited),"#aaa"],["Live Price",p.livePrice?f$(p.livePrice):"—","#fff"],["Current Val",f$(p.currentVal),"#1D9E75"],["Fees Earned",f$(p.totalFees),GOLD],["Daily Fees",f$(p.dailyFees),"#378ADD"],["Price Diff",(p.priceDiff>=0?"+":"")+f$(p.priceDiff),p.priceDiff>=0?"#1D9E75":"#E24B4A"]].map(([l,v,c])=>(
                <div key={l} style={{background:"#0D1117",borderRadius:6,padding:"9px 11px"}}>
                  <div style={{fontSize:9,color:"#6C757D"}}>{l}</div>
                  <div style={{fontSize:12,fontWeight:600,color:c,marginTop:2}}>{v}</div>
                </div>
              ))}
            </div>
            {p.livePrice&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:10,color:"#6C757D"}}>Low: {f$(p.rangeLow)}</span>
                  <span style={{fontSize:10,fontWeight:600,color:!p.inRange?"#E24B4A":p.nearEdge?GOLD:"#1D9E75"}}>{!p.inRange?"✗ Out of range":p.nearEdge?`⚠️ Near boundary — ${p.rangePos.toFixed(0)}% through`:`✓ In range — ${p.rangePos.toFixed(0)}% through`}</span>
                  <span style={{fontSize:10,color:"#6C757D"}}>High: {f$(p.rangeHigh)}</span>
                </div>
                <div style={{position:"relative",height:10,background:"#0D1117",borderRadius:5}}>
                  <div style={{position:"absolute",inset:0,borderRadius:5,background:COLORS[i]+"22"}}/>
                  {p.inRange&&<div style={{position:"absolute",top:0,left:0,height:"100%",width:`${p.rangePos}%`,borderRadius:5,background:p.nearEdge?GOLD+"66":COLORS[i]+"77"}}/>}
                  <div style={{position:"absolute",top:-2,left:`${Math.min(97,Math.max(3,p.rangePos))}%`,transform:"translateX(-50%)",width:4,height:14,borderRadius:2,background:!p.inRange?"#E24B4A":p.nearEdge?GOLD:COLORS[i],boxShadow:`0 0 8px ${!p.inRange?"#E24B4A":p.nearEdge?GOLD:COLORS[i]}`}}/>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* RANGES */}
        {tab==="ranges"&&<>
          {priceStatus!=="live"&&<div style={{background:"#1A2332",borderRadius:8,padding:"12px 16px",marginBottom:12,fontSize:11,color:"#6C757D",border:"0.5px solid #2D3F55"}}>Live prices unavailable — range indicators require CoinGecko. Try refreshing.</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
            {[{l:"In range",v:priceStatus==="live"?`${inRng}/6`:"—",c:inRng===6?"#1D9E75":inRng>=4?GOLD:"#E24B4A"},{l:"Need attention",v:`${warnCt}`,c:warnCt>0?GOLD:"#1D9E75"},{l:"Daily fees",v:f$(tDaily),c:GOLD}].map(c=>(
              <div key={c.l} style={{background:"#1A2332",borderRadius:10,padding:"12px 14px",border:"0.5px solid #2D3F55",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#6C757D",marginBottom:4}}>{c.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:c.c}}>{c.v}</div>
              </div>
            ))}
          </div>
          {ep.map((p,i)=>{
            const oL=p.livePrice&&p.livePrice<p.rangeLow, oR=p.livePrice&&p.livePrice>p.rangeHigh;
            const dP=p.inRange?Math.min((p.livePrice-p.rangeLow),(p.rangeHigh-p.livePrice))/(p.rangeHigh-p.rangeLow)*100:0;
            return (
              <div key={i} style={{background:"#1A2332",borderRadius:10,padding:"16px",marginBottom:10,border:`0.5px solid ${!p.inRange&&p.inRange!==null?"#3D1515":p.nearEdge?"#3D2A00":"#2D3F55"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div><span style={{fontSize:13,fontWeight:700,color:COLORS[i]}}>{p.name}</span><span style={{fontSize:11,color:"#6C757D",marginLeft:10}}>{p.label}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{p.livePrice?f$(p.livePrice):"—"}</div>
                      {priceStatus==="live"&&<div style={{fontSize:10,color:p.change24h>=0?"#1D9E75":"#E24B4A"}}>{p.change24h>=0?"▲":"▼"}{Math.abs(p.change24h).toFixed(2)}% 24h</div>}
                    </div>
                    {p.inRange!==null&&<span style={{padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:700,background:!p.inRange?"#3D1515":p.nearEdge?"#3D2A00":"#0F3D2A",color:!p.inRange?"#E24B4A":p.nearEdge?GOLD:"#1D9E75"}}>{!p.inRange?"OUT OF RANGE":p.nearEdge?"⚠ NEAR EDGE":"IN RANGE"}</span>}
                  </div>
                </div>
                <div style={{position:"relative",height:28,marginBottom:10}}>
                  <div style={{position:"absolute",top:10,left:0,right:0,height:8,background:"#0D1117",borderRadius:4}}/>
                  <div style={{position:"absolute",top:10,left:0,right:0,height:8,background:COLORS[i]+"22",borderRadius:4}}/>
                  {p.inRange&&<div style={{position:"absolute",top:10,left:0,width:`${p.rangePos}%`,height:8,background:p.nearEdge?GOLD+"66":COLORS[i]+"88",borderRadius:4}}/>}
                  <div style={{position:"absolute",top:6,left:`${Math.min(97,Math.max(3,p.rangePos))}%`,transform:"translateX(-50%)",width:4,height:16,borderRadius:2,background:!p.inRange&&p.inRange!==null?"#E24B4A":p.nearEdge?GOLD:COLORS[i],boxShadow:`0 0 10px ${!p.inRange&&p.inRange!==null?"#E24B4A":p.nearEdge?GOLD:COLORS[i]}`}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10}}>
                  <span style={{color:oL?"#E24B4A":"#6C757D"}}>Low: {f$(p.rangeLow)}</span>
                  <span style={{color:!p.inRange&&p.inRange!==null?"#E24B4A":p.nearEdge?GOLD:"#6C757D"}}>{p.inRange===null?"Prices unavailable":!p.inRange?oL?"⚠️ Below — rebalance":"⚠️ Above — rebalance":p.nearEdge?`⚠️ ${dP.toFixed(1)}% from boundary`:`${p.rangePos.toFixed(1)}% through range`}</span>
                  <span style={{color:oR?"#E24B4A":"#6C757D"}}>High: {f$(p.rangeHigh)}</span>
                </div>
              </div>
            );
          })}
        </>}

        {/* PROJECTIONS */}
        {tab==="projections"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14}}>
            {[7,14,30,60,90].map(d=>(
              <div key={d} style={{background:"#1A2332",borderRadius:10,padding:"12px 14px",border:"0.5px solid #2D3F55",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#6C757D",marginBottom:4}}>{d===7?"1 week":d===14?"2 weeks":d===30?"1 month":d===60?"2 months":"3 months"}</div>
                <div style={{fontSize:15,fontWeight:700,color:"#1D9E75"}}>{f$(tCurr+tDaily*d)}</div>
                <div style={{fontSize:10,color:GOLD,marginTop:3}}>+{f$(tDaily*d)} fees</div>
              </div>
            ))}
          </div>
          <div style={{background:"#1A2332",borderRadius:10,padding:"14px",border:"0.5px solid #2D3F55",marginBottom:14}}>
            <div style={{fontSize:10,color:"#6C757D",marginBottom:10,fontWeight:600}}>30-day fee projection per pool</div>
            <ResponsiveContainer width="100%" height={165}>
              <BarChart data={ep.map(p=>({name:p.name.split("/")[0],current:parseFloat(p.totalFees.toFixed(2)),proj:parseFloat((p.totalFees+p.dailyFees*30).toFixed(2))}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3A"/>
                <XAxis dataKey="name" tick={{fontSize:10,fill:"#6C757D"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:9,fill:"#6C757D"}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v}/>
                <Tooltip contentStyle={{background:"#1A2332",border:"1px solid #2D3F55",borderRadius:6,fontSize:11}} formatter={v=>f$(v)}/>
                <Bar dataKey="current" fill="#2D3F55" radius={[3,3,0,0]} name="Current"/>
                <Bar dataKey="proj"    fill={GOLD}    radius={[3,3,0,0]} name="30d projected"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{background:"#162030",borderRadius:10,padding:"16px",border:"1px solid #F0B90B33"}}>
            <div style={{fontSize:12,fontWeight:700,color:GOLD,marginBottom:12}}>🎯 North star — capital needed to hit monthly targets</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[500,1000,3000,5000,10000].map(target=>{
                const rate=tDaily*30/tDep, needed=rate>0?target/rate:0, gap=needed-tDep;
                return (
                  <div key={target} style={{background:"#0D1117",borderRadius:8,padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:"#6C757D"}}>{fBig(target)}/month</div>
                    <div style={{fontSize:16,fontWeight:700,color:"#fff",marginTop:3}}>{fBig(needed)}</div>
                    <div style={{fontSize:10,color:gap<=0?"#1D9E75":"#6C757D",marginTop:3}}>{gap<=0?"✓ Already there":`${fBig(gap)} more to deploy`}</div>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #2D3F55",fontSize:10,color:"#6C757D"}}>
              {sheetStatus==="live"?`Live from Google Sheets · ${f$(tDaily)}/day avg · ${f$(tDep)} deployed`:`Cached data · ${f$(tDaily)}/day avg · ${f$(tDep)} deployed`}
            </div>
          </div>
        </>}

      </div>
    </div>
  );
}
