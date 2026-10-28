import {createTicketStore} from './ticket-store.js?v=1';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const WALLET_ERRORS=Object.freeze({
  'invalid-name':'Enter a card name of up to 60 characters.',
  'invalid-total':'Total uses must be a whole number from 1 to 9999.',
  'invalid-remaining':'Uses left must be a whole number between zero and total uses.',
  'invalid-image':'Choose a PNG, JPEG or WebP image.',
  'image-too-large':'Choose an image smaller than 8 MB.',
  'image-unreadable':'This image could not be opened. Try a different screenshot.',
  'limit-reached':'You can save up to 10 QR cards. Remove a card before adding another.',
  'not-found':'This card was removed in another tab. The list has been refreshed.',
  'conflict':'This card changed in another tab. Check the latest counts and try again.',
  'exhausted':'No uses left in your manual counter.',
  'nothing-to-undo':'There is no usage to undo.',
  'storage-unavailable':'Card storage is unavailable in this browser. Nothing was saved.',
  'storage-blocked':'Close other Tuka tabs and try again to open card storage.',
  'storage-quota':'This browser has no space for the image. Remove an old card or choose a smaller image.',
  'storage-error':'The change could not be saved. Please try again.',
});
function imageError(code){return Object.assign(new Error(code),{code});}
export function validateImageFile(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size)throw imageError('invalid-image');
  if(file.size>8*1024*1024)throw imageError('image-too-large');
  return file;
}
export async function inspectImage(file,{ImageClass=globalThis.Image,urls=URL}={}){
  validateImageFile(file);
  const url=urls.createObjectURL(file);
  try{
    const image=new ImageClass();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
    if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>32000000)throw Error();
    return file;
  }catch{throw imageError('image-unreadable');}
  finally{urls.revokeObjectURL(url);}
}
export function walletCardMarkup(card,url){
  return `<article class="qr-card" data-card="${esc(card.id)}"><div class="qr-card-top"><button type="button" class="qr-thumbnail" data-qr-action="show" aria-label="Show QR image"><img src="${esc(url)}" alt="Saved QR image" loading="lazy"></button><div class="qr-card-title"><span class="qr-kicker">SAVED IMAGE</span><h4 data-no-translate>${esc(card.name)}</h4><button type="button" class="qr-link" data-qr-action="show">Show QR image ↗</button></div></div><dl class="qr-counts"><div><dt>Uses left</dt><dd>${card.remaining}</dd></div><div><dt>Used</dt><dd>${card.total-card.remaining}</dd></div><div><dt>Total uses</dt><dd>${card.total}</dd></div></dl><p class="qr-counter-note">Manual counter · not synced with SkopjeBus</p><div class="qr-card-actions"><button type="button" class="qr-primary" data-qr-action="use" ${card.remaining===0?'disabled':''}>${card.remaining===0?'No uses left':'Mark as used'}</button>${card.canUndo?'<button type="button" class="qr-secondary" data-qr-action="undo">Undo last use</button>':''}<button type="button" class="qr-link" data-qr-action="edit">Edit card</button><button type="button" class="qr-link" data-qr-action="remove">Remove</button></div><div class="qr-remove" hidden><p>Remove this saved image and counter from this browser?</p><button type="button" class="qr-secondary" data-qr-action="confirm-remove">Remove card</button><button type="button" class="qr-link" data-qr-action="cancel-remove">Keep card</button></div></article>`;
}
export function createTicketWallet(root,{store=createTicketStore(),urls=URL,inspect=inspectImage}={}){
  const doc=root.ownerDocument;
  root.classList.add('qr-wallet');
  root.innerHTML=`<div class="qr-wallet-heading"><div><span class="qr-kicker">ON THIS DEVICE</span><h3>Your QR cards</h3></div><button type="button" class="qr-secondary" data-qr-add>+ Import QR image</button></div><p class="qr-wallet-intro">Import a SkopjeBus QR image and keep track of your uses.</p><p class="qr-warning">SkopjeBus QR codes can refresh or expire. A saved image may not be accepted; use the official app if needed.</p><div class="qr-feedback" role="status" aria-live="polite" data-qr-feedback></div><form class="qr-editor" data-qr-form hidden><h4 data-qr-form-title>Import QR image</h4><label>Card name<input name="name" maxlength="60" required autocomplete="off" placeholder="My JSP card"></label><div class="qr-fields"><label>Total uses<input name="total" type="number" inputmode="numeric" min="1" max="9999" step="1" value="10" required></label><label>Uses left<input name="remaining" type="number" inputmode="numeric" min="0" max="9999" step="1" value="10" required></label></div><label>QR image<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required></label><p class="qr-help">PNG, JPEG or WebP · up to 8 MB. Keep the entire QR code and its white border visible.</p><img class="qr-preview" data-qr-preview alt="QR image preview" hidden><p class="qr-form-error" data-qr-form-error role="alert"></p><div class="qr-editor-actions"><button type="submit" class="qr-primary" data-qr-save>Save card</button><button type="button" class="qr-secondary" data-qr-cancel>Cancel</button></div></form><div class="qr-card-list" data-qr-list aria-busy="true"></div><p class="qr-privacy">Images and counts stay in this browser. Clearing browser data removes them. Each Tuka site keeps its own cards.</p><dialog class="qr-viewer" data-qr-viewer aria-label="Saved QR image"><div class="qr-viewer-head"><strong data-qr-viewer-name data-no-translate></strong><button type="button" class="qr-secondary" data-qr-viewer-close>Close</button></div><div class="qr-image-surface"><img data-qr-viewer-image alt="Saved QR image"></div><p>Saved image · validity is not verified</p></dialog>`;
  const find=selector=>root.querySelector(selector);
  const list=find('[data-qr-list]'),form=find('[data-qr-form]'),add=find('[data-qr-add]'),feedback=find('[data-qr-feedback]'),formError=find('[data-qr-form-error]');
  const viewer=find('[data-qr-viewer]'),viewerImage=find('[data-qr-viewer-image]'),preview=find('[data-qr-preview]');
  let cards=[],cardURLs=[],previewURL,viewerURL,viewerCard=null,editing=null,selectedImage=null,busy=false,imagePending=false,imageToken=0,loadToken=0,lastUseClick=0;
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('tuka-qr-'+new URL('./',import.meta.url).pathname):null;
  function message(text,error=false){feedback.textContent=text;feedback.dataset.error=String(error);}
  function errorText(error){return WALLET_ERRORS[error?.code]||WALLET_ERRORS['storage-error'];}
  function render(){
    cardURLs.forEach(url=>urls.revokeObjectURL(url));cardURLs=[];
    list.innerHTML=cards.length?cards.map(card=>{const url=urls.createObjectURL(card.image);cardURLs.push(url);return walletCardMarkup(card,url);}).join(''):'<p class="qr-empty">No QR cards saved yet. Import an image to keep it close at hand.</p>';
    add.disabled=busy||cards.length>=10;
  }
  async function refresh(){
    const token=++loadToken;
    list.setAttribute('aria-busy','true');
    try{const loaded=await store.list();if(token!==loadToken)return;cards=loaded;render();if(viewerCard){const current=cards.find(card=>card.id===viewerCard.id);if(!current)closeViewer();else if(current.version!==viewerCard.version)setViewerImage(current);}}
    catch(error){if(token===loadToken)message(errorText(error),true);}
    finally{if(token===loadToken)list.setAttribute('aria-busy','false');}
  }
  function clearPreview(){if(previewURL)urls.revokeObjectURL(previewURL);previewURL=null;preview.removeAttribute('src');preview.hidden=true;}
  function setPreview(image){clearPreview();if(image){previewURL=urls.createObjectURL(image);preview.src=previewURL;preview.hidden=false;}}
  function closeEditor(){++imageToken;imagePending=false;selectedImage=null;editing=null;form.reset();form.hidden=true;formError.textContent='';find('[data-qr-save]').disabled=busy;clearPreview();}
  function openEditor(card){
    closeEditor();editing=card||null;form.hidden=false;form.elements.name.value=card?.name||'';form.elements.total.value=card?.total??10;form.elements.remaining.value=card?.remaining??10;form.elements.image.required=!card;
    find('[data-qr-form-title]').textContent=card?'Edit card':'Import QR image';setPreview(card?.image);form.elements.name.focus();form.scrollIntoView({block:'nearest'});
  }
  function setBusy(value){busy=value;for(const control of root.querySelectorAll('button,input'))control.disabled=value;add.disabled=value||cards.length>=10;if(!value)for(const card of cards)if(card.remaining===0)list.querySelector(`[data-card="${card.id}"] [data-qr-action="use"]`)?.setAttribute('disabled','');}
  function closeViewer(){if(viewer.open)viewer.close();viewerImage.removeAttribute('src');if(viewerURL)urls.revokeObjectURL(viewerURL);viewerURL=null;viewerCard=null;}
  function setViewerImage(card){if(viewerURL)urls.revokeObjectURL(viewerURL);viewerURL=urls.createObjectURL(card.image);viewerImage.src=viewerURL;viewerCard={id:card.id,version:card.version};find('[data-qr-viewer-name]').textContent=card.name;}
  function show(card){setViewerImage(card);if(!viewer.open)viewer.showModal();}
  async function mutate(action,card){
    if(busy)return;
    setBusy(true);message('');
    try{
      if(action==='use')await store.use(card.id,card.version);
      if(action==='undo')await store.undo(card.id,card.version);
      if(action==='confirm-remove')await store.remove(card.id,card.version);
      await refresh();channel?.postMessage('changed');
      message(action==='use'?'One use recorded. You can undo it below.':action==='undo'?'Last use undone.':'Card removed from this browser.');
    }catch(error){await refresh();message(errorText(error),true);}
    finally{setBusy(false);const target=action==='confirm-remove'?add:list.querySelector(`[data-card="${card.id}"] [data-qr-action="${action==='use'?'undo':'use'}"]`);target?.focus();}
  }
  add.onclick=()=>openEditor();find('[data-qr-cancel]').onclick=()=>{closeEditor();add.focus();};
  form.elements.image.onchange=async()=>{
    const token=++imageToken,file=form.elements.image.files?.[0];selectedImage=null;imagePending=false;formError.textContent='';setPreview(editing?.image);
    if(!file)return;
    imagePending=true;find('[data-qr-save]').disabled=true;
    try{await inspect(file);if(token!==imageToken)return;selectedImage=file;setPreview(file);}
    catch(error){if(token===imageToken){formError.textContent=errorText(error);form.elements.image.value='';}}
    finally{if(token===imageToken){imagePending=false;find('[data-qr-save]').disabled=busy;}}
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||imagePending)return;if(!form.reportValidity())return;
    const data={name:form.elements.name.value,total:Number(form.elements.total.value),remaining:Number(form.elements.remaining.value)};
    if(selectedImage)data.image=selectedImage;
    else if(!editing){formError.textContent=WALLET_ERRORS['invalid-image'];return;}
    setBusy(true);formError.textContent='';
    try{if(editing)await store.update(editing.id,data,editing.version);else await store.add(data);closeEditor();await refresh();channel?.postMessage('changed');message('Card saved on this device.');}
    catch(error){formError.textContent=errorText(error);if(['conflict','not-found'].includes(error?.code)){await refresh();editing=cards.find(card=>card.id===editing?.id)||null;if(editing){form.elements.name.value=editing.name;form.elements.total.value=editing.total;form.elements.remaining.value=editing.remaining;if(!selectedImage)setPreview(editing.image);}else{closeEditor();message(errorText(error),true);}}}
    finally{setBusy(false);if(form.hidden)add.focus();}
  };
  list.addEventListener('click',event=>{
    const button=event.target.closest('[data-qr-action]');if(!button||busy)return;
    const article=button.closest('[data-card]'),card=cards.find(item=>item.id===article?.dataset.card);if(!card)return;
    const action=button.dataset.qrAction;
    if(action==='use'){const now=Date.now();if(now-lastUseClick<700)return;lastUseClick=now;}
    if(action==='show')show(card);
    else if(action==='edit')openEditor(card);
    else if(action==='remove'){article.querySelector('.qr-remove').hidden=false;article.querySelector('[data-qr-action="confirm-remove"]').focus();}
    else if(action==='cancel-remove'){article.querySelector('.qr-remove').hidden=true;button.closest('article').querySelector('[data-qr-action="remove"]').focus();}
    else mutate(action,card);
  });
  find('[data-qr-viewer-close]').onclick=closeViewer;viewer.addEventListener('close',closeViewer);
  channel?.addEventListener('message',()=>{if(!busy)refresh();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden&&!busy)refresh();});
  const ready=refresh();
  return {refresh,ready};
}
if(typeof document!=='undefined')for(const root of document.querySelectorAll('[data-ticket-wallet]'))createTicketWallet(root);
