export const TICKET_STORE_LIMITS=Object.freeze({cards:10,name:60,total:9999,imageBytes:8*1024*1024});
const DEFAULT_SCOPE=new URL('./',import.meta.url).pathname;
const TYPES=new Set(['image/png','image/jpeg','image/webp']);

export class TicketStoreError extends Error {
  constructor(code,message){super(message);this.name='TicketStoreError';this.code=code;}
}
const problem=(code,message)=>new TicketStoreError(code,message);
function storageError(error){
  if(error instanceof TicketStoreError)return error;
  if(error?.name==='QuotaExceededError')return problem('storage-quota','Device storage is full. Free some space and try again.');
  if(['SecurityError','NotSupportedError'].includes(error?.name))return problem('storage-unavailable','Ticket storage is unavailable in this browser.');
  return problem('storage-error','The ticket could not be saved or read. Please try again.');
}
function fields(input){
  if(!input||typeof input!=='object')throw problem('invalid-input','Enter valid ticket details.');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>TICKET_STORE_LIMITS.name)throw problem('invalid-name','Give the ticket a name of 1 to 60 characters.');
  if(!Number.isInteger(input.total)||input.total<1||input.total>TICKET_STORE_LIMITS.total)throw problem('invalid-total','Total rides must be a whole number from 1 to 9999.');
  if(!Number.isInteger(input.remaining)||input.remaining<0||input.remaining>input.total)throw problem('invalid-remaining','Remaining rides must be between zero and the total.');
  return {name:input.name.trim(),total:input.total,remaining:input.remaining};
}
async function imageBlob(image){
  if(!(image instanceof Blob)||!TYPES.has(image.type)||!image.size)throw problem('invalid-image','Choose a PNG, JPEG or WebP image.');
  if(image.size>TICKET_STORE_LIMITS.imageBytes)throw problem('image-too-large','Choose an image no larger than 8 MB.');
  let bytes;
  try{bytes=new Uint8Array(await image.slice(0,12).arrayBuffer());}catch{throw problem('invalid-image','The image could not be read. Choose it again.');}
  const isPNG=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  const isJPEG=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const isWebP=[82,73,70,70].every((n,i)=>bytes[i]===n)&&[87,69,66,80].every((n,i)=>bytes[i+8]===n);
  if(!({'image/png':isPNG,'image/jpeg':isJPEG,'image/webp':isWebP}[image.type]))throw problem('invalid-image','The file is not a matching PNG, JPEG or WebP image.');
  return image;
}
function version(card,expectedVersion){
  if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw problem('invalid-version','Reload the ticket before changing it.');
  if(card.version!==expectedVersion)throw problem('conflict','This ticket changed in another tab. Reload it and try again.');
}
function visible(card){
  const {undoState,...value}=card;
  return {...value,canUndo:!!undoState};
}

