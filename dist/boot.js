(()=>{const started=Date.now(),screen=document.querySelector('#boot-screen'),status=document.querySelector('#boot-status'),proceed=document.querySelector('#boot-continue'),retry=document.querySelector('#boot-retry'),ready=new Set();let failed=false,finished=false;
function finish(){finished=true;screen.hidden=true;}
function check(){if(finished)return;if(!failed&&ready.size===3&&Date.now()-started>=10000)finish();}
window.tukaBoot={ready(part){ready.add(part);if(!failed)status.textContent=ready.has('schedule')&&!ready.has('location')?'Finding your location…':ready.has('location')&&!ready.has('schedule')?'Loading bus stops and routes…':'Getting your map ready…';check();},fail(message){failed=true;status.textContent=message;retry.hidden=false;proceed.hidden=false;}};
proceed.onclick=finish;retry.onclick=()=>location.reload();setTimeout(check,10000);setTimeout(()=>{if(!finished){status.textContent=failed?status.textContent:'This is taking longer than usual. You can open the map while loading continues.';proceed.hidden=false;retry.hidden=false;}},25000);
})();
