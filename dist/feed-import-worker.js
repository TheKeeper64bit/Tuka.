import {parseGTFSZip} from './gtfs-zip.js?v=2';
import {inspectFeed} from './feed-profile.js?v=2';
self.onmessage=async({data})=>{try{const tables=await parseGTFSZip(data.buffer);self.postMessage({profile:inspectFeed(tables,data.id,data.name)});}catch(error){self.postMessage({error:error.message||'Could not read this GTFS ZIP.'});}};