// Images and counters remain on this device. Every read/change pair happens in
// one readwrite transaction so stale tabs cannot spend or overwrite the same ride.
export function createTicketStore({indexedDB=globalThis.indexedDB,scope=DEFAULT_SCOPE}={}){
  const dbName='tuka-imported-tickets:'+String(scope);
  let database=null,opening=null,closed=false;
  async function open(){
    if(closed)throw problem('closed','Ticket storage is closed. Reopen it to continue.');
    if(!indexedDB?.open)throw problem('storage-unavailable','Ticket storage is unavailable in this browser.');
    if(database)return database;
    if(!opening){
      opening=new Promise((resolve,reject)=>{
        let request,settled=false;
        const fail=error=>{if(!settled){settled=true;reject(error);}};
        try{request=indexedDB.open(dbName,1);}catch(error){fail(storageError(error));return;}
        request.onblocked=()=>fail(problem('storage-blocked','Close other Tuka tabs and try again.'));
        request.onerror=()=>fail(storageError(request.error));
        request.onupgradeneeded=()=>{
          try{if(!request.result.objectStoreNames.contains('cards'))request.result.createObjectStore('cards',{keyPath:'id'});}
          catch(error){fail(storageError(error));try{request.transaction.abort();}catch{}}
        };
        request.onsuccess=()=>{
          const db=request.result;
          if(settled||closed){db.close();fail(problem('closed','Ticket storage is closed. Reopen it to continue.'));return;}
          settled=true;database=db;
          db.onversionchange=()=>{db.close();if(database===db)database=null;opening=null;};
          db.onclose=()=>{if(database===db){database=null;opening=null;}};
          resolve(db);
        };
      }).catch(error=>{opening=null;throw error;});
    }
    return opening;
  }
  async function transaction(mode,work){
    const db=await open();
    if(closed)throw problem('closed','Ticket storage is closed. Reopen it to continue.');
    return new Promise((resolve,reject)=>{
      let tx,result,failure;
      try{tx=db.transaction('cards',mode);}catch(error){reject(storageError(error));return;}
      const fail=error=>{failure=storageError(error);try{tx.abort();}catch{reject(failure);}};
      const watch=(request,success)=>{
        request.onsuccess=()=>{try{success(request.result);}catch(error){fail(error);}};
        request.onerror=()=>{failure=storageError(request.error);};
      };
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(failure||storageError(tx.error));
      tx.onerror=()=>{failure ||= storageError(tx.error);};
      try{work(tx.objectStore('cards'),watch,value=>{result=value;},fail);}catch(error){fail(error);}
    });
  }
  function change(id,expectedVersion,apply){
    return transaction('readwrite',(store,watch,done)=>{
      watch(store.get(id),card=>{
        if(!card)throw problem('not-found','This ticket is no longer saved on this device.');
        version(card,expectedVersion);
        const next=apply(card,Date.now());
        if(next===null){watch(store.delete(id),()=>done(visible(card)));return;}
        next.version=card.version+1;
        watch(store.put(next),()=>done(visible(next)));
      });
    });
  }
  return {
    async list(){
      return transaction('readonly',(store,watch,done)=>watch(store.getAll(),cards=>done(cards.sort((a,b)=>b.updatedAt-a.updatedAt||b.createdAt-a.createdAt||a.id.localeCompare(b.id)).map(visible))));
    },
    async add(input){
      const value=fields(input),image=await imageBlob(input.image);
      return transaction('readwrite',(store,watch,done)=>watch(store.count(),count=>{
        if(count>=TICKET_STORE_LIMITS.cards)throw problem('limit-reached','You can save up to 10 ticket cards. Remove one before adding another.');
        const now=Date.now(),card={id:crypto.randomUUID(),...value,image,version:1,createdAt:now,updatedAt:now,lastUsedAt:null,undoState:null};
        watch(store.add(card),()=>done(visible(card)));
      }));
    },
    async update(id,patch,expectedVersion){
      if(!patch||typeof patch!=='object')throw problem('invalid-input','Enter valid ticket details.');
      const image=patch.image===undefined?undefined:await imageBlob(patch.image);
      return change(id,expectedVersion,(card,now)=>{
        const value=fields({name:Object.hasOwn(patch,'name')?patch.name:card.name,total:Object.hasOwn(patch,'total')?patch.total:card.total,remaining:Object.hasOwn(patch,'remaining')?patch.remaining:card.remaining});
        return {...card,...value,image:image===undefined?card.image:image,updatedAt:now,undoState:null};
      });
    },
    async use(id,expectedVersion){
      return change(id,expectedVersion,(card,now)=>{
        if(card.remaining===0)throw problem('exhausted','There are no rides left in this manual counter.');
        return {...card,remaining:card.remaining-1,lastUsedAt:now,updatedAt:now,undoState:{remaining:card.remaining,lastUsedAt:card.lastUsedAt}};
      });
    },
    async undo(id,expectedVersion){
      return change(id,expectedVersion,(card,now)=>{
        if(!card.undoState)throw problem('nothing-to-undo','There is no recent counter change to undo.');
        return {...card,remaining:card.undoState.remaining,lastUsedAt:card.undoState.lastUsedAt,updatedAt:now,undoState:null};
      });
    },
    async remove(id,expectedVersion){return change(id,expectedVersion,()=>null);},
    close(){closed=true;database?.close();database=null;opening=null;},
  };
}
