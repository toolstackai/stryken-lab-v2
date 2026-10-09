// Extras del informe post-partida (V2): panel de RANGO (clasificatoria) y VOTACIÓN DE MAPA (10 s, 3 mapas).
import { rankBadge, rankOf, RANKS } from '../data/ranks.js';
import { MAP_NAMES } from '../data/maps.js';
import { mapThumb } from '../gfx/icons.js';
import { play } from '../game/audio.js';
import { TRACK } from '../data/events.js';
import { WEAPONS } from '../data/weapons.js';

const VOTE_POOL = ['harbor', 'foundry', 'shrine', 'pier', 'kiln'];

export function aarExtras(ui, el, r, m) {
  const box = document.createElement('div');
  box.className = 'aarx';
  const parts = [];
  if (r.ranked) parts.push(rankedHTML(r));
  if (r.event) parts.push(eventHTML(r));
  const unlocks = [];
  if (r.rankReward) unlocks.push(['RANK REWARD', r.rankReward.name]);
  if (r.event) for (const t of r.event.got) unlocks.push(['EVENT REWARD', t.name]);
  for (const id of r.mastered || []) unlocks.push(['WEAPON MASTERY', `${WEAPONS[id].name} · MASTERY GOLD CAMO`]);
  if (unlocks.length) parts.push(`<div class="aarx-unlock">${unlocks.map(([k, v], i) => `<div style="animation-delay:${2.2 + i * 0.25}s"><small>${k} · EXCLUSIVE</small><b>${v}</b></div>`).join('')}</div>`);
  const vote = !m.br && voteMaps(m);
  if (vote) parts.push(voteHTML(vote));
  if (!parts.length) return () => {};
  box.innerHTML = parts.join('');
  el.querySelector('.aar-btns').before(box);
  const stops = [];
  if (r.ranked) stops.push(animateRank(box, r));
  if (vote) stops.push(runVote(ui, box, vote, m));
  return () => stops.forEach(f => f && f());
}

// ---------------- Rango ----------------
function rankedHTML(r) {
  const R = r.ranked, a = R.after, b = R.before;
  const up = R.delta >= 0;
  const note = R.promoted ? `PROMOTED TO ${a.rank.name}` : R.demoted ? `DEMOTED TO ${a.label}` : R.protectedLoss ? 'RANK PROTECTED' : a.div !== b.div ? `${up ? 'UP' : 'DOWN'} TO ${a.label}` : '';
  return `<div class="aarx-rank ${up ? 'up' : 'down'} ${R.promoted ? 'promo' : ''}">
    <div class="ax-badge" id="ax-badge">${rankBadge(R.rp - R.delta, { size: 84 })}</div>
    <div class="ax-mid">
      <small>RANKED · ARENA</small>
      <b id="ax-label">${b.label}</b>
      <div class="ax-bar"><i id="ax-fill" style="width:${(b.prog * 100).toFixed(1)}%"></i><s id="ax-gain"></s></div>
      <div class="ax-rp"><span id="ax-rp">${R.rp - R.delta}</span> RP <em class="${up ? 'g' : 'r'}">${up ? '+' : ''}${R.delta}</em>${r.perf != null ? `<span class="ax-perf">PERFORMANCE ${Math.round(r.perf * 100)}%</span>` : ''}</div>
    </div>
    <div class="ax-note" id="ax-note">${note}</div>
  </div>`;
}
function animateRank(box, r) {
  const R = r.ranked, from = R.rp - R.delta, to = R.rp;
  let t = 0, done = false, lastI = rankOf(from).i, lastDiv = rankOf(from).div;
  const fill = box.querySelector('#ax-fill'), lab = box.querySelector('#ax-label'), rpEl = box.querySelector('#ax-rp'), badge = box.querySelector('#ax-badge'), note = box.querySelector('#ax-note');
  const iv = setInterval(() => {
    t += 0.05;
    const k = Math.max(0, Math.min(1, (t - 1.8) / 1.4)); // empieza cuando el XP ya contó
    const e = 1 - Math.pow(1 - k, 3);
    const rp = Math.round(from + (to - from) * e);
    const q = rankOf(rp);
    rpEl.textContent = rp; fill.style.width = (q.prog * 100).toFixed(1) + '%'; lab.textContent = q.label;
    if (q.i !== lastI || q.div !== lastDiv) {
      badge.innerHTML = rankBadge(rp, { size: 84 });
      badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop');
      play(q.i > lastI || (q.i === lastI && q.div > lastDiv) ? 'levelup' : 'armorBreak');
      lastI = q.i; lastDiv = q.div;
    }
    if (k >= 1 && !done) { done = true; clearInterval(iv); if (note.textContent) { note.classList.add('on'); if (R.promoted) play('podium'); } }
  }, 50);
  return () => clearInterval(iv);
}

