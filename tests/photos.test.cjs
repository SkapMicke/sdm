const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('photos.js','utf8');
function setup(saved=new Map()){
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
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
  createImageBitmap:async()=>({width:100,height:80,close(){}}),
  document:{getElementById:id=>id==='photo-library'?root:id==='photo-status'?status:id==='photo-progress'?progress:null,addEventListener:(k,f)=>events[k]=f,
   createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(){},strokeText(){},fillText(){}}),toBlob:f=>f({type:'image/jpeg'})})},
  tus:{Upload:class{constructor(file,options){this.options=options;}async findPreviousUploads(){return [];}start(){active++;maxActive=Math.max(maxActive,active);uploads.push(this.options.metadata.objectName);setImmediate(()=>{active--;this.options.onSuccess();});}}},
  window:{sdmCloudClient:()=>client,sdmCloudUser:()=>current,SDM_SUPABASE_URL:'https://example.supabase.co',addEventListener:(k,f)=>winEvents[k]=f,tus:true}};
 vm.runInNewContext(source,context);
 return {context,events,winEvents,root,status,calls,uploads,saved,start:()=>events.click({target:{closest:()=>({id:'photo-start',dataset:{}})}}),get maxActive(){return maxActive},setUser:x=>current=x};
}
async function settle(until){for(let i=0;i<100;i++){await new Promise(setImmediate);if(until())return;}throw Error('Timed out');}
test('multiple uploads preserve originals, finish three files before ready, and bound concurrency',async()=>{
 const s=setup();s.events.change({target:{id:'photo-files',dataset:{},files:Array.from({length:5},(_,i)=>({name:`photo-${i}.jpg`,type:'image/jpeg',size:500}))}});
 assert.equal(s.uploads.length,0);await s.start();
 await settle(()=>s.calls.filter(x=>x.op==='update'&&x.data.ready).length===5);
 assert.equal(s.uploads.length,15);assert.equal(s.uploads.filter(x=>x.endsWith('/original')).length,5);assert.ok(s.maxActive<=2);
 assert.ok(s.calls.filter(x=>x.op==='insert').every(x=>x.data.user_id==='owner-a'));
});
test('unsupported format is rejected before database or storage writes',async()=>{
 const s=setup();s.events.change({target:{id:'photo-files',dataset:{},files:[{name:'raw.heic',type:'image/heic',size:50}]}});
 await s.start();
 await settle(()=>s.status.textContent?.includes('Filformatet stöds inte'));
 assert.equal(s.calls.filter(x=>x.op==='insert').length,0);assert.equal(s.uploads.length,0);
});
test('folder selection includes nested paths, skips non-images, and deduplicates reselection',async()=>{
 const s=setup();const files=[{name:'a.jpg',webkitRelativePath:'Album/one/a.jpg',type:'image/jpeg',size:500,lastModified:1},{name:'a.jpg',webkitRelativePath:'Album/two/a.jpg',type:'image/jpeg',size:500,lastModified:1},{name:'notes.txt',type:'text/plain',size:10}];
 const event={target:{id:'photo-folder',dataset:{},files}};
 s.events.change(event);s.events.change(event);await s.start();
 assert.deepEqual(s.calls.filter(x=>x.op==='insert').map(x=>x.data.name),['Album/one/a.jpg','Album/two/a.jpg']);
 assert.equal(s.uploads.length,6);
});
test('saved queue reconnects files after restart with the same IDs and skips completed stages',async()=>{
 const s=setup(),file={name:'a.jpg',type:'image/jpeg',size:500,lastModified:1};
 s.events.change({target:{id:'photo-files',dataset:{},files:[file]}});
 const saved=JSON.parse(s.saved.get('sdm-photo-queue:owner-a'));saved[0].registered=true;saved[0].original_path=true;saved[0].state='uploading';s.saved.set('sdm-photo-queue:owner-a',JSON.stringify(saved));
 const resumed=setup(s.saved);resumed.context.window.sdmPhotosRender();
 await settle(()=>resumed.status.textContent?.includes('Välj samma filer'));
 resumed.events.change({target:{id:'photo-files',dataset:{},files:[file]}});await resumed.start();
 assert.equal(resumed.uploads.length,2);assert.ok(resumed.uploads.every(x=>x.includes(saved[0].id)&&!x.endsWith('/original')));
 resumed.events.change({target:{id:'photo-files',dataset:{},files:[file]}});await resumed.start();assert.equal(resumed.uploads.length,2);
});
test('a different account does not receive the saved upload queue',()=>{
 const s=setup();s.events.change({target:{id:'photo-files',dataset:{},files:[{name:'a.jpg',type:'image/jpeg',size:500}]}});
 s.setUser({id:'owner-b'});s.winEvents['sdm-auth']();
 assert.equal(s.saved.has('sdm-photo-queue:owner-b'),false);assert.doesNotMatch(s.root.innerHTML,/1 bilder/);
});
test('sign-out removes the library from the screen',async()=>{
 const s=setup();s.context.window.sdmPhotosRender();await settle(()=>s.root.innerHTML.includes('Bildarkiv'));
 s.setUser(null);s.winEvents['sdm-auth']();assert.match(s.root.innerHTML,/photo-login/);assert.doesNotMatch(s.root.innerHTML,/photo-files/);
});
