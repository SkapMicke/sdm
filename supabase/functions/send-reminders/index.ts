// Deploy as a protected Supabase Edge Function. Requires secret CRON_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!,Deno.env.get('VAPID_PUBLIC_KEY')!,Deno.env.get('VAPID_PRIVATE_KEY')!);
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const secret=Deno.env.get('CRON_SECRET');
 if(!secret||req.headers.get('x-cron-secret')!==secret)return new Response('Unauthorized',{status:401});
 const {data:reminders,error}=await supabase.from('reminders').select('id,user_id,title,description,remind_at').eq('completed',false).is('notified_at',null).lte('remind_at',new Date().toISOString()).limit(100);
 if(error)return new Response(error.message,{status:500});
 let sent=0,failed=0;
 for(const reminder of reminders||[]){
  // Mark claimed before sending to avoid duplicate notifications across overlapping invocations.
  const {data:claimed,error:claimError}=await supabase.from('reminders').update({notified_at:new Date().toISOString()}).eq('id',reminder.id).is('notified_at',null).select('id');
  if(claimError||!claimed?.length)continue;
  const {data:subs,error:subsError}=await supabase.from('push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('user_id',reminder.user_id);
  if(subsError){failed++;continue;}
  for(const sub of subs||[]){
   try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},JSON.stringify({title:'Simons DansMedia · Påminnelse',body:reminder.title,tag:'sdm-'+reminder.id,url:'/'}));sent++}
   catch(e){failed++;console.error('Push failed',sub.id,e);if(e?.statusCode===404||e?.statusCode===410)await supabase.from('push_subscriptions').delete().eq('id',sub.id)}
  }
 }
 return Response.json({processed:reminders?.length||0,sent,failed});
});
