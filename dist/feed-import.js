import {registerProvider,unregisterProvider,hasProvider,providerFor} from './city-providers.js?v=3';
import {saveImportedFeed,deleteImportedFeed} from './feed-store.js?v=1';
import {parseGTFSZip,ZIP_LIMIT} from './gtfs-zip.js?v=1';
import {inspectFeed} from './feed-profile.js?v=1';
export async function reviewFeed(blob,name='',{worker=true}={}){
 if(!blob?.size||blob.size>ZIP_LIMIT)throw Error('Choose a GTFS ZIP smaller than 50 MB. Larger regional feeds need a smaller export.');
 const buffer=await blob.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',buffer);
 const id='gtfs-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 let profile;
 if(worker&&typeof Worker!=='undefined')profile=await new Promise((resolve,reject)=>{
  const task=new Worker(new URL('./feed-import-worker.js?v=1',import.meta.url),{type:'module'}),timer=setTimeout(()=>{task.terminate();reject(Error('Import took too long. Try a smaller feed.'));},60000);
  const done=()=>{clearTimeout(timer);task.terminate();};
  task.onmessage=({data})=>{done();data.error?reject(Error(data.error)):resolve(data.profile);};
  task.onerror=()=>{done();reject(Error('The import worker could not start. Refresh and try again.'));};
  task.postMessage({buffer,id,name},[buffer]);
 });else profile=inspectFeed(await parseGTFSZip(buffer),id,name);
 profile.feedVersion=id.slice(5);return {id,profile,blob,importedAt:new Date().toISOString()};
}
export async function importReviewedFeed(record,{replaceId=null}={}){
 if(replaceId){if(!hasProvider(replaceId)||!providerFor(replaceId).imported)throw Error('Only an imported network can be updated.');record={...record,id:replaceId,profile:{...record.profile,id:replaceId}};}
 // Publish the profile only after the complete ZIP transaction succeeds.
 await saveImportedFeed(record);registerProvider(record.profile);return record.profile;
}
export async function removeImportedFeed(id){await deleteImportedFeed(id);unregisterProvider(id);}
