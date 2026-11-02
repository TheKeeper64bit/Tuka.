// Timetables stay local; profiles are restored before city selection or offline use.
import {registerProvider} from './city-providers.js?v=3';
const DB='tuka-imported-networks';
function open(){return new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('This browser cannot store imported networks.'));return;}
 const request=indexedDB.open(DB,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('feeds',{keyPath:'id'});
 request.onblocked=()=>reject(Error('Close other Tuka tabs and try again.'));
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
async function operation(mode,action){const db=await open();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('feeds',mode);let value;
 const request=action(tx.objectStore('feeds'));request.onsuccess=()=>value=request.result;
 tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save this timetable.'));
});}finally{db.close();}}
export const readImportedFeed=id=>operation('readonly',store=>store.get(id));
export const saveImportedFeed=record=>operation('readwrite',store=>store.put(record));
export const deleteImportedFeed=id=>operation('readwrite',store=>store.delete(id));
export async function restoreImportedFeeds(){
 if(typeof indexedDB==='undefined')return [];
 const records=await operation('readonly',store=>store.getAll());const profiles=[];
 for(const record of records)try{registerProvider(record.profile);profiles.push(record.profile);}catch{}
 return profiles;
}
