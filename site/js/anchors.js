// "History bends, anchors hold": the original route through a row of HARD anchors, a cloud of possible routes, and
// your route — pulled by the pointer between anchors, always passing through them.
export function startAnchors(canvas, reduced) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(devicePixelRatio, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  const anchorsAt = () => {
    const n = w < 600 ? 3 : 4;
    return Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1)) * w);
  };
  // the original route: a gentle wave through the anchors
  const orig = (x) => h * 0.5 + Math.sin(x / w * 7.1) * h * 0.08;
  // how free a route is at x: zero at an anchor, one halfway between
  const freedom = (x, as) => {
    const pts = [0, ...as, w];
    for (let i = 0; i < pts.length - 1; i++) if (x <= pts[i + 1]) {
      const k = (x - pts[i]) / (pts[i + 1] - pts[i]);
      if (i === 0) return Math.cos(Math.PI * 0.5 * k);                 // before the first anchor
      if (i === pts.length - 2) return Math.sin(Math.PI * 0.5 * k);    // after the last one: the open future
      return Math.sin(Math.PI * k);
    }
    return 0;
  };

  const pointer = { y: 0, ty: 0, active: false };
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; pointer.active = true;
  });
  canvas.parentElement.addEventListener('pointerleave', () => { pointer.active = false; });

  const ghosts = Array.from({ length: 26 }, () => ({ a: (Math.random() - 0.5) * 2, f: 1 + Math.random() * 3, p: Math.random() * 6.28 }));
  const sparks = Array.from({ length: 70 }, () => ({ x: Math.random(), v: 0.0006 + Math.random() * 0.0016 }));
  const route = (x, as, t) => {
    const dev = pointer.active ? pointer.y : Math.sin(t * 0.0007) * 0.9;
    const fr = freedom(x, as);
    return orig(x) + fr * h * 0.32 * (dev * Math.sin(x / w * 9 + 0.6) + 0.25 * Math.sin(x / w * 23 + t * 0.002));
  };

  let running = true, raf = 0;
  const frame = (t) => {
    raf = running ? requestAnimationFrame(frame) : 0;
    if (reduced) t = 4000;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    const as = anchorsAt();
    ctx.clearRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = 'rgba(120,160,255,0.06)'; ctx.lineWidth = 1;
    for (let x = (t * 0.02) % 40; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // possible routes
    ctx.globalCompositeOperation = 'lighter';
    for (const g of ghosts) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const y = orig(x) + freedom(x, as) * h * 0.3 * g.a * Math.sin(x / w * g.f * 3 + g.p + t * 0.0004);
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(141,107,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // the original route
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) { const y = orig(x); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(170,180,220,0.35)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);

    // your route
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) { const y = route(x, as, t); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.shadowColor = '#33e6ff'; ctx.shadowBlur = 18; ctx.strokeStyle = 'rgba(51,230,255,0.95)'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.shadowBlur = 0;

    // sparks running along your route
    for (const s of sparks) {
      s.x = (s.x + s.v * (reduced ? 0 : 1)) % 1;
      const x = s.x * w, y = route(x, as, t);
      const r = 1 + 1.5 * Math.sin(s.x * 40 + t * 0.01) ** 2;
      ctx.fillStyle = 'rgba(190,250,255,0.8)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
    }

    // anchors
    as.forEach((x, i) => {
      const y = orig(x), pulse = (t * 0.0006 + i * 0.25) % 1;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 46);
      grd.addColorStop(0, 'rgba(255,220,140,0.55)'); grd.addColorStop(1, 'rgba(255,138,31,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, 46, 0, 6.29); ctx.fill();
      ctx.strokeStyle = `rgba(255,198,92,${0.6 * (1 - pulse)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 10 + pulse * 34, 0, 6.29); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4 + t * 0.0005);
      ctx.shadowColor = '#ffc65c'; ctx.shadowBlur = 20; ctx.fillStyle = '#ffd98a'; ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,198,92,0.18)'; ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, h - 40); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,198,92,0.8)'; ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('HARD ' + String(i + 1).padStart(2, '0'), x, 14);
    });
    ctx.globalCompositeOperation = 'source-over';
  };
  raf = requestAnimationFrame(frame);
  return {
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
  };
}
