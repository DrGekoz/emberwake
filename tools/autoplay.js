// Headless balance check: paste into the page console (or cmux browser eval). Plays a full night with a dodge bot and logs every 30s.
(() => {
  const g = window.__game, keys = window.__keys;
  window.__press('KeyX');
  const log = [];
  let lastLog = 0;
  for (let i = 0; i < 20000; i++) {
    const st = window.__tick(0);
    if (st === 'levelup') { window.__press('Digit' + (1 + Math.floor(Math.random() * 3))); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); continue; }
    if (st !== 'play') break;
    const p = g.p;
    let fx = 0, fz = 0;
    for (const e of g.en) { const dx = p.x - e.x, dz = p.z - e.z, d2 = dx * dx + dz * dz + 0.1; if (d2 < 49) { fx += dx / d2; fz += dz / d2; } }
    for (const b of g.world.braziers) if (!b.lit) { const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz); if (d < 12) { fx += dx / d * 0.15; fz += dz / d * 0.15; } }
    let near = 99;
    for (const e of g.en) near = Math.min(near, Math.hypot(e.x - p.x, e.z - p.z));
    let gem = null, gd = 9;
    for (const q of g.gems) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < gd) { gd = d; gem = q; } }
    if (gem && near > 2.5) { fx += (gem.x - p.x) / gd * 0.35; fz += (gem.z - p.z) / gd * 0.35; }
    if (near < 1.3 && p.dashCd <= 0) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    fx -= p.x * 0.004; fz -= p.z * 0.004;
    keys.clear();
    if (fx > 0.05) keys.add('KeyD'); if (fx < -0.05) keys.add('KeyA');
    if (fz > 0.05) keys.add('KeyS'); if (fz < -0.05) keys.add('KeyW');
    window.__tick(1, 1 / 30);
    if (g.t - lastLog >= 30) { lastLog = g.t; log.push(`t=${g.t.toFixed(0)} hp=${p.hp.toFixed(0)}/${p.maxHp} lv=${g.level} en=${g.en.length} kills=${g.kills} lit=${g.lit} score=${g.score}`); }
  }
  keys.clear();
  log.push(`END state=${window.__tick(0)} t=${g.t.toFixed(0)} won=${!!g.won} dead=${g.p.dead} lv=${g.level} kills=${g.kills} score=${g.score} lv=${JSON.stringify(g.lv)}`);
  return log.join('\n');
})()
