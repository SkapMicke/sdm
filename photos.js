/* Private originals and watermarked derivatives in Supabase Storage. */
(() => {
 const bucket='sdm-photos', limit=60;
 let rows=[], selected=new Set(), mode='all', date='', offset=0, more=false;
 let queue=[], running=false, busy=false, message='', owner=null, generation=0;
 const client=()=>window.sdmCloudClient?.();
 const user=()=>window.sdmCloudUser?.();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const root=()=>document.getElementById('photo-library');
 const checked=r=>{if(r.error)throw r.error;return r.data;};
 const status=s=>{message=s;const el=document.getElementById('photo-status');if(el)el.textContent=s;};
 function progress(){
  const done=queue.filter(x=>x.state==='done').length, failed=queue.filter(x=>x.state==='failed');
  const el=document.getElementById('photo-progress');if(el){el.max=queue.length||1;el.value=done+failed.length;}
  status(`${done} av ${queue.length} bilder sparade · ${failed.length} misslyckade${running?' · Uppladdning pågår':''}`+(failed.length?'\n'+failed.slice(0,5).map(x=>`${x.file.name}: ${x.error}`).join('\n'):''));
 }
 function draw(){
  const target=root();if(!target)return;
  if(!user()){target.innerHTML='<h1>Bildarkiv</h1><div class="panel"><h2>Molnlagring för bilder</h2><p>Logga in med din e-post för att se och ladda upp dina bilder. Använd samma konto på alla enheter.</p><button class="primary" id="photo-login">Logga in till bildmolnet</button><p id="photo-status" role="status" aria-live="polite"></p></div>';return;}
  target.innerHTML=`<h1>Bildarkiv</h1><p class="subtitle">Dina original och kopior med @ Simons Dansmedia.</p>
   <div class="photo-drop"><label for="photo-files">Välj bilder — även tusentals samtidigt</label><input id="photo-files" type="file" multiple accept="image/jpeg,image/png,image/webp" ${running?'disabled':''}><p class="hint">JPEG, PNG och WebP, högst 50 MB per bild. Behåll sidan öppen tills kön är klar. Du kan använda andra flikar i appen.</p><progress id="photo-progress" max="1" value="0"></progress><p id="photo-status" role="status" aria-live="polite">${esc(message)}</p><button class="outline" id="photo-retry" ${running?'disabled':''}>Försök misslyckade igen</button></div>
   <div class="photo-tools"><button class="${mode==='all'?'primary':'outline'}" data-photo-mode="all">Alla bilder</button><button class="${mode==='stars'?'primary':'outline'}" data-photo-mode="stars">★ Favoriter</button><button class="${mode==='trash'?'primary':'outline'}" data-photo-mode="trash">Papperskorg</button><button class="outline" id="photo-refresh">Uppdatera</button></div>
   ${mode==='stars'?`<label for="photo-date">Datummapp (uppladdningsdatum i Sverige)</label><input id="photo-date" type="date" value="${esc(date)}"><div id="photo-folders"></div>`:''}
   <div class="photo-tools"><label><input id="photo-all" type="checkbox" ${rows.length&&selected.size===rows.length?'checked':''}> Välj alla på sidan</label><span>${selected.size} valda</span><button id="photo-delete" class="danger" ${!selected.size||busy?'disabled':''}>${mode==='trash'?'Radera permanent':'Till papperskorgen'}</button>${mode==='trash'?`<button id="photo-restore" class="outline" ${!selected.size||busy?'disabled':''}>Återställ</button>`:''}</div>
   <div class="photo-grid">${rows.map(x=>`<article class="panel photo-card"><img loading="lazy" src="${esc(x.url||'')}" alt="${esc(x.name)}"><p title="${esc(x.name)}">${esc(x.name)}</p><small>${esc(x.upload_date)}</small><div class="photo-tools"><input type="checkbox" data-photo-select="${x.id}" aria-label="Välj ${esc(x.name)}" ${selected.has(x.id)?'checked':''}><button class="outline" data-photo-star="${x.id}" aria-label="Favorit" aria-pressed="${x.starred}">${x.starred?'★':'☆'}</button><button class="outline" data-photo-remove="${x.id}" aria-label="Ta bort ${esc(x.name)}">×</button></div><div class="photo-tools"><button class="outline" data-photo-download="${x.id}" data-variant="original_path">Original</button><button class="outline" data-photo-download="${x.id}" data-variant="preview_path">Vattenstämpel</button></div></article>`).join('')||'<p>Inga bilder att visa.</p>'}</div>
   <div class="photo-tools"><button class="outline" id="photo-prev" ${offset===0?'disabled':''}>Föregående</button><span>Sida ${Math.floor(offset/limit)+1}</span><button class="outline" id="photo-next" ${!more?'disabled':''}>Nästa</button></div><p class="hint">Papperskorgen sparar bilder tills du raderar dem permanent. Separat säkerhetskopiering behöver ordnas. Appens vanliga JSON-export innehåller inte bilder.</p>`;
  if(queue.length)progress();
  if(mode==='stars')folders();
 }
 async function folders(){
  // Fetch distinct dates through a paged, owner-filtered projection.
  const token=generation, dates=new Set();let start=0;
  try{while(true){const data=checked(await client().from('photos').select('upload_date').eq('user_id',user().id).eq('ready',true).eq('starred',true).is('deleted_at',null).order('uploaded_at').order('id').range(start,start+999));data.forEach(x=>dates.add(x.upload_date));if(data.length<1000)break;start+=1000;}
   const el=document.getElementById('photo-folders');if(el&&token===generation)el.innerHTML=[...dates].sort().reverse().map(d=>`<button class="outline photo-folder" data-photo-date="${d}">★ ${d}</button>`).join('');
  }catch(e){status(e.message);}
 }
 async function load(){
  const token=++generation; selected.clear();
  if(!user()){rows=[];draw();return;}
  const id=user().id;status('Hämtar bilder…');
  try{
   let q=client().from('photos').select('*').eq('user_id',id).eq('ready',true).order('uploaded_at',{ascending:false}).order('id').range(offset,offset+limit);
   q=mode==='trash'?q.not('deleted_at','is',null):q.is('deleted_at',null);
   if(mode==='stars'){q=q.eq('starred',true);if(date)q=q.eq('upload_date',date);}
   const data=checked(await q);const visible=data.slice(0,limit);
   const signed=visible.length?checked(await client().storage.from(bucket).createSignedUrls(visible.map(x=>x.thumbnail_path),3600)):[];
   if(token!==generation||user()?.id!==id)return;
   more=data.length>limit;rows=visible.map((x,i)=>({...x,url:signed[i]?.signedUrl}));message='';draw();
  }catch(e){if(token===generation){rows=[];message='Kunde inte läsa bildarkivet: '+e.message+'. Kontrollera att supabase/photos.sql har körts.';draw();}}
 }
 async function derivatives(file){
  const bitmap=await createImageBitmap(file);
  try{
   if(bitmap.width*bitmap.height>80000000)throw Error('Bilden överstiger 80 megapixel.');
   const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(bitmap,0,0);
   const size=Math.max(12,Math.round(canvas.width/38)),pad=Math.max(8,Math.round(canvas.width/60));
   c.font=`600 ${size}px sans-serif`;c.textAlign='right';c.textBaseline='bottom';c.strokeStyle='#000b';c.lineWidth=Math.max(2,size/12);c.fillStyle='#ffffffdd';
   c.strokeText('@ Simons Dansmedia',canvas.width-pad,canvas.height-pad,canvas.width-pad*2);c.fillText('@ Simons Dansmedia',canvas.width-pad,canvas.height-pad,canvas.width-pad*2);
   const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.92));
   const thumb=document.createElement('canvas');thumb.width=Math.min(480,canvas.width);thumb.height=Math.max(1,Math.round(canvas.height*thumb.width/canvas.width));thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
   const small=await new Promise(r=>thumb.toBlob(r,'image/jpeg',.8));canvas.width=canvas.height=1;
   if(!blob||!small)throw Error('Kunde inte skapa vattenstämpel.');return [blob,small];
  }finally{bitmap.close();}
 }
 async function upload(path,file){
  const {data,error}=await client().auth.getSession();if(error)throw error;if(!data.session||data.session.user.id!==owner)throw Error('Logga in med samma konto igen.');
  await new Promise((resolve,reject)=>{
   const transfer=new tus.Upload(file,{endpoint:window.SDM_SUPABASE_URL.replace('.supabase.co','.storage.supabase.co')+'/storage/v1/upload/resumable',retryDelays:[0,1000,3000,5000,10000],chunkSize:6*1024*1024,uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,headers:{authorization:`Bearer ${data.session.access_token}`,'x-upsert':'true'},metadata:{bucketName:bucket,objectName:path,contentType:file.type||'image/jpeg',cacheControl:'3600'},onError:reject,onSuccess:resolve});
   transfer.start();
  });
 }
 async function process(item){
  if(user()?.id!==owner)throw Error('Kontot har ändrats. Logga in med ursprungskontot.');
  if(!['image/jpeg','image/png','image/webp'].includes(item.file.type))throw Error('Filformatet stöds inte. Använd JPEG, PNG eller WebP.');
  if(item.file.size>50*1024*1024)throw Error('Bilden är större än 50 MB.');
  const id=item.id, base=`${owner}/${id}`, record={id,user_id:owner,name:item.file.name,original_path:base+'/original',preview_path:base+'/watermarked.jpg',thumbnail_path:base+'/thumbnail.jpg'};
  if(!item.registered){checked(await client().from('photos').insert(record));item.registered=true;}
  const [watermarked,thumbnail]=await derivatives(item.file);
  await upload(record.original_path,item.file);await upload(record.preview_path,watermarked);await upload(record.thumbnail_path,thumbnail);
  checked(await client().from('photos').update({ready:true}).eq('id',id).eq('user_id',owner));
 }
 async function run(){
  if(running)return;
  if(!window.tus){status('Uppladdningsbiblioteket kunde inte laddas. Kontrollera internet och ladda om sidan.');return;}
  running=true;draw();
  async function worker(){for(;;){const item=queue.find(x=>x.state==='waiting');if(!item)break;item.state='uploading';try{await process(item);item.state='done';item.file={name:item.file.name};}catch(e){item.state='failed';item.error=e.message;}progress();}}
  try{await Promise.all([worker(),worker()]);}finally{running=false;await load();progress();}
 }
 async function remove(ids,restore=false){
  if(busy||!ids.length)return;
  const permanent=mode==='trash'&&!restore;
  if(permanent&&!confirm(`Radera ${ids.length} bilder permanent, inklusive original? Detta går inte att ångra.`))return;
  busy=true;draw();
  try{
   if(permanent){for(const id of ids){const x=rows.find(r=>r.id===id);checked(await client().storage.from(bucket).remove([x.original_path,x.preview_path,x.thumbnail_path]));checked(await client().from('photos').delete().eq('id',id));}}
   else checked(await client().from('photos').update({deleted_at:restore?null:new Date().toISOString()}).in('id',ids));
   await load();
  }catch(e){status('Åtgärden misslyckades: '+e.message);}finally{busy=false;draw();}
 }
 window.sdmPhotosRender=()=>{draw();load();};
 window.addEventListener('sdm-auth',()=>{generation++;rows=[];selected.clear();if(root()){draw();load();}});
 document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='photo-files'&&!running&&user()){
   if(queue.some(x=>x.state==='failed')&&!confirm('Ersätta den tidigare kön? Misslyckade bilder behöver väljas igen.'))return;
   owner=user().id;queue=Array.from(t.files,x=>({file:x,id:crypto.randomUUID(),state:'waiting'}));run();
  }
  if(t.dataset.photoSelect){t.checked?selected.add(t.dataset.photoSelect):selected.delete(t.dataset.photoSelect);draw();}
  if(t.id==='photo-all'){selected=t.checked?new Set(rows.map(x=>x.id)):new Set();draw();}
  if(t.id==='photo-date'){date=t.value;offset=0;load();}
 });
 document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t||!root())return;
  try{
   if(t.id==='photo-login'){if(!window.sdmCloudSignIn)throw Error('Inloggningen kunde inte laddas. Ladda om sidan.');await window.sdmCloudSignIn(status);}
   if(t.dataset.photoMode){mode=t.dataset.photoMode;offset=0;date='';await load();}
   if(t.dataset.photoDate){date=t.dataset.photoDate;offset=0;await load();}
   if(t.id==='photo-refresh')await load();
   if(t.id==='photo-prev'){offset=Math.max(0,offset-limit);await load();}
   if(t.id==='photo-next'){offset+=limit;await load();}
   if(t.dataset.photoStar){const x=rows.find(x=>x.id===t.dataset.photoStar);t.disabled=true;checked(await client().from('photos').update({starred:!x.starred}).eq('id',x.id));await load();}
   if(t.dataset.photoRemove)await remove([t.dataset.photoRemove]);
   if(t.id==='photo-delete')await remove([...selected]);
   if(t.id==='photo-restore')await remove([...selected],true);
   if(t.id==='photo-retry'&&!running){queue.filter(x=>x.state==='failed').forEach(x=>x.state='waiting');await run();}
   if(t.dataset.photoDownload){const x=rows.find(x=>x.id===t.dataset.photoDownload),name=t.dataset.variant==='original_path'?x.name:x.name.replace(/\.[^.]+$/,'')+'-vattenstampel.jpg';const data=checked(await client().storage.from(bucket).createSignedUrl(x[t.dataset.variant],60,{download:name}));const a=document.createElement('a');a.href=data.signedUrl;a.rel='noopener';a.target='_blank';a.click();}
  }catch(err){status(err.message);}
 });
 window.addEventListener('beforeunload',e=>{if(running){e.preventDefault();e.returnValue='';}});
})();
