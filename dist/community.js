// Optional, short-lived reports. A missing ETA is never treated as proof of arrival.
export function arrivalKey(a){return [a.trip.trip_id,a.day.date,a.s.seq].join('|');}
export function expiredArrival(previous,current,now){const currentKeys=new Set(current.map(arrivalKey));return previous.find(a=>!a.unmatched&&!currentKeys.has(arrivalKey(a))&&a.time<=now&&now-a.time<120000);}
export class PassengerReports{
 constructor(){this.config=null;this.session=null;this.previous=[];this.stop=null;this.observed=new Set();this.prompted=new Set();this.prompt=null;this.summaries=[];this.polling=false;}
 async init(){try{const r=await fetch('./community-config.json',{cache:'no-store'});this.config=await r.json();}catch{this.config=null;}}
 enabled(){return !!(this.config?.enabled&&this.config.url&&this.config.publishableKey);}
 watch(stop){if(this.stop!==stop){this.stop=stop;this.previous=[];this.observed.clear();this.prompt=null;this.summaries=[];}}
 async sessionToken(){if(this.session?.expires_at>Date.now()/1000+60)return this.session.access_token;let saved;try{saved=JSON.parse(localStorage.getItem('tuka-report-session'));}catch{}const body=saved?.refresh_token?{refresh_token:saved.refresh_token}:{};const path=saved?.refresh_token?'/auth/v1/token?grant_type=refresh_token':'/auth/v1/signup';const r=await fetch(this.config.url+path,{method:'POST',headers:{apikey:this.config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Passenger reports are unavailable.');const data=await r.json();this.session=data.access_token?data:data.session;if(!this.session?.access_token)throw Error('Anonymous reporting is not enabled.');this.session.expires_at||=Date.now()/1000+(this.session.expires_in||3600);localStorage.setItem('tuka-report-session',JSON.stringify(this.session));return this.session.access_token;}
 async rpc(name,body){const token=await this.sessionToken();const r=await fetch(this.config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:this.config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Could not send or read reports. Try again later.');return r.status===204?null:r.json();}
 tick(arrivals,near,now=Date.now()){
  if(!this.enabled())return null;
  for(const a of arrivals)if(!a.unmatched&&a.time-now<=60000&&a.time-now>=-30000)this.observed.add(arrivalKey(a));
  if(!this.prompt&&near){const gone=expiredArrival(this.previous,arrivals,now);if(gone&&this.observed.has(arrivalKey(gone))&&!this.prompted.has(arrivalKey(gone))){this.observed.delete(arrivalKey(gone));this.prompted.add(arrivalKey(gone));this.prompt={arrival:gone,until:now+20000};}}
  this.previous=arrivals.slice();if(this.prompt&&now>=this.prompt.until)this.prompt=null;return this.prompt;
 }
 dismiss(){this.prompt=null;}
 async answer(value,stop,line,direction){const prompt=this.prompt;if(!prompt||Date.now()>prompt.until)return;this.prompt=null;const a=prompt.arrival;await this.rpc('tuka_submit_report',{payload:{trip_id:a.trip.trip_id,service_date:a.day.date,stop_code:stop.stop_code||stop.id,stop_sequence:a.s.seq,line,direction,answer:value,expected_at:new Date(a.time).toISOString()}});}
 async read(arrivals){if(!this.enabled()||this.polling)return;this.polling=true;try{const triples=arrivals.filter(a=>!a.unmatched).slice(0,40).map(a=>({trip_id:a.trip.trip_id,service_date:a.day.date,stop_sequence:a.s.seq}));this.summaries=await this.rpc('tuka_recent_reports',{trips:triples})||[];}finally{this.polling=false;}}
}
