(()=>{
const screen=document.querySelector('#boot-screen'),title=document.querySelector('#boot-title'),status=document.querySelector('#boot-status'),proceed=document.querySelector('#boot-continue'),retry=document.querySelector('#boot-retry'),ready=new Set();
// This blocking bootstrap paints saved-language copy before the app modules load.
// The boot screen owns its text so the general translator cannot save translated
// text as an English original when a passenger changes language during loading.
const copy={
 'Your next bus, almost here.':['Вашиот следен автобус е речиси тука.','Autobusi juaj i radhës është afër.'],
 'Finding your location and loading nearby stops…':['Ја наоѓаме вашата локација и ги вчитуваме блиските постојки…','Duke gjetur vendndodhjen tuaj dhe duke ngarkuar stacionet afër…'],
 'Finding your location…':['Ја наоѓаме вашата локација…','Duke gjetur vendndodhjen tuaj…'],
 'Loading bus stops and routes…':['Се вчитуваат постојките и автобуските линии…','Duke ngarkuar stacionet dhe linjat e autobusëve…'],
 'Getting your map ready…':['Ја подготвуваме вашата карта…','Duke përgatitur hartën tuaj…'],
 'This is taking longer than usual. You can open the map while loading continues.':['Ова трае подолго од вообичаено. Можете да ја отворите картата додека вчитувањето продолжува.','Kjo po zgjat më shumë se zakonisht. Mund ta hapni hartën ndërsa ngarkimi vazhdon.'],
 'Continue to map':['Продолжи кон картата','Vazhdo te harta'],
 'Try again':['Обидете се повторно','Provoni përsëri'],
 'Bus schedules could not load. Check your connection and try again.':['Возните редови не може да се вчитаат. Проверете ја врската и обидете се повторно.','Oraret e autobusëve nuk mund të ngarkoheshin. Kontrolloni lidhjen dhe provoni përsëri.'],
 'Map could not load. Please refresh.':['Картата не може да се вчита. Освежете ја страницата.','Harta nuk mund të ngarkohej. Rifreskoni faqen.'],
};
const dutch={"Your next bus, almost here.": "Je volgende bus is er bijna.", "Finding your location and loading nearby stops…": "Je locatie bepalen en haltes in de buurt laden…", "Finding your location…": "Je locatie bepalen…", "Loading bus stops and routes…": "Bushaltes en lijnen laden…", "Getting your map ready…": "Je kaart voorbereiden…", "This is taking longer than usual. You can open the map while loading continues.": "Dit duurt langer dan normaal. Je kunt de kaart openen terwijl het laden doorgaat.", "Continue to map": "Doorgaan naar de kaart", "Try again": "Opnieuw proberen", "Bus schedules could not load. Check your connection and try again.": "Busdienstregelingen konden niet worden geladen. Controleer je verbinding en probeer het opnieuw.", "Map could not load. Please refresh.": "De kaart kon niet worden geladen. Vernieuw de pagina."};
let locale='en',statusText='Finding your location and loading nearby stops…',failed=false,finished=false;
try{const saved=localStorage.getItem('tuka-language');if(['mk','sq','en','nl'].includes(saved))locale=saved;}catch{}
const text=value=>locale==='en'?value:locale==='nl'?dutch[value]||value:copy[value]?.[locale==='mk'?0:1]||value;
function paint(){
 screen.lang=locale;
 title.textContent=text('Your next bus, almost here.');status.textContent=text(statusText);
 proceed.textContent=text('Continue to map');retry.textContent=text('Try again');
 title.style.visibility='';status.style.visibility='';
}
function finish(){finished=true;screen.hidden=true;}
function check(){if(finished)return;if(!failed&&ready.size===3)finish();}
window.tukaBoot={
 city(name){const label=document.querySelector('.boot-city-label');if(label)label.textContent=(name||'Your city').toUpperCase()+', IN MOTION';},
 ready(part){ready.add(part);if(!failed){statusText=ready.has('schedule')&&!ready.has('location')?'Finding your location…':ready.has('location')&&!ready.has('schedule')?'Loading bus stops and routes…':'Getting your map ready…';paint();}check();},
 fail(message){failed=true;statusText=message;paint();retry.hidden=false;proceed.hidden=false;},
};
document.addEventListener('tuka-language',event=>{if(['mk','sq','en','nl'].includes(event.detail)){locale=event.detail;paint();}});
proceed.onclick=finish;retry.onclick=()=>location.reload();
paint();

setTimeout(()=>{if(!finished){if(!failed)statusText='This is taking longer than usual. You can open the map while loading continues.';paint();proceed.hidden=false;retry.hidden=false;}},25000);
})();
