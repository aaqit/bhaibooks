const base='http://localhost:4000/api';
async function login(username,password){return fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})}).then(r=>r.json())}
const s=await login('admin','admin123');
const h={authorization:'Bearer '+s.token,'x-company-id':s.companies[0].id,'content-type':'application/json'};
const boot=await fetch(base+'/masters/bootstrap',{headers:h}).then(r=>r.json());
const rajesh=boot.ledgers.find(l=>l.name==='Rajesh Textiles');
const cotton=boot.stockItems.find(l=>l.name==='Cotton Saree');
const cash=boot.ledgers.find(l=>l.name==='Cash');
const sales=boot.ledgers.find(l=>l.name==='Sales');
console.log('dashboard', JSON.stringify((await fetch(base+'/reports/dashboard',{headers:h}).then(r=>r.json())).data).slice(0,500));
// create sale
let r=await fetch(base+'/vouchers',{method:'POST',headers:h,body:JSON.stringify({type:'SALES',date:new Date().toISOString().slice(0,10),party_ledger_id:rajesh.id,narration:'API test sale',items:[{stock_item_id:cotton.id,qty:2,rate:900,gst_rate:5}]})});
let v=await r.json();
console.log('create sale',r.status,v.message||v.error, v.voucher?.total, v.voucher?.entries?.map(e=>e.ledger_name+':'+e.entry_type+':'+e.amount).join(' | '));
// create journal
r=await fetch(base+'/vouchers',{method:'POST',headers:h,body:JSON.stringify({type:'JOURNAL',date:new Date().toISOString().slice(0,10),narration:'test journal',entries:[{ledger_id:cash.id,entry_type:'Dr',amount:100},{ledger_id:sales.id,entry_type:'Cr',amount:100}]})});
let j=await r.json();
console.log('create journal',r.status,j.message||j.error,j.voucher?.total);
// ledger statement
r=await fetch(base+'/reports/ledger?ledger_id='+rajesh.id+'&from=2026-10-01&to=2026-11-30',{headers:h});
let ls=await r.json();
console.log('ledger',r.status,'opening',ls.opening,'lines',ls.lines?.length,'closing',ls.closing);
// brs banks + brs
r=await fetch(base+'/reports/brs/banks',{headers:h}); let banks=await r.json(); console.log('banks',r.status,banks.banks?.map(b=>b.name));
r=await fetch(base+'/reports/brs?ledger_id='+banks.banks[0].id+'&as_on=2026-11-30',{headers:h}); let br=await r.json(); console.log('brs',r.status,'book',br.bookBalance,'reconciled',br.reconciledBalance,'lines',br.lines?.length);
// cleanup
for (const id of [v.voucher?.id,j.voucher?.id]) { if(id){ const d=await fetch(base+'/vouchers/'+id,{method:'DELETE',headers:h}); console.log('delete',id,d.status); } }
