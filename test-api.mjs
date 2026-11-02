const base='http://localhost:4000/api';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})}).then(r=>r.json());
const h={authorization:'Bearer '+login.token,'x-company-id':login.companies[0].id};
const paths=['/masters/bootstrap','/reports/dashboard','/reports/daybook','/reports/trial-balance','/reports/profit-loss','/reports/balance-sheet','/reports/stock-summary','/reports/gst-summary','/reports/gstr1','/vouchers?limit=5','/company/meta'];
for(const p of paths){
  const r=await fetch(base+p,{headers:h});
  const data=await r.json();
  let note='';
  if(p.includes('trial-balance')) note=`Dr=${data.totalDr} Cr=${data.totalCr} diff=${data.difference} rows=${data.rows?.length}`;
  else if(p.includes('profit-loss')) note=`gross=${data.grossProfit} net=${data.netProfit}`;
  else if(p.includes('balance-sheet')) note=`assets=${data.totalAssets} liab=${data.totalLiabilities} diff=${data.difference}`;
  else if(p.includes('stock-summary')) note=`items=${data.items?.length} value=${data.totalValue}`;
  else if(p.includes('gst-summary')) note=`out=${data.outward?.total} itc=${data.itc?.total} net=${data.netTax}`;
  else if(p.includes('gstr1')) note=`b2b=${data.b2b?.length} b2c=${data.b2c?.length}`;
  else if(p.includes('bootstrap')) note=`ledgers=${data.ledgers?.length} items=${data.stockItems?.length} godowns=${data.godowns?.length}`;
  else if(p.includes('/vouchers')) note=`count=${data.vouchers?.length}`;
  else if(p.includes('daybook')) note=`vouchers=${data.list?.length}`;
  else if(p.includes('dashboard')) note=`sales=${data.data?.sales?.amount} recv=${data.data?.receivables} cash=${data.data?.cashBank} gst=${data.data?.gstPayable}`;
  else if(p.includes('meta')) note=`vouchers=${data.counts?.vouchers} customers=${data.counts?.customers}`;
  console.log(r.status, p, note);
  if(!r.ok) console.log(JSON.stringify(data).slice(0,500));
}
