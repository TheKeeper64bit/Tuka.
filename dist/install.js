(()=>{
 let promptEvent=null;
 const button=document.querySelector('#install-app'),dialog=document.querySelector('#install-dialog'),confirm=document.querySelector('#install-confirm'),help=document.querySelector('#install-help');
 const mode=window.matchMedia?.('(display-mode: standalone)');
 const standalone=()=>mode?.matches||navigator.standalone===true;
 function instructions(){
  const ua=navigator.userAgent||'',ipad=/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1;
  if(/iphone|ipad|ipod/i.test(ua)||ipad)return 'Open Tuka in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if offered, then tap Add.';
  if(/android/i.test(ua))return 'Open Tuka in Chrome or Edge, tap the browser menu ⋮, then Install app or Add to Home screen. If you opened it inside ChatGPT or another app, choose Open in browser first.';
  if(/Safari/i.test(ua)&&!/Chrome|Chromium|Edg/i.test(ua)&&/Macintosh/i.test(ua))return 'In Safari on Mac, choose File → Add to Dock. You can also open Tuka in Chrome or Edge and use the install icon in the address bar.';
  return 'In Chrome or Edge, use the install icon in the address bar or the browser menu → Install Tuka. If this browser does not offer installation, open the site in a supported browser.';
 }
 function update(){button.hidden=standalone();confirm.hidden=!promptEvent;help.textContent=promptEvent?'Tap Install Tuka below to add the app to this device.':instructions();}
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;update();});
 window.addEventListener('appinstalled',()=>{promptEvent=null;button.hidden=true;dialog.close();});
 mode?.addEventListener?.('change',update);
 button.onclick=()=>{update();dialog.showModal();};
 document.querySelector('#install-close').onclick=()=>dialog.close();
 confirm.onclick=async()=>{const event=promptEvent;if(!event)return;confirm.disabled=true;try{await event.prompt();const choice=await event.userChoice;promptEvent=null;confirm.hidden=true;help.textContent=choice.outcome==='accepted'?'Installation requested. Your browser will finish adding Tuka.':'Installation cancelled. You can install later from the browser menu.';}catch{promptEvent=null;confirm.hidden=true;help.textContent=instructions();}finally{confirm.disabled=false;}};
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
 update();
})();