// ---------------- Evento ----------------
function eventHTML(r) {
  const E = r.event, max = TRACK[TRACK.length - 1].pts;
  const pct = (v) => Math.min(100, v / max * 100).toFixed(1);
  return `<div class="aarx-event"><div class="ae-h"><small>WEEKEND EVENT</small><b>${E.ev.name}</b><span>+${E.after - E.before} PTS · ${Math.min(E.after, max)}/${max}</span></div>
    <div class="ae-track"><i class="ae-was" style="width:${pct(E.before)}%"></i><i class="ae-now" style="width:${pct(E.after)}%"></i>
    ${TRACK.map(t => `<em class="${E.after >= t.pts ? 'got' : ''}" style="left:${pct(t.pts)}%"><b>${t.pts}</b><span>${t.name}</span></em>`).join('')}</div></div>`;
}

// ---------------- Votación de mapa ----------------
function voteMaps(m) {
  const list = (m.mode.maps || []).filter(id => id !== m.mapId);
  // en Arena sólo mapas con bases de equipo (pequeños y simétricos)
  const extra = m.mode.arena ? ['pier', 'kiln', 'foundry'] : VOTE_POOL;
  const pool = [...new Set([...list, ...extra.filter(id => id !== m.mapId)])];
  const maps = pool.slice(0, 3);
  return maps.length >= 2 ? maps : null;
}
function voteHTML(maps) {
  return `<div class="aarx-vote"><div class="av-h"><b>NEXT MAP</b><span>VOTE · <i id="av-t">10</i>s</span></div>
    <div class="av-cards">${maps.map(id => `<button class="av-card" data-map="${id}" style="background-image:url(${mapThumb(id)})"><span>${MAP_NAMES[id]}</span><em><i></i><b>0</b></em></button>`).join('')}</div></div>`;
}
function runVote(ui, box, maps, m) {
  const votes = Object.fromEntries(maps.map(id => [id, 0]));
  const voters = m.actors.filter(a => a.isBot).map(a => ({ at: 0.6 + Math.random() * 8, pick: maps[Math.floor(Math.random() * maps.length)] }));
  let mine = null, t = 0, closed = false;
  const cards = [...box.querySelectorAll('.av-card')];
  const total = () => Object.values(votes).reduce((s, v) => s + v, 0) || 1;
  const paint = () => cards.forEach(c => {
    const id = c.dataset.map, v = votes[id];
    c.querySelector('b').textContent = v; c.querySelector('i').style.width = (v / total() * 100) + '%';
    c.classList.toggle('mine', mine === id);
  });
  cards.forEach(c => c.addEventListener('click', () => {
    if (closed) return;
    if (mine) votes[mine]--;
    mine = c.dataset.map; votes[mine]++; play('ui'); paint();
  }));
  const finish = () => {
    if (closed) return; closed = true; clearInterval(iv);
    const best = Math.max(...Object.values(votes));
    const tied = maps.filter(id => votes[id] === best);
    const win = mine && tied.includes(mine) ? mine : tied[Math.floor(Math.random() * tied.length)];
    cards.forEach(c => c.classList.toggle('won', c.dataset.map === win));
    box.querySelector('.av-h span').textContent = MAP_NAMES[win] + ' SELECTED';
    if (ui.app.lastMatchOpts) ui.app.lastMatchOpts = { ...ui.app.lastMatchOpts, map: win };
    play('medal');
  };
  const iv = setInterval(() => {
    t += 0.1;
    for (const v of voters) if (!v.done && t >= v.at) { v.done = true; votes[v.pick]++; paint(); }
    const left = Math.max(0, Math.ceil(10 - t)); const tEl = box.querySelector('#av-t'); if (tEl) tEl.textContent = left;
    if (t >= 10) finish();
  }, 100);
  paint();
  ui.voteFinish = finish; // "JUGAR OTRA VEZ" cierra la votación al instante
  return () => { clearInterval(iv); ui.voteFinish = null; };
}
void RANKS;
