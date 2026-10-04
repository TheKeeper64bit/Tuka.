(()=>{
 let promptEvent=null;
 const button=document.querySelector('#install-app'),dialog=document.querySelector('#install-dialog'),confirm=document.querySelector('#install-confirm'),help=document.querySelector('#install-help');
 const installed=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
 function update(){button.hidden=installed();confirm.hidden=!promptEvent;if(promptEvent)help.textContent='Tap Install Tuka below to add the app to this device.';}
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;update();});
 window.addEventListener('appinstalled',()=>{promptEvent=null;button.hidden=true;dialog.close();});
 button.onclick=()=>{update();dialog.showModal();};
 document.querySelector('#install-close').onclick=()=>dialog.close();
 confirm.onclick=async()=>{const event=promptEvent;if(!event)return;confirm.disabled=true;try{await event.prompt();const choice=await event.userChoice;promptEvent=null;confirm.hidden=true;help.textContent=choice.outcome==='accepted'?'Installation requested. Your browser will finish adding Tuka.':'Installation cancelled. You can install later from the browser menu.';}catch{promptEvent=null;confirm.hidden=true;help.textContent='Open Tuka in Chrome, then use its menu to Install app or Add to Home screen.';}finally{confirm.disabled=false;}};
 if(/iphone|ipad|ipod/i.test(navigator.userAgent||''))help.textContent='Open Tuka in Safari, tap Share, then Add to Home Screen and Open as Web App.';
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
 update();
})();
