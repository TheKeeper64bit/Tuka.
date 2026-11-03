import './network-picker.js?v=1';
import {polishHeader} from './header.js?v=1';

const $ = selector => document.querySelector(selector);
let cityId = localStorage.getItem('tuka-meta-city') || 'skopje';
let stopId = '';
let cityPending = false;
let requestPending = false;
let cityRevision = 0;

function createPanel() {
  const opener = document.createElement('button');
  opener.id = 'meta-open';
  opener.type = 'button';
  opener.className = 'meta-open';
  opener.setAttribute('aria-label', 'Open Tuka Meta Copilot');
  opener.innerHTML = '<span class="meta-orb" aria-hidden="true">✦</span><span>Meta Copilot</span>';
  $('.headtools')?.prepend(opener);

  const dialog = document.createElement('dialog');
  dialog.id = 'meta-lab';
  dialog.className = 'meta-dialog';
  dialog.setAttribute('aria-labelledby', 'meta-title');
  dialog.innerHTML = `
    <form method="dialog" class="meta-head">
      <div><span class="meta-kicker">TUKA · META AI</span><h2 id="meta-title">Where are you headed?</h2>
      <p>Ask about transit nearby or start a journey in your own words.</p></div>
      <button class="meta-close" aria-label="Close Copilot">×</button>
    </form>
    <div class="meta-chat">
      <div class="meta-context"><span id="meta-city-status" role="status">Loading network…</span></div>
      <div class="meta-modes" role="group" aria-label="Copilot mode">
        <button type="button" data-meta-mode="ask" aria-pressed="true">Ask about transit</button>
        <button type="button" data-meta-mode="plan" aria-pressed="false">Plan a journey</button>
      </div>
      <div id="meta-chat-log" class="meta-chat-log" role="log" aria-label="Copilot conversation"></div>
      <form id="meta-ask" class="meta-ask">
        <input id="meta-question" maxlength="1200" autocomplete="off" aria-label="Ask Tuka Copilot">
        <button class="primary" type="submit">Ask</button>
      </form>
      <p class="meta-help" id="meta-help"></p>
      <details class="meta-profiles"><summary>Switch network</summary><div id="meta-cities" class="meta-cities"></div></details>
    </div>`;
  document.body.append(dialog);
  return {dialog, opener};
}

function appendMessage(log, text, kind) {
  const item = document.createElement('p');
  item.className = `meta-message meta-message-${kind}`;
  item.textContent = text;
  log.append(item);
  log.scrollTop = log.scrollHeight;
}

function init() {
  document.body.classList.add('has-city-picker', 'meta-polished');
  const {dialog, opener} = createPanel();
  const form = $('#meta-ask'), input = $('#meta-question'), submit = form.querySelector('button');
  const log = $('#meta-chat-log'), status = $('#meta-city-status'), profiles = $('#meta-cities');
  let mode = 'ask';
  let loaded = false;
  let loading = false;
  let cityName = '';
  const imported = () => cityId.startsWith('gtfs-');
  const sync = () => {
    submit.disabled = cityPending || requestPending || imported();
    submit.textContent = requestPending ? 'Thinking…' : mode === 'plan' ? 'Review trip' : 'Ask';
    input.disabled = imported();
    input.placeholder = mode === 'plan' ? 'e.g. Get me to the station by 8:30' : 'e.g. What buses serve this area?';
    $('#meta-help').textContent = imported()
      ? 'This timetable is stored on your device. Open Journey to plan with it.'
      : mode === 'plan' ? 'Tuka opens the planner so you can review the details before searching.' : 'Copilot uses available network data. Check the timetable before leaving.';
    profiles.querySelectorAll('button').forEach(button => {
      const current = button.dataset.cityId === cityId;
      button.classList.toggle('selected', current);
      button.setAttribute('aria-pressed', String(current));
    });
  };

  async function loadCities() {
    if (loaded || loading) return;
    loading = true;
    profiles.textContent = 'Loading networks…';
    try {
      const response = await fetch('./api/cities', {credentials: 'same-origin', headers: {Accept: 'application/json'}});
      if (!response.ok) throw new Error('Network profiles unavailable');
      const {cities = []} = await response.json();
      profiles.replaceChildren();
      for (const city of cities) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'meta-city';
        button.dataset.cityId = city.id;
        button.textContent = city.name;
        button.addEventListener('click', () => {
          if (city.id === cityId && !cityPending) return;
          cityPending = true;
          cityRevision++;
          status.textContent = `Loading ${city.name}…`;
          sync();
          document.dispatchEvent(new CustomEvent('tuka-test-city', {detail: {cityId: city.id}}));
        });
        profiles.append(button);
      }
      loaded = true;
      cityName ||= cities.find(city => city.id === cityId)?.name || 'Selected network';
      if (!cityPending) status.textContent = cityName;
      sync();
    } catch {
      profiles.textContent = 'Network profiles are unavailable. Reopen Copilot to retry.';
      if (!cityName && !cityPending) status.textContent = 'Selected network';
    } finally {
      loading = false;
    }
  }

  opener.addEventListener('click', () => {
    dialog.showModal();
    loadCities();
  });
  dialog.querySelectorAll('[data-meta-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.metaMode;
    dialog.querySelectorAll('[data-meta-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    sync();
  }));
  document.addEventListener('tuka-test-city-active', event => {
    if (!event.detail?.cityId) return;
    const changed = cityId !== event.detail.cityId;
    cityId = event.detail.cityId;
    cityName = event.detail.name;
    if (changed) {
      cityRevision++;
      stopId = '';
      log.replaceChildren();
    }
    cityPending = false;
    status.textContent = cityName;
    sync();
  });
  document.addEventListener('tuka-test-stop-active', event => { stopId = String(event.detail?.stopId || ''); });
  document.addEventListener('tuka-city-error', event => {
    cityPending = false;
    status.textContent = event.detail.message;
    sync();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || submit.disabled) return;
    const revision = cityRevision;
    const planning = mode === 'plan';
    input.value = '';
    appendMessage(log, message, 'user');
    requestPending = true;
    sync();
    try {
      const response = await fetch(planning ? './api/meta/interpret' : './api/meta/ask', {
        method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(35000),
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({message, cityId, stopId}),
      });
      const data = await response.json();
      if (revision !== cityRevision) return;
      if (response.ok && planning && data.intent) {
        dialog.close();
        document.dispatchEvent(new CustomEvent('tuka-plan-intent', {detail: data}));
      } else {
        appendMessage(log, data.answer || data.error || 'Copilot could not answer this request.', response.ok ? 'ai' : 'error');
      }
    } catch {
      if (revision === cityRevision) appendMessage(log, 'Copilot is unavailable right now. You can still use Journey.', 'error');
    } finally {
      requestPending = false;
      sync();
    }
  });
  sync();
}

function start() {
  init();
  polishHeader(document);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
else start();
