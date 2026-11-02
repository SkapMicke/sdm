const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('photos.js','utf8');
function setup(){
 const events={},winEvents={},root={innerHTML:''},status={},progress={};
 let current={id:'owner-a'},records=[],uploads=[],active=0,maxActive=0;
 const calls=[];
 const client={auth:{getSession:async()=>({data:{session:{user:current,access_token:'test'}}})},
  from(){let op='select',data,filters=[];const q={
   select(){return q},eq(k,v){filters.push([k,v]);return q},is(){return q},not(){return q},order(){return q},range(){return q},in(k,v){filters.push([k,v]);return q},
   insert(x){op='insert';data=x;return q},update(x){op='update';data=x;return q},delete(){op='delete';return q},
   then(resolve){calls.push({op,data,filters});if(op==='insert')records.push({...data,upload_date:'2026-11-02'});if(op==='update')for(const r of records)if(filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v))Object.assign(r,data);return Promise.resolve({data:op==='select'?records.filter(x=>x.ready):null}).then(resolve);}
  };return q;},
  storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(x=>({signedUrl:'https://example.test/'+x}))}),remove:async()=>({data:[]})})}};
 const context={console,crypto:require('node:crypto').webcrypto,confirm:()=>true,
  createImageBitmap:async()=>({width:100,height:80,close(){}}),
  document:{getElementById:id=>id==='photo-library'?root:id==='photo-status'?status:id==='photo-progress'?progress:null,addEventListener:(k,f)=>events[k]=f,
   createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},strokeText(){},fillText(){}}),toBlob:f=>f({type:'image/jpeg'})})},
  tus:{Upload:class{constructor(file,options){this.options=options;}start(){active++;maxActive=Math.max(maxActive,active);uploads.push(this.options.metadata.objectName);setImmediate(()=>{active--;this.options.onSuccess();});}}},
  window:{sdmCloudClient:()=>client,sdmCloudUser:()=>current,SDM_SUPABASE_URL:'https://example.supabase.co',addEventListener:(k,f)=>winEvents[k]=f,tus:true}};
 vm.runInNewContext(source,context);
 return {context,events,winEvents,root,status,calls,uploads,get maxActive(){return maxActive},setUser:x=>current=x};
}
async function settle(until){for(let i=0;i<100;i++){await new Promise(setImmediate);if(until())return;}throw Error('Timed out');}
test('multiple uploads preserve originals, finish three files before ready, and bound concurrency',async()=>{
 const s=setup();s.events.change({target:{id:'photo-files',dataset:{},files:Array.from({length:5},(_,i)=>({name:`photo-${i}.jpg`,type:'image/jpeg',size:500}))}});
 await settle(()=>s.calls.filter(x=>x.op==='update'&&x.data.ready).length===5);
 assert.equal(s.uploads.length,15);assert.equal(s.uploads.filter(x=>x.endsWith('/original')).length,5);assert.ok(s.maxActive<=2);
 assert.ok(s.calls.filter(x=>x.op==='insert').every(x=>x.data.user_id==='owner-a'));
});
test('unsupported format is rejected before database or storage writes',async()=>{
 const s=setup();s.events.change({target:{id:'photo-files',dataset:{},files:[{name:'raw.heic',type:'image/heic',size:50}]}});
 await settle(()=>s.status.textContent?.includes('Filformatet stöds inte'));
 assert.equal(s.calls.filter(x=>x.op==='insert').length,0);assert.equal(s.uploads.length,0);
});
test('sign-out removes the library from the screen',async()=>{
 const s=setup();s.context.window.sdmPhotosRender();await settle(()=>s.root.innerHTML.includes('Bildarkiv'));
 s.setUser(null);s.winEvents['sdm-auth']();assert.match(s.root.innerHTML,/Logga in under/);assert.doesNotMatch(s.root.innerHTML,/photo-files/);
});
