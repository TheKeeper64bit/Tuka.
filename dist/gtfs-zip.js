function csv(s){let rows=[],row=[],v='',q=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){v+='"';i++}else q=!q}else if(c===','&&!q){row.push(v);v=''}else if(c==='\n'&&!q){row.push(v.replace(/\r$/,''));rows.push(row);row=[];v=''}else v+=c}if(v||row.length){row.push(v.replace(/\r$/,''));rows.push(row)}let h=rows.shift();return rows.filter(r=>r.length===h.length).map(r=>Object.fromEntries(h.map((k,i)=>[k.replace(/^\uFEFF/,''),r[i]])))}
export const ZIP_LIMIT=50*1024*1024;
const EXPANDED_LIMIT=200*1024*1024;
const TABLES=new Set(['agency','stops','routes','trips','stop_times','calendar','calendar_dates','shapes','transfers','feed_info','frequencies','licenses']);
export async function parseGTFSZip(ab){
 if(!(ab instanceof ArrayBuffer)||ab.byteLength<22)throw Error('Invalid GTFS ZIP.');
 if(ab.byteLength>ZIP_LIMIT)throw Error('GTFS ZIP exceeds the 50 MB import limit.');
 const v=new DataView(ab),b=new Uint8Array(ab),out={};let e=b.length-22;
 while(e>=Math.max(0,b.length-65557)&&v.getUint32(e,true)!==0x06054b50)e--;
 if(e<0||v.getUint32(e,true)!==0x06054b50||e+22+v.getUint16(e+20,true)!==b.length)throw Error('Invalid ZIP directory.');
 if(v.getUint16(e+4,true)||v.getUint16(e+6,true))throw Error('Multi-volume ZIP is unsupported.');
 let p=v.getUint32(e+16,true),count=v.getUint16(e+10,true),expanded=0;
 if(count>512)throw Error('ZIP contains too many files.');
 for(let i=0;i<count;i++){
  if(p+46>e||v.getUint32(p,true)!==0x02014b50)throw Error('Invalid ZIP entry.');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),unpacked=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
  if(p+46+nl+el+cl>e)throw Error('Invalid ZIP entry bounds.');
  const path=new TextDecoder().decode(b.slice(p+46,p+46+nl)),name=path.split('/').at(-1),stem=name.replace(/\.txt$/,'');p+=46+nl+el+cl;
  if(!name.endsWith('.txt')||!TABLES.has(stem))continue;
  if(Object.hasOwn(out,name))throw Error('ZIP contains duplicate GTFS tables.');
  if(flags&1)throw Error('Encrypted ZIP files are unsupported.');
  if(local+30>b.length||v.getUint32(local,true)!==0x04034b50)throw Error('Invalid ZIP local entry.');
  const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
  if(start+size>b.length||unpacked>EXPANDED_LIMIT-expanded)throw Error('Expanded GTFS exceeds the 200 MB limit.');
  let data=b.slice(start,start+size);
  if(method===8){
   const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let length=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>EXPANDED_LIMIT-expanded)throw Error('Expanded GTFS exceeds the 200 MB limit.');chunks.push(value);}}finally{await reader.cancel();}
   data=new Uint8Array(length);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  }else if(method!==0)throw Error('Unsupported ZIP compression.');
  if(data.length!==unpacked)throw Error('ZIP table size does not match its directory.');
  expanded+=data.length;out[name]=csv(new TextDecoder('utf-8',{fatal:true}).decode(data));
 }
 if(!Object.keys(out).length)throw Error('No GTFS .txt tables found in this ZIP.');
 return out;
}
