// Viaje de la luciérnaga · Mapa de los Reinos
// Dibuja en <canvas id="fx"> la penumbra, el camino encendido, la luz y sus chispas, y corre la secuencia del viaje
// desde la Finca La Toscana hasta el reino. El mapa no se mueve durante el viaje: lo maneja app.js.
window.ViajeLuz = (() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => -(Math.cos(Math.PI * t) - 1) / 2;
  const W = () => innerWidth, H = () => innerHeight;

  // ritmos (ms). VEL en px del mapa por ms
  // (las pausas de duda/casi/equivoca son las que pidió Matías; lo demás se ajustó para que el viaje no pase de ~11 s)
  const VEL = .36, T = { aparece: 700, respira: 350, asomaFinca: 650, pausaFinca: 400, equivoca: 900, duda: 650, asoma: 800, casi: 750, llega: 700 };

  let opt = null, cv = null, ctx = null, corriendo = 0;
  const oc = document.createElement('canvas'), octx = oc.getContext('2d');
  const escena = { u: 0, ruta: null, capa: null, caja: null, luz: null, chispas: [], anillo: null, camino: 1, oscuro: 0 };
  const capas = {};

  // ---------------------------------------------------------- caminos
  function camino(ruta) {
    const { MW, MH } = opt, P = ruta.map(([a, b]) => [a / 100 * MW, b / 100 * MH]), acum = [0];
    for (let i = 1; i < P.length; i++) acum.push(acum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = acum[acum.length - 1];
    return { P, acum, L, en(u) { const l = clamp(u, 0, 1) * L; let i = 1; while (i < acum.length - 1 && acum[i] < l) i++;
      const k = (l - acum[i - 1]) / (acum[i] - acum[i - 1] || 1); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k]; } };
  }
  // fracción del camino más cercana a un punto (en %)
  function uDe(c, [a, b]) { const x = a / 100 * opt.MW, y = b / 100 * opt.MH; let bi = 0, bd = 1e9;
    c.P.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; bi = i; } }); return c.acum[bi] / c.L; }
  function capa(id) {   // capa de brillo del camino (carga una sola vez; si falla, el viaje sigue sin camino encendido)
    if (!capas[id]) capas[id] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `./assets/caminos/${id}.png`; });
    return capas[id];
  }

  // ---------------------------------------------------------- frases
  function frase(tipo, usadas, nombre) {
    const banco = (window.FRASES && FRASES[tipo]) || [], libres = banco.filter(f => !usadas.has(f));
    const f = libres[Math.floor(Math.random() * libres.length)] || banco[0] || '';
    usadas.add(f); return f.replace(/\{n\}/g, (nombre || '').trim().split(/\s+/)[0]);
  }

  // ---------------------------------------------------------- dibujo
  function ajustarCanvas() {
    // densidad máx. 2: en brillos difusos no se nota y en pantallas de densidad 3 reduce a menos de la mitad el trabajo por cuadro
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(W() * dpr), h = Math.round(H() * dpr);
    // el tamaño CSS se fija con innerWidth/innerHeight (no 100vh): en celular la barra del navegador los hace distintos
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; cv.style.width = W() + 'px'; cv.style.height = H() + 'px'; }
    return dpr;
  }
  let ultimo = performance.now();
  function dibujar() {
    if (!cv) return;
    // las partículas avanzan según el tiempo transcurrido (k = cuadros de 60 fps), así no se aceleran si dos animaciones redibujan a la vez
    const ahora = performance.now(), k = Math.min(3, (ahora - ultimo) / 16.7); ultimo = ahora;
    const dpr = ajustarCanvas(), v = opt.getView(), s = v.s, aPant = ([x, y]) => [v.x + x * s, v.y + y * s];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W(), H());
    if (escena.oscuro > 0) {                                   // penumbra con un hueco de luz alrededor de la luciérnaga
      ctx.fillStyle = `rgba(3,10,6,${.84 * escena.oscuro})`; ctx.fillRect(0, 0, W(), H());
      if (escena.luz) {
        const [x, y] = aPant(escena.luz.m), R = Math.max(70, .12 * Math.min(W(), H()));
        const g = ctx.createRadialGradient(x, y, R * .25, x, y, R); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (escena.u > 0 && escena.camino > 0 && escena.capa) {   // camino encendido: se revela la capa con la forma real del camino
      if (oc.width !== cv.width || oc.height !== cv.height) { oc.width = cv.width; oc.height = cv.height; }
      const { P, acum, L } = escena.ruta, l = escena.u * L, c = escena.caja, { MW, MH } = opt;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, W(), H());
      octx.beginPath(); octx.moveTo(...aPant(P[0]));
      for (let i = 1; i < P.length && acum[i] <= l; i++) octx.lineTo(...aPant(P[i]));
      octx.lineTo(...aPant(escena.ruta.en(escena.u)));
      octx.lineCap = octx.lineJoin = 'round'; octx.lineWidth = 44 * s; octx.strokeStyle = '#000'; octx.stroke();
      octx.globalCompositeOperation = 'source-in';
      const [bx, by] = aPant([c[0] / 100 * MW, c[1] / 100 * MH]);
      octx.drawImage(escena.capa, bx, by, c[2] / 100 * MW * s, c[3] / 100 * MH * s);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = .78 * escena.camino; ctx.drawImage(oc, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .35 * escena.camino; ctx.drawImage(oc, 0, 0);
      ctx.restore();
    }
    escena.chispas = escena.chispas.filter(c => (c.v -= c.dv * k) > 0);
    for (const c of escena.chispas) {
      c.m[0] += c.dx * k; c.m[1] += c.dy * k; const [x, y] = aPant(c.m), r = c.r * (.6 + .4 * c.v);
      ctx.fillStyle = c.col.replace('A', c.v.toFixed(2)); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    if (escena.anillo) {
      const a = escena.anillo, [x, y] = aPant(a.m), k = a.k;
      ctx.strokeStyle = `rgba(255,190,60,${1 - k})`; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.arc(x, y, 8 + 46 * k, 0, 7); ctx.stroke();
    }
    if (escena.luz && escena.luz.b > 0) {                    // la luz: núcleo blanco, halo dorado, tamaño fijo en pantalla
      const [x, y] = aPant(escena.luz.m), b = escena.luz.b, R = 22 * (1 + .15 * Math.sin(performance.now() / 140));
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(255,255,255,${b})`); g.addColorStop(.18, `rgba(255,244,190,${b})`);
      g.addColorStop(.4, `rgba(255,170,40,${.75 * b})`); g.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    }
    // ambiente en coordenadas de pantalla: luciérnagas flotando y chispas de la celebración del cartel
    for (const l of luciernagas) {
      l.x += l.dx * k; l.y += l.dy * k; l.dx += (Math.random() - .5) * .012 * k; l.dy += (Math.random() - .5) * .012 * k;
      l.dx = clamp(l.dx, -.35, .35); l.dy = clamp(l.dy, -.3, .2);
      if (l.x < -10) l.x = W() + 10; if (l.x > W() + 10) l.x = -10; if (l.y < -10) l.y = H() + 10; if (l.y > H() + 10) l.y = -10;
      const a = .15 + .85 * Math.pow(Math.max(0, Math.sin(ahora / l.ritmo + l.fase)), 2) * l.fuerza;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r * 4);
      g.addColorStop(0, `rgba(255,250,210,${a})`); g.addColorStop(.3, `rgba(255,214,110,${.6 * a})`); g.addColorStop(1, 'rgba(255,190,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, l.r * 4, 0, 7); ctx.fill();
    }
    pantalla = pantalla.filter(p => (p.v -= p.dv * k) > 0);
    for (const p of pantalla) {
      p.x += p.dx * k; p.y += p.dy * k; p.dy += .06 * k; p.giro += .1 * k;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.giro); ctx.globalAlpha = Math.min(1, p.v * 1.5);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * (p.petalo ? .45 : 1), 0, 0, 7); ctx.fill(); ctx.restore();
    }
  }

  // ---------------------------------------------------------- ambiente
  let luciernagas = [], pantalla = [], modo = null, motorEncendido = false;
  function nuevaLuciernaga() {
    return { x: Math.random() * W(), y: Math.random() * H(), dx: (Math.random() - .5) * .4, dy: -Math.random() * .25,
      r: 1.6 + Math.random() * 1.6, fase: Math.random() * 6.3, ritmo: 500 + Math.random() * 700, fuerza: .6 + Math.random() * .4 };
  }
  function motor() {   // un solo ciclo de dibujo para el ambiente; se apaga solo cuando no hay nada que animar o la pestaña no se ve
    if (motorEncendido) return; motorEncendido = true;
    (function paso() {
      if (document.hidden || (!luciernagas.length && !pantalla.length)) { motorEncendido = false; dibujar(); return; }
      dibujar(); requestAnimationFrame(paso);
    })();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) motor(); });
  function luciernagasModo(m) {
    modo = reduced ? null : m;
    const n = modo === 'intro' ? 20 : modo === 'libre' ? 10 : 0;
    luciernagas = luciernagas.slice(0, n); while (luciernagas.length < n) luciernagas.push(nuevaLuciernaga());
    if (n) motor(); else dibujar();
  }
  function celebrar(rect) {   // ráfaga de chispas y pétalos que caen desde el cartel
    if (reduced || !cv || !rect) return;
    for (let i = 0; i < 30; i++) {
      const petalo = Math.random() < .4;
      pantalla.push({ x: rect.left + Math.random() * rect.width, y: rect.top + rect.height * (.05 + Math.random() * .25),
        dx: (Math.random() - .5) * 3.2, dy: -1.5 - Math.random() * 3, r: petalo ? 4 + Math.random() * 3 : 1.8 + Math.random() * 2,
        giro: Math.random() * 6, v: 1, dv: 1 / (70 + Math.random() * 40), petalo,
        col: petalo ? (Math.random() < .5 ? '#f6c1d0' : '#fff1c8') : (Math.random() < .5 ? '#fff6d0' : '#ffc94d') });
    }
    motor();
  }
  function chispa(m, rapida) {
    const s = opt.getView().s, ang = Math.random() * 6.283, vel = (rapida ? 1.5 + Math.random() * 2.5 : .2 + Math.random() * .3) / s;
    escena.chispas.push({ m: [m[0], m[1]], dx: Math.cos(ang) * vel, dy: Math.sin(ang) * vel - (rapida ? 0 : .25 / s),
      r: rapida ? 2 + Math.random() * 2.5 : 1.4 + Math.random() * 1.8, v: 1, dv: rapida ? 1 / 45 : 1 / 30,
      col: Math.random() < .5 ? 'rgba(255,255,230,A)' : 'rgba(255,180,50,A)' });
  }
  function limpiar() { Object.assign(escena, { u: 0, ruta: null, capa: null, caja: null, luz: null, chispas: [], anillo: null, camino: 1, oscuro: 0 }); dibujar(); }

  // ---------------------------------------------------------- secuencia
  async function recorrer(id, nombre) {
    const yo = ++corriendo, R = window.REINOS[id];
    if (reduced || !cv || !R || !R.ruta) return true;
    const ok = () => yo === corriendo;
    const anim = (ms, f) => { const t0 = performance.now(); return new Promise(fin => (function paso(now) {
      if (!ok()) return fin(); const t = clamp((now - t0) / ms, 0, 1); f(t, now); dibujar();
      t < 1 ? requestAnimationFrame(paso) : fin(); })(t0)); };
    const titila = now => .72 + .28 * Math.abs(Math.sin(now / 70));
    const dudar = (m, ms) => anim(ms, (t, now) => { escena.luz = { m, b: titila(now) }; });
    const andar = (c, u0, u1, encender) => anim(Math.max(450, Math.abs(u1 - u0) * c.L / VEL), t => {
      const u = u0 + (u1 - u0) * ease(t), m = c.en(u); if (encender) escena.u = u;
      escena.luz = { m, b: 1 }; chispa(m, false); chispa(m, false); });
    const asomarPor = (c, d) => { const u1 = clamp(d / c.L, 0, 1);   // sale d px por un camino desde su inicio y vuelve
      return anim(T.asomaFinca, (t, now) => { escena.luz = { m: c.en(u1 * Math.sin(Math.PI * t) * .9), b: titila(now) }; }); };
    const asomarA = (J, S) => anim(T.asoma, (t, now) => { const k = Math.sin(Math.PI * t) * .85;   // del cruce J hacia S y vuelve
      escena.luz = { m: [J[0] + (S[0] - J[0]) * k, J[1] + (S[1] - J[1]) * k], b: titila(now) }; });
    const banner = t => opt.banner(t), usadas = new Set(), aPx = ([a, b]) => [a / 100 * opt.MW, b / 100 * opt.MH];

    const ruta = camino(R.ruta), izq = camino(REINOS.rumpelstiltskin.ruta), der = camino(REINOS.pociones.ruta);
    Object.assign(escena, { u: 0, ruta, capa: await capa(id), caja: R.caja, luz: null, chispas: [], anillo: null, camino: 1, oscuro: 0 });
    if (!ok()) return false;

    // 1) penumbra y la luz se enciende en la Finca
    banner(frase('inicio', usadas, nombre));
    const finca = ruta.en(0);
    await anim(T.aparece, t => { escena.oscuro = ease(t); escena.luz = { m: finca, b: ease(t) }; }); if (!ok()) return false;
    for (let k = 0; k < 14; k++) chispa(finca, true);
    await dudar(finca, T.respira); if (!ok()) return false;
    // 2) duda en la Finca: se asoma a la izquierda y a la derecha
    banner(frase('finca', usadas, nombre));
    await asomarPor(izq, 45); if (!ok()) return false;
    await asomarPor(der, 45); if (!ok()) return false;
    await dudar(finca, T.pausaFinca); if (!ok()) return false;
    // 3) reinos pegados a la Finca: prueba primero el camino equivocado y se devuelve (sin encenderlo)
    if (R.desvio) {
      const desvio = camino(R.desvio);
      await andar(desvio, 0, 1, false); if (!ok()) return false;
      banner(frase('equivoca', usadas, nombre));
      await dudar(desvio.en(1), T.equivoca); if (!ok()) return false;
      banner(frase('vuelta', usadas, nombre));
      await andar(desvio, 1, 0, false); if (!ok()) return false;
    }
    // 4) recorre su camino encendiéndolo; duda en los cruces
    let u = 0;
    for (const c of R.cruces) {
      const uc = uDe(ruta, c.en); if (uc <= u) continue;
      await andar(ruta, u, uc, true); if (!ok()) return false; u = uc;
      const J = ruta.en(uc);
      banner(frase(c.tipo, usadas, nombre));
      await dudar(J, c.tipo === 'casi' ? T.casi : T.duda); if (!ok()) return false;
      if (c.asoma) { await asomarA(J, aPx(c.asoma)); if (!ok()) return false; }
    }
    await andar(ruta, u, 1, true); if (!ok()) return false;
    // 5) llega: se levanta la penumbra de golpe, chispas y anillo
    banner(frase('llegada', usadas, nombre));
    const fin = ruta.en(1); for (let k = 0; k < 34; k++) chispa(fin, true); escena.anillo = { m: fin, k: 0 };
    await anim(T.llega, t => { escena.oscuro = 1 - Math.min(1, t * 2.5); escena.anillo.k = t; escena.luz = { m: fin, b: 1 - t }; });
    if (!ok()) return false;
    escena.anillo = null; escena.luz = null; dibujar();
    return true;
  }

  return {
    iniciar(o) { opt = o; cv = document.getElementById('fx'); ctx = cv && cv.getContext('2d'); if (cv) ajustarCanvas(); },
    recorrer,
    llegada(id) { return camino(window.REINOS[id].ruta).en(1); },
    detener() { corriendo++; limpiar(); },
    apagarCamino(ms) {
      const yo = corriendo, t0 = performance.now();
      (function paso(now) { if (yo !== corriendo) return; escena.camino = 1 - clamp((now - t0) / ms, 0, 1); dibujar();
        if (escena.camino > 0) requestAnimationFrame(paso); else limpiar(); })(t0);
    },
    redibujar: dibujar,
    luciernagas: luciernagasModo,   // 'intro' | 'libre' | null
    celebrar,                       // celebrar(rect del cartel en pantalla)
    _frase: frase,   // para las pruebas
    _estado: () => ({ luz: !!escena.luz, oscuro: escena.oscuro, u: escena.u, chispas: escena.chispas.length, camino: escena.camino,
      luciernagas: luciernagas.length, pantalla: pantalla.length }),
  };
})();
