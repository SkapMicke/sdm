/* Supabase Auth, cloud reminders and browser push. Google Calendar OAuth stays separate. */
(() => {
 const status = () => document.getElementById('sdm-cloud-status');
 const msg = s => { if(status()) status().textContent=s; };
 let client, user, syncing=false;
 const configOk = !!(window.supabase && window.SDM_SUPABASE_URL && window.SDM_SUPABASE_PUBLISHABLE_KEY);
 if(configOk) client=window.supabase.createClient(window.SDM_SUPABASE_URL,window.SDM_SUPABASE_PUBLISHABLE_KEY);
 const toLocal = r => ({id:r.id,title:r.title,body:r.description||'',when:new Date(r.remind_at).toLocaleString('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(' ','T'),done:r.completed,cloud:true});
 async function pull(){
  if(!user || syncing)return;
  syncing=true;
  try {
   const {data,error}=await client.from('reminders').select('*').order('remind_at');if(error)throw error;
   const local=JSON.parse(localStorage.getItem('sdm-reminders')||'[]');
   // First login migration: upload local reminders once, preserving IDs.
   if(local.some(x=>!x.cloud)){
    const pending=local.filter(x=>!x.cloud && x.title && x.when).map(x=>({id:x.id,user_id:user.id,title:x.title,description:x.body||null,remind_at:new Date(x.when).toISOString(),completed:!!x.done}));
    if(pending.length){const res=await client.from('reminders').upsert(pending,{onConflict:'id'});if(res.error)throw res.error;}
   }
   const refreshed=await client.from('reminders').select('*').order('remind_at');if(refreshed.error)throw refreshed.error;
   window.sdmCloudApplyReminders?.(refreshed.data.map(toLocal));
   msg('Synkroniserad ✓ · '+user.email);
  }catch(e){console.error(e);msg('Synkfel: '+e.message)}finally{syncing=false;}
 }
 async function saveReminder(x,deleted=false){
  if(!user)return;
  try{
   if(deleted){const {error}=await client.from('reminders').delete().eq('id',x.id);if(error)throw error;}
   else {const {error}=await client.from('reminders').upsert({id:x.id,user_id:user.id,title:x.title,description:x.body||null,remind_at:new Date(x.when).toISOString(),completed:!!x.done,notified_at:null},{onConflict:'id'});if(error)throw error;}
   await pull();
  }catch(e){console.error(e);msg('Kunde inte spara: '+e.message)}
 }
 const base64ToBytes=s=>{const padded=s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=');return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));};
 async function enablePush(){
  if(!user)throw Error('Logga in först.');
  if(!('PushManager'in window)||!('serviceWorker'in navigator))throw Error('Den här webbläsaren stöder inte Web Push.');
  if(!window.SDM_VAPID_PUBLIC_KEY)throw Error('VAPID public key saknas i supabase-config.js.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notiser tilläts inte.');
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(subscription && subscription.options?.applicationServerKey && !sameKey(new Uint8Array(subscription.options.applicationServerKey),base64ToBytes(window.SDM_VAPID_PUBLIC_KEY))){await subscription.unsubscribe();subscription=null;}
  subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(window.SDM_VAPID_PUBLIC_KEY)});
  const json=subscription.toJSON();
  const {error}=await client.from('push_subscriptions').upsert({user_id:user.id,endpoint:subscription.endpoint,p256dh:json.keys.p256dh,auth_key:json.keys.auth},{onConflict:'endpoint'});
  if(error)throw error;
  msg('Pushnotiser aktiverade på den här enheten ✓');
 }
 function sameKey(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i]);}
 async function signIn(){
  if(!client){msg('Supabase-klienten kunde inte laddas.');return;}
  const email=prompt('Ange din e-postadress för inloggningslänk:');if(!email)return;
  const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:location.origin+location.pathname}});
  msg(error?'Inloggningsfel: '+error.message:'Kontrollera din e-post och öppna inloggningslänken.');
 }
 async function signOut(){await client.auth.signOut();user=null;window.sdmCloudApplyReminders?.(JSON.parse(localStorage.getItem('sdm-reminders')||'[]'));msg('Utloggad. Lokala data visas.');}
 function settings(){const slot=document.getElementById('sdm-cloud-settings');if(!slot)return;
  slot.innerHTML=`<div class="section"><h2>Molnsynk och pushnotiser</h2></div><div class="panel"><p id="sdm-cloud-status">${user?'Inloggad: '+user.email:'Logga in för synkroniserade påminnelser och bakgrundspush.'}</p><div class="actions" style="flex-wrap:wrap"><button class="primary" id="sdm-cloud-login">${user?'Byt konto / Logga ut':'Logga in via e-post'}</button><button class="outline" id="sdm-cloud-push" ${user?'':'disabled'}>Aktivera push på denna enhet</button><button class="outline" id="sdm-cloud-refresh" ${user?'':'disabled'}>Synka nu</button></div><p style="font-size:12px;opacity:.8">Google Kalender-inloggningen är separat. Push kräver VAPID-nycklar och serverfunktionen i instruktionerna.</p></div>`;
  document.getElementById('sdm-cloud-login').onclick=()=>user?signOut().then(settings):signIn();
  document.getElementById('sdm-cloud-refresh').onclick=pull;
  document.getElementById('sdm-cloud-push').onclick=async()=>{try{await enablePush()}catch(e){msg(e.message)}};
 }
 window.sdmCloudSettings=settings;
 window.sdmCloudSaveReminder=saveReminder;
 window.sdmCloudPull=pull;
 window.sdmCloudUser=()=>user;
 async function init(){if(!client)return;const {data}=await client.auth.getUser();user=data.user;client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;setTimeout(()=>{settings();if(user)pull()},0)});settings();if(user)pull();}
 init().catch(console.error);
})();
