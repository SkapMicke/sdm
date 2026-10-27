/* Google Calendar read-only integration. Configure GOOGLE_CLIENT_ID in google-config.js. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const config = window.SDM_GOOGLE_CLIENT_ID || '';
  let token = null, tokenClient = null, calendars = [], shifts = [], expiry = 0, busy = false;
  const selectedKey = 'sdm-google-calendar-id';
  const saved = () => localStorage.getItem(selectedKey) || '';
  const cacheKey = 'sdm-google-events-cache-v1';
  const loadCache = () => {try {const c=JSON.parse(localStorage.getItem(cacheKey)||'null');return c && c.calendarId===saved() && Array.isArray(c.events)?c.events:[]}catch{return []}};
  const storeCache = events => {try {localStorage.setItem(cacheKey,JSON.stringify({calendarId:saved(),events,updatedAt:Date.now()}))}catch(e){console.warn('Kunde inte spara kalendercache',e)}};
  window.sdmGoogleEvents=loadCache();
  window.sdmGoogleStatus=window.sdmGoogleEvents.length?'Visar senast sparade arbetspass (anslut Google för att uppdatera)':'';
  const api = async path => {
    const response = await fetch('https://www.googleapis.com/calendar/v3/' + path, {headers:{Authorization:'Bearer '+token}});
    if (!response.ok) throw Error('Google Kalender svarade ' + response.status + (response.status===401?' (logga in igen)':''));
    return response.json();
  };
  const asDate = s => s?.date || (s?.dateTime ? s.dateTime.slice(0,10) : '');
  const asTime = s => s?.dateTime ? new Date(s.dateTime).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'}) : '';
  const request = async () => {
    if (!config || config.includes('DIN_')) {alert('Ange först ditt Google OAuth Client ID i google-config.js. Se GOOGLE-INSTRUKTIONER.txt.');return;}
    if (!window.google?.accounts?.oauth2) {alert('Google-inloggningen kunde inte laddas. Kontrollera internetanslutningen.');return;}
    if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({client_id:config,scope:'https://www.googleapis.com/auth/calendar.readonly',callback:async r=>{
      if(r.error){alert('Google-inloggning misslyckades: '+r.error);return;}
      token=r.access_token;expiry=Date.now()+(r.expires_in||3500)*1000;
      try {await loadCalendars();await refresh();} catch(e){alert(e.message);} renderSettings();
    }});
    tokenClient.requestAccessToken({prompt:token?'':'consent'});
  };
  async function loadCalendars(){
    calendars=[];let page;
    do {const r=await api('users/me/calendarList?maxResults=250'+(page?'&pageToken='+encodeURIComponent(page):''));calendars.push(...(r.items||[]));page=r.nextPageToken;}while(page);
    if (!saved() && calendars.length===1) localStorage.setItem(selectedKey,calendars[0].id);
  }
  async function refresh(){
    if (!token || Date.now()>expiry-60000) {token=null;renderSettings();return;}
    const id=saved();if(!id)return;
    if(busy)return;busy=true;
    try {
      const start=new Date();start.setMonth(start.getMonth()-2);
      const end=new Date();end.setMonth(end.getMonth()+12);
      const params=new URLSearchParams({singleEvents:'true',orderBy:'startTime',maxResults:'2500',timeMin:start.toISOString(),timeMax:end.toISOString()});
      let items=[],page;
      do {if(page)params.set('pageToken',page);const r=await api('calendars/'+encodeURIComponent(id)+'/events?'+params);items.push(...(r.items||[]));page=r.nextPageToken;}while(page);
      shifts=items.filter(x=>x.status!=='cancelled'&&x.start).map(x=>({id:'google:'+x.id,title:x.summary||'Arbetspass',date:asDate(x.start),time:asTime(x.start),place:x.location||'',category:'Smartplan / Google',external:true}));
      window.sdmGoogleEvents=shifts;
      storeCache(shifts);
      window.sdmGoogleStatus='Senast synkad '+new Date().toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});
      if(typeof window.render==='function')window.render();
    } finally {busy=false;}
  }
  function renderSettings(){
    const target=$('#google-calendar-settings');if(!target)return;
    target.innerHTML=`<div class="section"><h2>Google Kalender · Smartplan</h2></div><div class="panel"><p>Visa dina arbetspass i Simons DansMedia. Endast läsbehörighet – inga pass ändras i Google.</p>${!config?'<p><strong>Konfiguration krävs:</strong> Lägg in Google Client ID enligt instruktionerna i paketet.</p>':''}<button type="button" class="primary" id="google-login">${token?'Byt Google-konto / förnya inloggning':'Anslut Google Kalender'}</button>${token?`<label for="google-calendar-select">Välj kalender med Smartplan-passen</label><select id="google-calendar-select"><option value="">Välj kalender</option>${calendars.map(c=>`<option value="${esc(c.id)}" ${c.id===saved()?'selected':''}>${esc(c.summary||c.id)}</option>`).join('')}</select><button type="button" class="outline" id="google-refresh">Synkronisera nu</button><button type="button" class="outline" id="google-logout">Koppla från</button><p>${esc(window.sdmGoogleStatus||'Välj kalender och synkronisera.')}</p>`:'<p>Du behöver godkänna Google-inloggningen efter att du öppnat appen på nytt.</p>'}</div>`;
    $('#google-login').onclick=request;
    if(token){$('#google-calendar-select').onchange=async e=>{localStorage.setItem(selectedKey,e.target.value);shifts=[];window.sdmGoogleEvents=[];localStorage.removeItem(cacheKey);window.render?.();try{await refresh()}catch(err){alert(err.message)}renderSettings()};$('#google-refresh').onclick=async()=>{try{await refresh()}catch(e){alert(e.message)}renderSettings()};$('#google-logout').onclick=()=>{if(window.google?.accounts?.oauth2&&token)google.accounts.oauth2.revoke(token,()=>{});token=null;shifts=[];window.sdmGoogleEvents=[];localStorage.removeItem(cacheKey);window.sdmGoogleStatus='';renderSettings();window.render?.()};}
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-page="settings"]'))setTimeout(renderSettings,0)});
  const oldRender=window.render;
  // Existing application uses global render(); wrap it without modifying saved events.
  window.sdmGoogleSettings=renderSettings;
  window.sdmGoogleRefresh=refresh;
  setInterval(()=>{if(token&&saved())refresh().catch(console.warn)},5*60*1000);
  setTimeout(renderSettings,0);
})();
