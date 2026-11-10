// "You are not a spectator": you at the center; people on three rings by what they know about you (that your
// group exists, who you are, your secrets); groups around them. People learn more and move inward; now and then
// someone reaches out to you.
import { t } from './i18n.js';

const RINGS = [
  { k: 'secrets', r: 0.155, c: [255, 79, 163] },
  { k: 'identity', r: 0.265, c: [51, 230, 255] },
  { k: 'exists', r: 0.37, c: [107, 124, 255] },
];
const REACH = ['invitation', 'request', 'probe', 'consequence', 'encounter'];
const GROUPS = ['club', 'school', 'street', 'rival'];

export function startOrbit(canvas, reduced) {
  const ctx = canvas.getContext('2d');
  let S = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2); S = canvas.clientWidth;
    canvas.width = S * dpr; canvas.height = S * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  const groups = GROUPS.map((k, i) => ({ k, a: (i / GROUPS.length) * Math.PI * 2 + 0.4, flash: 0 }));
  const people = Array.from({ length: 26 }, (_, i) => {
    const ring = i < 3 ? 0 : i < 9 ? 1 : 2;
    return { ring, r: RINGS[ring].r, a: Math.random() * Math.PI * 2, v: (0.04 + Math.random() * 0.06) * (Math.random() < 0.5 ? -1 : 1), g: i % GROUPS.length, size: 3 + Math.random() * 2.5, glow: 0 };
  });
  const packets = [], tags = [], ripples = [];
  const pos = (p) => [S / 2 + Math.cos(p.a) * p.r * S, S / 2 + Math.sin(p.a) * p.r * S];
  const gpos = (g) => [S / 2 + Math.cos(g.a) * 0.425 * S, S / 2 + Math.sin(g.a) * 0.425 * S];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const lerpC = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));

  const happen = () => {
    if (Math.random() < 0.6) {
      // someone reaches out
      const p = people[Math.floor(Math.random() * people.length)];
      packets.push({ p, k: 0 });
      tags.push({ p, text: t('orbit.r.' + REACH[Math.floor(Math.random() * REACH.length)]), life: 1, c: [255, 198, 92] });
      p.glow = 1; groups[p.g].flash = 1;
    } else {
      // someone learns more and moves inward
      const outer = people.filter((p) => p.ring > 0);
      if (outer.length < 8) { // keep the rings populated: a newcomer replaces someone on the inner rings
        const p = people.find((q) => q.ring === 0 && q.target === undefined);
        if (p) { p.ring = 2; p.r = RINGS[2].r; p.glow = 1; }
        return;
      }
      const p = outer[Math.floor(Math.random() * outer.length)];
      p.from = p.ring; p.ring -= 1; p.target = RINGS[p.ring].r; p.mk = 0;
      tags.push({ p, text: t(p.ring === 0 ? 'orbit.r.secret' : 'orbit.r.learns'), life: 1, c: RINGS[p.ring].c });
    }
  };
  let nextAt = 800;

  let running = true, raf = 0, last = performance.now(), time = 0;
  const frame = (now) => {
    raf = running ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduced) time += dt;
    nextAt -= dt * 1000;
    if (nextAt <= 0 && !reduced) { happen(); nextAt = 1700 + Math.random() * 1300; }
    const c = S / 2;
    ctx.clearRect(0, 0, S, S);

    // rings
    for (const [i, R] of RINGS.entries()) {
      ctx.save(); ctx.translate(c, c); ctx.rotate(time * 0.05 * (i % 2 ? -1 : 1));
      ctx.setLineDash([3, 9]); ctx.strokeStyle = rgba(R.c, 0.35); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, R.r * S, 0, 6.29); ctx.stroke();
      ctx.restore();
      const g = ctx.createRadialGradient(c, c, R.r * S * 0.9, c, c, R.r * S * 1.1);
      g.addColorStop(0, rgba(R.c, 0)); g.addColorStop(0.5, rgba(R.c, 0.05)); g.addColorStop(1, rgba(R.c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R.r * S * 1.1, 0, 6.29); ctx.fill();
    }

    // groups: hexagons, with a thread to each member
    ctx.globalCompositeOperation = 'lighter';
    for (const g of groups) {
      g.a += dt * 0.02; g.flash = Math.max(0, g.flash - dt * 0.8);
      const [gx, gy] = gpos(g);
      for (const p of people) if (p.g === groups.indexOf(g)) {
        const [x, y] = pos(p);
        ctx.strokeStyle = `rgba(141,107,255,${0.05 + g.flash * 0.25})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const g of groups) {
      const [gx, gy] = gpos(g), r = S * 0.03;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + time * 0.2; ctx.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r); }
      ctx.closePath();
      ctx.fillStyle = `rgba(20,16,50,0.9)`; ctx.fill();
      ctx.strokeStyle = `rgba(141,107,255,${0.6 + g.flash * 0.4})`; ctx.lineWidth = 1.5; ctx.shadowColor = '#8d6bff'; ctx.shadowBlur = 10 + g.flash * 20; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#b9a8ff'; ctx.font = `600 ${Math.max(10, S * 0.022)}px "Space Grotesk", "PingFang SC", "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(t('orbit.' + g.k), gx, gy + r + 16);
    }

    // people
    for (const p of people) {
      p.a += p.v * dt;
      if (p.target !== undefined) {
        p.mk = Math.min(1, p.mk + dt * 0.7);
        const e = p.mk * p.mk * (3 - 2 * p.mk);
        p.r = RINGS[p.from].r + (p.target - RINGS[p.from].r) * e;
        if (p.mk >= 1) { p.r = p.target; delete p.target; }
      }
      p.glow = Math.max(0, p.glow - dt * 0.6);
      const col = p.target !== undefined ? lerpC(RINGS[p.from].c, RINGS[p.ring].c, p.mk) : RINGS[p.ring].c;
      const [x, y] = pos(p);
      ctx.shadowColor = rgba(col, 1); ctx.shadowBlur = 12 + p.glow * 24;
      ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(x, y, p.size + p.glow * 3, 0, 6.29); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // packets travelling to you
    for (let i = packets.length - 1; i >= 0; i--) {
      const k = packets[i]; k.k += dt * 0.55;
      const [x0, y0] = pos(k.p), e = k.k * k.k;
      const x = x0 + (c - x0) * e, y = y0 + (c - y0) * e;
      ctx.strokeStyle = 'rgba(255,198,92,0.35)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.shadowColor = '#ffc65c'; ctx.shadowBlur = 18; ctx.fillStyle = '#ffe2a6';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.29); ctx.fill(); ctx.shadowBlur = 0;
      if (k.k >= 1) { packets.splice(i, 1); ripples.push({ k: 0 }); }
    }

    // you
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.k += dt * 0.9;
      ctx.strokeStyle = `rgba(255,198,92,${0.7 * (1 - r.k)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c, c, S * (0.05 + r.k * 0.12), 0, 6.29); ctx.stroke();
      if (r.k >= 1) ripples.splice(i, 1);
    }
    const pulse = 1 + 0.06 * Math.sin(time * 2.4);
    const core = ctx.createRadialGradient(c, c, 0, c, c, S * 0.09 * pulse);
    core.addColorStop(0, 'rgba(255,250,230,1)'); core.addColorStop(0.3, 'rgba(255,198,92,0.9)'); core.addColorStop(1, 'rgba(255,138,31,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(c, c, S * 0.09 * pulse, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#1a0f02'; ctx.font = `800 ${S * 0.03}px Orbitron, "Space Grotesk", "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('orbit.you'), c, c + 1); ctx.textBaseline = 'alphabetic';

    // what just happened
    for (let i = tags.length - 1; i >= 0; i--) {
      const g = tags[i]; g.life -= dt * 0.4;
      const [x, y] = pos(g.p), up = (1 - g.life) * 18;
      ctx.globalAlpha = Math.max(0, Math.min(1, g.life * 2.5));
      ctx.font = `600 ${Math.max(11, S * 0.024)}px "Space Grotesk", "PingFang SC", "Microsoft YaHei", sans-serif`;
      const w = ctx.measureText(g.text).width + 16;
      ctx.fillStyle = 'rgba(6,8,22,0.85)'; ctx.strokeStyle = rgba(g.c, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - 34 - up, w, 22, 11); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(g.c, 1); ctx.textAlign = 'center'; ctx.fillText(g.text, x, y - 19 - up);
      ctx.globalAlpha = 1;
      if (g.life <= 0) tags.splice(i, 1);
    }
  };
  raf = requestAnimationFrame(frame);
  return {
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
  };
}
