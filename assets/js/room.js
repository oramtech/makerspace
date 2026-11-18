/* ==========================================================================
   room.js — the makerspace, rebuilt in three.js from the architect's plan.

   Units are metres. X runs from the window wall (0) to the far wall (5.80),
   Z runs from the electronics bench (0) to the materials wall (14.31), Y is up.
   Positions come from the plan (1 px = 1/62.76 m); what sits on each bench
   comes from the photos.

   Everything static is merged into a few meshes (one per material), so the
   whole room stays around 30 draw calls however much detail is added.
   ========================================================================== */
(function () {
  'use strict';
  var T = window.THREE;

  var W = 5.8, L = 14.31, H = 3.1;
  var CX = W / 2, CZ = L / 2;
  var DOOR = { x: 0, z: 4.66 };                 // the build-up wave starts here
  var PLAN = { w: 698, h: 1169, x0: 188, y0: 101, ppm: 62.76 };

  var C = {
    floor: '#d6d3cc', wall: '#8fa3a7', beige: '#e7e0d0', khaki: '#a59e86', perf: '#8f8972',
    black: '#1c1d20', charcoal: '#34373c', drawer: '#454a51', alu: '#cfd3d7', white: '#f0f0ed',
    orange: '#f26b1d', blue: '#2647b6', yellow: '#ffc61a', red: '#d9322e', green: '#2e9e58',
    teal: '#1d8d9e', cream: '#efe8d8', brown: '#a97b45', cardboard: '#c9a171', brass: '#c9a24a', plinth: '#3b4649',
    oakTop: '#ffffff', oakEdge: '#e9dcc8'       // tints over the wood texture
  };

  /* The ten stops of the tour: where the camera sits (p) and what it looks at (t). */
  var STOPS = [
    { id: 'door',        p: [2.6, 3.0, 6.9],    t: [0.3, 1.0, 3.8] },
    { id: 'electronics', p: [2.3, 2.75, 4.5],   t: [2.75, 1.25, 0.2] },
    { id: 'soldering',   p: [2.85, 2.55, 2.75], t: [5.25, 1.2, 0.95] },
    { id: 'tables',      p: [-4.4, 7.3, 7.6],   t: [4.0, 0.4, 7.45] },
    { id: 'tools',       p: [0.95, 1.9, 7.1],   t: [2.4, 0.62, 8.85] },
    { id: 'materials',   p: [1.0, 2.35, 10.2],  t: [2.9, 2.05, 14.25] },
    { id: 'printers',    p: [2.0, 2.1, 9.3],    t: [0.35, 1.25, 11.9] },
    { id: 'cnc',         p: [1.95, 1.9, 7.8],   t: [0.38, 1.25, 8.75] },
    { id: 'drill',       p: [2.55, 1.85, 7.95], t: [0.4, 1.2, 6.7] },
    { id: 'office',      p: [0.7, 3.1, 9.6],    t: [4.7, 1.0, 7.4] }
  ];

  /* ---------- small helpers ---------- */
  var colCache = {};
  function lin(hex) { return colCache[hex] || (colCache[hex] = new T.Color(hex).convertSRGBToLinear()); }
  function tr(x, y, z) { return new T.Matrix4().makeTranslation(x, y, z); }
  function rotX(a) { return new T.Matrix4().makeRotationX(a); }
  function rotY(a) { return new T.Matrix4().makeRotationY(a); }
  function rotZ(a) { return new T.Matrix4().makeRotationZ(a); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* a box with softened edges: one chamfer per edge, smooth-shaded so it reads as a radius */
  function roundedBox(sx, sy, sz, r) {
    var g = new T.BoxGeometry(1, 1, 1, 3, 3, 3), pos = g.attributes.position, nor = g.attributes.normal;
    r = Math.max(0.0005, Math.min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4));
    var bx = sx / 2 - r, by = sy / 2 - r, bz = sz / 2 - r, i, x, y, z, nx, ny, nz, l;
    for (i = 0; i < pos.count; i++) {
      x = pos.getX(i); y = pos.getY(i); z = pos.getZ(i);
      nx = Math.abs(x) > 0.3 ? Math.sign(x) : 0; ny = Math.abs(y) > 0.3 ? Math.sign(y) : 0; nz = Math.abs(z) > 0.3 ? Math.sign(z) : 0;
      l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l;
      pos.setXYZ(i, bx * Math.sign(x) + nx * r, by * Math.sign(y) + ny * r, bz * Math.sign(z) + nz * r);
      nor.setXYZ(i, nx, ny, nz);
    }
    return g;
  }

  /* an upright block with rounded vertical corners and crisp top and bottom edges: sheet-metal and moulded shells */
  function roundedPrism(sx, sz, h, r, seg) {
    seg = seg || 5; r = Math.max(0.0005, Math.min(r, sx / 2 - 1e-4, sz / 2 - 1e-4));
    var hx = sx / 2 - r, hz = sz / 2 - r, cx = [hx, -hx, -hx, hx], cz = [hz, hz, -hz, -hz];
    var pos = [], nor = [], uv = [], idx = [], ring = [], i, k, a, n, j, j2;
    for (i = 0; i < 4; i++) for (k = 0; k <= seg; k++) { a = (i + k / seg) * Math.PI / 2; ring.push([cx[i] + Math.cos(a) * r, cz[i] + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); }
    n = ring.length;
    for (j = 0; j < n; j++) {                                    // side wall: bottom vertex then top vertex
      pos.push(ring[j][0], -h / 2, ring[j][1], ring[j][0], h / 2, ring[j][1]);
      nor.push(ring[j][2], 0, ring[j][3], ring[j][2], 0, ring[j][3]); uv.push(j / n, 0, j / n, 1);
    }
    for (j = 0; j < n; j++) { j2 = (j + 1) % n; idx.push(j * 2, j * 2 + 1, j2 * 2, j2 * 2, j * 2 + 1, j2 * 2 + 1); }
    [1, -1].forEach(function (s) {                               // caps
      var base = pos.length / 3;
      pos.push(0, s * h / 2, 0); nor.push(0, s, 0); uv.push(0.5, 0.5);
      for (j = 0; j < n; j++) { pos.push(ring[j][0], s * h / 2, ring[j][1]); nor.push(0, s, 0); uv.push(0.5 + ring[j][0] / sx, 0.5 + ring[j][1] / sz); }
      for (j = 0; j < n; j++) { j2 = (j + 1) % n; if (s > 0) idx.push(base, base + 1 + j2, base + 1 + j); else idx.push(base, base + 1 + j, base + 1 + j2); }
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }

  /* ---------- geometry builder: everything lands in a few merged buckets ---------- */
  function Builder() { this.b = {}; this.stack = [new T.Matrix4()]; this.delay = 0; }
  var BP = Builder.prototype;
  BP.bucket = function (n) { return this.b[n] || (this.b[n] = { pos: [], nor: [], col: [], uv: [], del: [], idx: [], n: 0 }); };
  BP.push = function (m) { this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m)); };
  BP.pop = function () { this.stack.pop(); };
  BP.at = function (x, z) { this.delay = Math.min(1, Math.hypot(x - DOOR.x, z - DOOR.z) / 11.4) * 0.78; return this; };
  /* o.b = bucket, o.uv = [su, sv] scale for the shape's own UVs, o.w = 'x' | 'z' for UVs in world metres (grain direction) */
  BP.add = function (geo, local, color, o) {
    o = o || {};
    var b = this.bucket(o.b || 'matte');
    var m = this.stack[this.stack.length - 1].clone().multiply(local);
    var nm = new T.Matrix3().getNormalMatrix(m);
    var pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    var c = lin(color), p = new T.Vector3(), n = new T.Vector3(), i, ax, ay, az;
    var su = o.uv ? o.uv[0] : 1, sv = o.uv ? o.uv[1] : 1;
    for (i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m); b.pos.push(p.x, p.y, p.z);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); b.nor.push(n.x, n.y, n.z);
      b.col.push(c.r, c.g, c.b); b.del.push(this.delay);
      if (o.w) {
        ax = Math.abs(n.x); ay = Math.abs(n.y); az = Math.abs(n.z);
        if (ay >= ax && ay >= az) { if (o.w === 'z') b.uv.push(p.z, p.x); else b.uv.push(p.x, p.z); }
        else if (ax >= az) b.uv.push(p.z, p.y);
        else b.uv.push(p.x, p.y);
      } else if (uv) b.uv.push(uv.getX(i) * su, uv.getY(i) * sv);
      else b.uv.push(0, 0);
    }
    if (geo.index) { var ix = geo.index.array; for (i = 0; i < ix.length; i++) b.idx.push(ix[i] + b.n); }
    else { for (i = 0; i < pos.count; i++) b.idx.push(i + b.n); }
    b.n += pos.count;
    geo.dispose();
  };
  function place(cx, y0, sy, cz, o) {
    var m = tr(cx, y0 + sy / 2, cz);
    if (o.ry) m.multiply(rotY(o.ry));
    if (o.rx) m.multiply(rotX(o.rx));
    if (o.rz) m.multiply(rotZ(o.rz));
    return m;
  }
  /* box / rounded box: size, then centre x, BOTTOM y, centre z */
  BP.box = function (sx, sy, sz, cx, y0, cz, color, o) { o = o || {}; this.add(new T.BoxGeometry(sx, sy, sz), place(cx, y0, sy, cz, o), color, o); };
  BP.rbox = function (sx, sy, sz, cx, y0, cz, color, o) { o = o || {}; this.add(roundedBox(sx, sy, sz, o.r || 0.01), place(cx, y0, sy, cz, o), color, o); };
  /* prism: footprint sx by sz, height h, corner radius r; then centre x, BOTTOM y, centre z */
  BP.prism = function (sx, sz, h, r, cx, y0, cz, color, o) { o = o || {}; this.add(roundedPrism(sx, sz, h, r), place(cx, y0, h, cz, o), color, o); };
  /* cylinder: upright by default (y0 = bottom); with axis 'x'/'z', y0 is the centre height. r = bottom radius, o.rt = top radius,
     o.ts / o.tl = start angle and sweep for a partial cylinder */
  BP.cyl = function (r, h, cx, y0, cz, color, o) {
    o = o || {};
    var g = new T.CylinderGeometry(o.rt != null ? o.rt : r, r, h, o.seg || 12, 1, !!o.open, o.ts || 0, o.tl || Math.PI * 2);
    var m = tr(cx, o.axis ? y0 : y0 + h / 2, cz);
    if (o.axis === 'x') m.multiply(rotZ(Math.PI / 2));
    if (o.axis === 'z') m.multiply(rotX(Math.PI / 2));
    this.add(g, m, color, o);
  };
  BP.torus = function (R, r, cx, cy, cz, color, o) {
    o = o || {};
    var m = tr(cx, cy, cz);
    if (!o.axis || o.axis === 'y') m.multiply(rotX(Math.PI / 2));
    else if (o.axis === 'x') m.multiply(rotY(Math.PI / 2));
    this.add(new T.TorusGeometry(R, r, o.tube || 6, o.seg || 20), m, color, o);
  };
  BP.tube = function (pts, r, color, o) {
    o = o || {};
    var curve = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
    this.add(new T.TubeGeometry(curve, o.seg || 36, r, o.sides || 7, false), new T.Matrix4(), color, o);
    return curve;
  };
  /* corrugated hose: a tube with a ring every few centimetres */
  BP.hose = function (pts, r, color) {
    var curve = this.tube(pts, r, color, { b: 'gloss', seg: 44, sides: 9 });
    var n = Math.floor(curve.getLength() / 0.042), i, p = new T.Vector3(), tg = new T.Vector3(), q = new T.Quaternion(), m = new T.Matrix4(), Z = new T.Vector3(0, 0, 1);
    for (i = 1; i < n; i++) {
      curve.getPointAt(i / n, p); curve.getTangentAt(i / n, tg); q.setFromUnitVectors(Z, tg.normalize());
      m.makeRotationFromQuaternion(q); m.setPosition(p);
      this.add(new T.TorusGeometry(r + 0.003, 0.0065, 5, 12), m.clone(), color, { b: 'gloss' });
    }
  };
  /* inward-facing wall panel: from outside the room you look straight through it */
  BP.wall = function (side, a0, a1, y0, y1, color, bucket, inset) {
    var mid = (a0 + a1) / 2, my = (y0 + y1) / 2, m, d = inset || 0;
    if (side === 'N') { m = tr(mid, my, d); this.at(mid, 0); }
    else if (side === 'S') { m = tr(mid, my, L - d).multiply(rotY(Math.PI)); this.at(mid, L); }
    else if (side === 'W') { m = tr(d, my, mid).multiply(rotY(Math.PI / 2)); this.at(0, mid); }
    else { m = tr(W - d, my, mid).multiply(rotY(-Math.PI / 2)); this.at(W, mid); }
    this.add(new T.PlaneGeometry(a1 - a0, y1 - y0), m, color, { b: bucket || 'wall', uv: [a1 - a0, y1 - y0] });
  };
  /* light pooling on a surface (additive) */
  BP.glow = function (m, w, h, strength) { this.add(new T.PlaneGeometry(w, h), m, new T.Color(strength, strength, strength * 0.93).getStyle(), { b: 'glow' }); };
  BP.pool = function (x, y, z, sx, sz, strength) { this.glow(tr(x, y, z).multiply(rotX(-Math.PI / 2)), sx, sz, strength); };
  /* soft darkening on the floor: under furniture (shade) and where floor meets wall (edge) */
  BP.shade = function (x, z, sx, sz) { this.add(new T.PlaneGeometry(sx, sz), tr(x, 0.006, z).multiply(rotX(-Math.PI / 2)), '#000000', { b: 'shadeRect' }); };
  BP.edge = function (x, z, len, depth, rot) { this.add(new T.PlaneGeometry(len, depth), tr(x, 0.008, z).multiply(rotY(rot)).multiply(rotX(-Math.PI / 2)), '#000000', { b: 'shadeEdge' }); };
  BP.mesh = function (name, material) {
    var b = this.b[name]; if (!b) return null;
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(b.col, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('aDelay', new T.Float32BufferAttribute(b.del, 1));
    g.setIndex(b.n > 65535 ? new T.Uint32BufferAttribute(b.idx, 1) : new T.Uint16BufferAttribute(b.idx, 1));
    g.computeBoundingSphere();
    var mesh = new T.Mesh(g, material);
    mesh.name = name; mesh.frustumCulled = false;
    return mesh;
  };

  var G = { b: 'gloss' }, ME = { b: 'metal' };

  /* ====================================================================
     Furniture
     ==================================================================== */
  function stool(B, x, z, ry, h) {
    h = h || 0.66;
    B.at(x, z); B.push(tr(x, 0, z).multiply(rotY(ry)));
    var k = C.black, i, a, s, c;
    for (i = 0; i < 5; i++) {                                                   // five-star base on twin castors
      a = i * Math.PI * 2 / 5; s = Math.sin(a); c = Math.cos(a);
      B.rbox(0.29, 0.03, 0.044, s * 0.15, 0.06, c * 0.15, k, { ry: a - Math.PI / 2, r: 0.01, b: 'gloss' });
      B.cyl(0.011, 0.04, s * 0.285, 0.04, c * 0.285, k, { seg: 6, b: 'gloss' });
      B.cyl(0.027, 0.046, s * 0.285, 0.027, c * 0.285, '#121315', { axis: i % 2 ? 'x' : 'z', seg: 10, b: 'gloss' });
    }
    B.cyl(0.05, 0.05, 0, 0.05, 0, k, { seg: 14, b: 'gloss' });
    B.cyl(0.032, 0.25, 0, 0.09, 0, k, { seg: 12, b: 'gloss' });                 // gas lift
    B.cyl(0.018, h - 0.38, 0, 0.33, 0, C.alu, { seg: 10, b: 'metal' });
    B.torus(0.205, 0.012, 0, 0.29, 0, k, { b: 'gloss', seg: 26 });              // foot ring
    for (i = 0; i < 3; i++) { a = i * Math.PI * 2 / 3 + 0.5; B.box(0.2, 0.014, 0.022, Math.sin(a) * 0.1, 0.283, Math.cos(a) * 0.1, k, { ry: a - Math.PI / 2, b: 'gloss' }); }
    B.cyl(0.04, 0.035, 0, 0.275, 0, k, { seg: 10, b: 'gloss' });
    B.box(0.26, 0.035, 0.26, 0, h - 0.075, 0, '#151618', G);                    // seat mechanism and its lever
    B.cyl(0.007, 0.13, 0.17, h - 0.06, 0.02, k, { axis: 'x', seg: 6, b: 'gloss' });
    B.rbox(0.45, 0.06, 0.43, 0, h - 0.04, 0, k, { r: 0.028, b: 'gloss' });      // seat
    B.rbox(0.39, 0.02, 0.36, 0, h + 0.012, -0.012, '#2a2b2f', { r: 0.009, b: 'gloss' });
    B.rbox(0.08, 0.36, 0.03, 0, h - 0.03, 0.218, k, { r: 0.012, rx: 0.13, b: 'gloss' });      // spine
    B.rbox(0.41, 0.25, 0.05, 0, h + 0.185, 0.262, k, { r: 0.022, rx: 0.13, b: 'gloss' });     // backrest
    B.rbox(0.15, 0.06, 0.012, 0, h + 0.3, 0.3, '#2a2b2f', { r: 0.005, rx: 0.13, b: 'gloss' });
    B.pop();
  }

  function kendo(B, x, z, ry) {                       // screwdriver and bit set
    B.push(tr(x, 0.9, z).multiply(rotY(ry)));
    var i, px;
    B.rbox(0.28, 0.065, 0.14, 0, 0, 0, '#151618', { r: 0.008, b: 'gloss' });
    B.rbox(0.28, 0.05, 0.075, 0, 0.065, 0.03, '#151618', { r: 0.008, b: 'gloss' });
    for (i = 0; i < 12; i++) B.box(0.013, 0.008, 0.013, -0.115 + i * 0.021, 0.065, -0.058, C.alu, ME);
    for (i = 0; i < 8; i++) {
      px = -0.112 + i * 0.032;
      B.cyl(0.013, 0.062, px, 0.115, 0.03, i % 3 === 2 ? '#1c1d1f' : C.orange, { seg: 8, b: 'gloss' });
      B.cyl(0.013, 0.022, px, 0.177, 0.03, '#1c1d1f', { seg: 8, b: 'gloss' });
      if (i % 2 === 0) { B.cyl(0.011, 0.05, px + 0.016, 0.065, -0.03, C.orange, { seg: 8, b: 'gloss' }); B.cyl(0.011, 0.018, px + 0.016, 0.115, -0.03, '#1c1d1f', { seg: 8, b: 'gloss' }); }
    }
    B.pop();
  }

  /* linear pendant light: housing, lit strip, two suspension wires up to `top` */
  function pendant(B, x0, z0, x1, z1, y, top) {
    var alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    B.rbox(alongX ? len : 0.056, 0.05, alongX ? 0.056 : len, cx, y, cz, '#151618', { r: 0.008, b: 'gloss' });
    B.box(alongX ? len - 0.02 : 0.042, 0.006, alongX ? 0.042 : len - 0.02, cx, y - 0.004, cz, '#ffffff', { b: 'led' });
    [0.1, 0.9].forEach(function (t) { B.cyl(0.003, top - y - 0.05, lerp(x0, x1, t), y + 0.05, lerp(z0, z1, t), '#2a2b2e', { seg: 4, b: 'gloss' }); });
  }

  function buildTable(B, z0, withCases) {            // 3.6 x 1.5 m, eight seats, rack overhead
    var zc = z0 + 0.75, xs = [2.84, 3.64, 4.45, 5.25];
    B.at(3.4, zc);
    B.shade(4.0, zc, 4.3, 2.2);
    B.rbox(3.6, 0.05, 1.5, 4.0, 0.85, zc, C.oakTop, { r: 0.009, b: 'oak', w: 'x' });
    B.box(3.56, 0.13, 0.028, 4.0, 0.72, z0 + 0.03, C.oakEdge, { b: 'oak', w: 'x' });
    B.box(3.56, 0.13, 0.028, 4.0, 0.72, z0 + 1.47, C.oakEdge, { b: 'oak', w: 'x' });
    B.box(0.028, 0.13, 1.44, 2.235, 0.72, zc, C.oakEdge, { b: 'oak', w: 'x' });
    [2.27, 4.0, 5.73].forEach(function (x, i) {
      [z0 + 0.07, z0 + 1.43].forEach(function (z) {
        B.box(0.05, (i === 1 ? 0.72 : 2.14) - 0.012, 0.05, x, 0.012, z, C.khaki);
        B.cyl(0.021, 0.012, x, 0, z, '#151618', { seg: 8, b: 'gloss' });                      // levelling foot
      });
      B.box(0.05, 0.04, 1.31, x, 0.05, zc, C.khaki);
    });
    B.box(3.41, 0.04, 0.04, 4.0, 0.05, zc, C.khaki);                                           // stretcher
    B.box(3.5, 0.06, 0.05, 4.0, 2.12, z0 + 0.07, C.khaki);
    B.box(3.5, 0.06, 0.05, 4.0, 2.12, z0 + 1.43, C.khaki);
    [2.27, 3.13, 4.0, 4.87, 5.73].forEach(function (x) { B.box(0.05, 0.06, 1.31, x, 2.12, zc, C.khaki); });
    B.box(3.46, 0.025, 0.46, 4.0, 2.18, zc, '#e6dfcf');                                        // the 45 cm shelf drawn on the plan
    if (withCases) {
      [[5.2, 0], [4.66, 0.05]].forEach(function (p) {
        B.push(tr(p[0], 2.205, zc).multiply(rotY(p[1])));
        B.rbox(0.46, 0.13, 0.32, 0, 0, 0, C.teal, { r: 0.016, b: 'gloss' });
        B.box(0.468, 0.006, 0.328, 0, 0.066, 0, '#15606c', G);
        B.rbox(0.13, 0.025, 0.03, 0, 0.05, 0.165, '#151618', { r: 0.006, b: 'gloss' });
        B.box(0.03, 0.035, 0.012, -0.14, 0.05, 0.162, '#151618', G); B.box(0.03, 0.035, 0.012, 0.14, 0.05, 0.162, '#151618', G);
        B.pop();
      });
    }
    [z0 + 0.34, z0 + 1.16].forEach(function (z) {
      pendant(B, 2.5, z, 5.5, z, 1.9, 2.12);
      B.pool(4.0, 0.914, z, 3.6, 1.0, 0.3);
    });
    xs.forEach(function (x) {
      B.box(0.6, 0.004, 0.44, x, 0.9, z0 + 0.33, '#ffffff', { b: 'mat' });
      B.box(0.6, 0.004, 0.44, x, 0.9, z0 + 1.17, '#ffffff', { b: 'mat' });
      stool(B, x, z0 - 0.2, Math.PI);                                                           // square to the table, tucked in
      stool(B, x, z0 + 1.7, 0);
    });
    B.at(3.4, zc);
    kendo(B, 5.6, z0 + 0.3, -Math.PI / 2);
    B.rbox(0.2, 0.035, 0.12, 5.58, 0.9, z0 + 0.52, '#2a2c30', { r: 0.006, b: 'gloss' });       // bit case
  }

  /* wall cabinets with ribbed polycarbonate doors, plus the perforated screen under them.
     Local frame: x along the wall, z out from it. */
  function uppers(B, M, len, fill) {
    B.push(M);
    var n = Math.round(len / 0.6), mw = len / n, d = 0.32, y0 = 1.8, y1 = 2.4, i, cx, grain = { b: 'oak', w: 'x' };
    B.box(len, 0.025, d, len / 2, y1 - 0.025, d / 2, C.oakTop, grain);
    B.box(len, 0.025, d, len / 2, y0, d / 2, C.oakTop, grain);
    B.box(len, 0.02, d - 0.03, len / 2, (y0 + y1) / 2, d / 2 - 0.015, C.oakTop, grain);
    B.box(len - 0.04, y1 - y0 - 0.05, 0.01, len / 2, y0 + 0.025, 0.008, C.oakEdge, grain);
    for (i = 0; i <= n; i++) B.box(0.02, y1 - y0, d, Math.min(len - 0.01, Math.max(0.01, i * mw)), y0, d / 2, C.oakTop, grain);
    for (i = 0; i < n; i++) {
      cx = i * mw + mw / 2;
      B.box(mw - 0.02, 0.022, 0.02, cx, y0 + 0.004, d + 0.012, C.khaki);
      B.box(mw - 0.02, 0.022, 0.02, cx, y1 - 0.026, d + 0.012, C.khaki);
      B.box(0.022, y1 - y0 - 0.01, 0.02, cx - mw / 2 + 0.021, y0 + 0.005, d + 0.012, C.khaki);
      B.box(0.022, y1 - y0 - 0.01, 0.02, cx + mw / 2 - 0.021, y0 + 0.005, d + 0.012, C.khaki);
      B.box(mw - 0.06, y1 - y0 - 0.05, 0.006, cx, y0 + 0.025, d + 0.012, '#ffffff', { b: 'frost', uv: [22, 1] });
      if (fill) fill(cx, mw, i, y0 + 0.025, (y0 + y1) / 2 + 0.01, d);
    }
    B.box(len, 0.46, 0.02, len / 2, 1.31, 0.012, C.perf);
    B.box(len - 0.04, 0.44, 0.004, len / 2, 1.32, 0.025, '#ffffff', { b: 'perf', uv: [len / 0.05, 0.44 / 0.05] });
    for (i = 0; i < n; i++) {                                                                    // twin sockets
      B.rbox(0.15, 0.085, 0.012, i * mw + mw / 2, 1.065, 0.008, C.white, { r: 0.004 });
      B.cyl(0.02, 0.004, i * mw + mw / 2 - 0.035, 1.107, 0.016, '#dcdcd8', { axis: 'z', seg: 10 }); B.cyl(0.02, 0.004, i * mw + mw / 2 + 0.035, 1.107, 0.016, '#dcdcd8', { axis: 'z', seg: 10 });
    }
    B.pop();
  }

  function legsAlongX(B, xs, zFront, zBack) {         // bench runs along X
    xs.forEach(function (x) {
      B.box(0.045, 0.843, 0.045, x, 0.012, zFront, C.khaki); B.box(0.045, 0.843, 0.045, x, 0.012, zBack, C.khaki);
      B.box(0.045, 0.04, Math.abs(zFront - zBack) + 0.09, x, 0.012, (zFront + zBack) / 2, C.khaki);
      B.cyl(0.02, 0.012, x, 0, zFront, '#151618', { seg: 8, b: 'gloss' }); B.cyl(0.02, 0.012, x, 0, zBack, '#151618', { seg: 8, b: 'gloss' });
    });
  }
  function legsAlongZ(B, zs, xFront, xBack) {         // bench runs along Z
    zs.forEach(function (z) {
      B.box(0.045, 0.843, 0.045, xFront, 0.012, z, C.khaki); B.box(0.045, 0.843, 0.045, xBack, 0.012, z, C.khaki);
      B.box(Math.abs(xFront - xBack) + 0.09, 0.04, 0.045, (xFront + xBack) / 2, 0.012, z, C.khaki);
      B.cyl(0.02, 0.012, xFront, 0, z, '#151618', { seg: 8, b: 'gloss' }); B.cyl(0.02, 0.012, xBack, 0, z, '#151618', { seg: 8, b: 'gloss' });
    });
  }

  function drawerUnit(B, x, z, wz) {                  // steel drawer cabinet under a bench, fronts face +X
    B.rbox(0.56, 0.78, wz, x, 0.04, z, '#2f3237', { r: 0.008, b: 'gloss' });
    B.box(0.5, 0.04, wz - 0.06, x - 0.01, 0, z, '#1f2124', G);
    var hs = [0.09, 0.09, 0.13, 0.17, 0.2], y = 0.8, i;
    for (i = 0; i < hs.length; i++) {
      y -= hs[i] + 0.012;
      B.box(0.012, hs[i], wz - 0.05, x + 0.286, y, z, C.drawer, G);
      B.box(0.02, 0.024, wz - 0.07, x + 0.293, y + hs[i] - 0.03, z, C.alu, ME);                   // handle rail
      B.box(0.008, 0.02, 0.07, x + 0.296, y + hs[i] * 0.3, z, '#e9eaea', G);                      // label holder
    }
    B.cyl(0.008, 0.008, x + 0.294, 0.79, z + wz / 2 - 0.06, C.alu, { axis: 'x', seg: 8, b: 'metal' });   // lock
  }

  /* ====================================================================
     Machines
     ==================================================================== */
  function printer(B, z, rnd) {
    /* Enclosed dual-nozzle printer, modelled on the ones in the room: 492 x 514 x 626 mm, anthracite shell,
       full glass door facing the room (+X) hinged on the left, touchscreen top-left, big rounded side windows,
       and a four-spool filament unit (372 x 280 x 226 mm) on top with a smoked dome lid. */
    var x = 0.37, y = 0.9, body = '#50535a', trim = '#33363b', S = { b: 'satin' }, i;
    B.at(x, z);
    B.box(0.47, 0.018, 0.45, x, y, z, '#17181a', S);                                              // recessed plinth
    B.prism(0.514, 0.492, 0.07, 0.024, x, y + 0.018, z, body, S);                                  // sill
    B.prism(0.514, 0.492, 0.045, 0.024, x, y + 0.581, z, body, S);                                 // roof
    B.box(0.42, 0.005, 0.4, x, y + 0.6245, z, '#2c3338', { b: 'smoke' });                          // glass top
    B.box(0.02, 0.495, 0.45, x - 0.247, y + 0.087, z, body, S);                                    // back
    B.box(0.006, 0.44, 0.41, x - 0.234, y + 0.11, z, '#121314', { b: 'matte' });
    [[-0.232, -0.221], [-0.232, 0.221], [0.232, -0.221], [0.232, 0.221]].forEach(function (p) { B.prism(0.05, 0.05, 0.495, 0.024, x + p[0], y + 0.087, z + p[1], body, S); });
    [-1, 1].forEach(function (s) {                                                                 // sides: solid below, window above
      var zs = z + s * 0.239;
      B.box(0.42, 0.09, 0.014, x, y + 0.087, zs, body, S);
      B.box(0.42, 0.04, 0.014, x, y + 0.543, zs, body, S);
      B.box(0.04, 0.37, 0.014, x - 0.192, y + 0.175, zs, body, S); B.box(0.04, 0.37, 0.014, x + 0.192, y + 0.175, zs, body, S);
      B.rbox(0.35, 0.372, 0.006, x, y + 0.174, zs + s * 0.002, '#1c2429', { r: 0.002, b: 'smoke' });
    });
    /* front: header band, then the door */
    B.box(0.014, 0.057, 0.4, x + 0.25, y + 0.525, z, body, S);
    B.box(0.008, 0.008, 0.4, x + 0.253, y + 0.088, z, trim, S); B.box(0.008, 0.006, 0.4, x + 0.253, y + 0.519, z, trim, S);
    B.box(0.008, 0.432, 0.008, x + 0.253, y + 0.09, z + 0.198, trim, S); B.box(0.008, 0.432, 0.008, x + 0.253, y + 0.09, z - 0.198, trim, S);
    B.box(0.004, 0.428, 0.386, x + 0.253, y + 0.093, z, '#1c2429', { b: 'smoke' });                 // door glass, set just behind its edge trim
    B.rbox(0.02, 0.085, 0.02, x + 0.265, y + 0.26, z - 0.193, trim, { r: 0.006, b: 'satin' });      // pull tab on the right
    B.rbox(0.012, 0.074, 0.116, x + 0.262, y + 0.54, z + 0.17, '#0e0f10', { r: 0.004, b: 'gloss' });      // touchscreen, top-left
    B.box(0.006, 0.056, 0.098, x + 0.268, y + 0.549, z + 0.17, '#1f3140', G);                       // each layer sits 3 mm proud of the one behind
    B.box(0.006, 0.014, 0.05, x + 0.271, y + 0.582, z + 0.184, '#7fc8f0', { b: 'led' }); B.box(0.006, 0.008, 0.03, x + 0.271, y + 0.564, z + 0.194, '#4a7f9c', { b: 'led' });
    B.box(0.006, 0.028, 0.042, x + 0.257, y + 0.566, z + 0.07, C.yellow, S);                        // the stickers on the header
    B.box(0.006, 0.042, 0.03, x + 0.257, y + 0.552, z + 0.028, '#2a2b2e', S); B.box(0.006, 0.013, 0.024, x + 0.26, y + 0.575, z + 0.028, C.green, S);
    /* inside: plate on its bed, lead screws, gantry, tool head, lights */
    B.box(0.38, 0.03, 0.36, x - 0.005, y + 0.175, z, '#1a1b1d', { b: 'matte' });
    B.box(0.365, 0.006, 0.345, x - 0.005, y + 0.205, z, '#8e9092');
    [[-0.205, -0.17], [-0.205, 0.17]].forEach(function (p) { B.cyl(0.006, 0.405, x + p[0], y + 0.09, z + p[1], C.alu, { seg: 6, b: 'metal' }); });
    B.box(0.022, 0.03, 0.42, x - 0.2, y + 0.5, z, '#1c1d1f', S); B.box(0.022, 0.03, 0.42, x + 0.2, y + 0.5, z, '#1c1d1f', S);
    B.box(0.39, 0.028, 0.03, x, y + 0.5, z - 0.04, '#c5c9cc', ME);                                  // X beam
    B.rbox(0.07, 0.105, 0.085, x + 0.04, y + 0.41, z - 0.04, '#17181a', { r: 0.01, b: 'gloss' });   // tool head, two nozzles
    B.box(0.003, 0.05, 0.05, x + 0.076, y + 0.445, z - 0.04, '#3a3d42', G);
    B.cyl(0.005, 0.016, x + 0.04, y + 0.394, z - 0.058, C.brass, { seg: 6, b: 'metal' }); B.cyl(0.005, 0.016, x + 0.04, y + 0.394, z - 0.022, C.brass, { seg: 6, b: 'metal' });
    B.box(0.01, 0.006, 0.36, x + 0.215, y + 0.47, z, '#fff6e2', { b: 'led' });                      // light bar inside the door
    B.box(0.36, 0.006, 0.01, x, y + 0.535, z + 0.215, '#fff6e2', { b: 'led' });
    B.pool(x, y + 0.218, z, 0.46, 0.46, 0.2);
    /* filament unit: grey tub, feeders behind a smoked front, four spools under a half-round lid */
    var ay = y + 0.627, ax = x + 0.005, az = z - 0.06, tub = '#6d7075', cols = ['#f4f4f1', C.orange, '#1c1c1c', C.blue, C.red, '#3c9b62', C.yellow, '#9aa2a8'], sz;
    B.prism(0.25, 0.372, 0.1, 0.022, ax - 0.015, ay, az, tub, S);
    [-1, 1].forEach(function (s) { [-0.075, 0, 0.075].forEach(function (d) { B.box(0.045, 0.08, 0.006, ax - 0.015 + d, ay + 0.012, az + s * 0.187, '#7b7e83', S); }); });   // ribbed ends
    B.box(0.03, 0.02, 0.372, ax + 0.125, ay, az, tub, S); B.box(0.03, 0.012, 0.372, ax + 0.125, ay + 0.088, az, tub, S);     // feeder bay
    B.box(0.006, 0.1, 0.012, ax + 0.138, ay, az - 0.18, tub, S); B.box(0.006, 0.1, 0.012, ax + 0.138, ay, az + 0.18, tub, S);
    for (i = 0; i < 4; i++) {
      sz = az - 0.132 + i * 0.088;
      B.rbox(0.024, 0.05, 0.06, ax + 0.121, ay + 0.022, sz, '#dfe1e2', { r: 0.006, b: 'gloss' });   // feeder
      B.box(0.01, 0.012, 0.022, ax + 0.13, ay + 0.074, sz, '#e08a2a', G);                           // its amber release tab
      B.cyl(0.006, 0.01, ax + 0.134, ay + 0.04, sz, '#101113', { axis: 'x', seg: 8, b: 'gloss' });
      B.cyl(0.088, 0.058, ax - 0.015, ay + 0.118, sz, cols[Math.floor(rnd() * cols.length)], { axis: 'z', seg: 22, b: 'gloss' });   // filament
      B.cyl(0.099, 0.004, ax - 0.015, ay + 0.118, sz - 0.032, '#1a1b1d', { axis: 'z', seg: 22, b: 'gloss' });
      B.cyl(0.099, 0.004, ax - 0.015, ay + 0.118, sz + 0.032, '#1a1b1d', { axis: 'z', seg: 22, b: 'gloss' });
      B.cyl(0.028, 0.084, ax - 0.015, ay + 0.118, sz, '#3a3c40', { axis: 'z', seg: 10, b: 'gloss' });
    }
    B.box(0.004, 0.066, 0.348, ax + 0.139, ay + 0.021, az, '#161b1f', { b: 'smoke' });               // smoked front
    B.cyl(0.126, 0.366, ax - 0.015, ay + 0.098, az, '#2a2623', { axis: 'z', seg: 26, ts: Math.PI / 2, tl: Math.PI, b: 'tint' });    // half-round smoked lid
    [-1, 1].forEach(function (s) {
      B.cyl(0.127, 0.008, ax - 0.015, ay + 0.098, az + s * 0.184, '#1f2023', { axis: 'z', seg: 26, ts: Math.PI / 2, tl: Math.PI, b: 'gloss' });
      B.cyl(0.04, 0.006, ax - 0.015, ay + 0.135, az + s * 0.189, '#17181a', { axis: 'z', seg: 14, b: 'gloss' });
    });
    B.rbox(0.03, 0.016, 0.034, ax + 0.108, ay + 0.094, az, '#eceeee', { r: 0.005, b: 'gloss' });     // lid latch
    B.tube([[ax - 0.14, ay + 0.06, az + 0.1], [ax - 0.2, ay + 0.09, az + 0.14], [ax - 0.25, ay + 0.02, az + 0.17], [ax - 0.262, ay - 0.12, az + 0.17]], 0.005, '#e9ecec', { b: 'gloss', seg: 16, sides: 6 });   // feed tube to the back
  }

  function cnc(B, z) {
    /* Desktop CNC router, modelled on the one in the room: anthracite enclosure about 84 x 60 x 80 cm with rounded
       corner posts, a deep base band, one large framed door (hinges on the left, clear window) and clear side windows.
       Inside: T-slot table, column with a sloped cover, spindle head, four-station tool rack and a tool setter. */
    var x = 0.36, y = 0.9, body = '#36393c', S = { b: 'satin' }, IN = { b: 'matte' }, blk = '#161719', ink = '#0c0d0e', i, hz = z + 0.03;
    B.at(x, z);
    [[-0.24, -0.34], [0.24, -0.34], [-0.24, 0.34], [0.24, 0.34]].forEach(function (p) { B.cyl(0.032, 0.022, x + p[0], y, z + p[1], '#0f1011', { seg: 12, b: 'gloss' }); });
    B.prism(0.6, 0.84, 0.15, 0.036, x, y + 0.02, z, body, S);                                       // base band
    B.box(0.003, 0.035, 0.2, x + 0.3005, y + 0.06, z + 0.25, '#c9cdd0', S);                          // nameplate, lower left
    B.prism(0.6, 0.84, 0.07, 0.036, x, y + 0.73, z, body, S);                                       // top band and roof
    [[-0.264, -0.384], [0.264, -0.384], [-0.264, 0.384], [0.264, 0.384]].forEach(function (p) { B.prism(0.072, 0.072, 0.56, 0.036, x + p[0], y + 0.17, z + p[1], body, S); });
    B.box(0.02, 0.56, 0.74, x - 0.288, y + 0.17, z, body, S);                                        // back panel, dark inside
    B.box(0.004, 0.55, 0.7, x - 0.276, y + 0.175, z, ink, IN);
    [-1, 1].forEach(function (s) { B.box(0.46, 0.55, 0.006, x, y + 0.175, z + s * 0.412, '#5f6e76', { b: 'glass' }); });    // side windows
    /* the door: frame, window, hinges on the left (+Z), handle on the right */
    var dx = x + 0.305, f = 0.065;
    B.box(0.03, f, 0.72, dx, y + 0.175, z, body, S); B.box(0.03, f, 0.72, dx, y + 0.67, z, body, S);
    B.box(0.03, 0.43, f, dx, y + 0.24, z + 0.3275, body, S); B.box(0.03, 0.43, f, dx, y + 0.24, z - 0.3275, body, S);
    B.box(0.008, 0.44, 0.6, dx, y + 0.235, z, '#5f6e76', { b: 'glass' });
    B.box(0.01, 0.012, 0.595, dx + 0.014, y + 0.236, z, blk, S); B.box(0.01, 0.012, 0.595, dx + 0.014, y + 0.662, z, blk, S);     // window gasket
    B.box(0.01, 0.414, 0.012, dx + 0.014, y + 0.248, z + 0.2915, blk, S); B.box(0.01, 0.414, 0.012, dx + 0.014, y + 0.248, z - 0.2915, blk, S);
    [0.19, 0.685].forEach(function (yy) { B.box(0.008, 0.04, 0.045, dx + 0.016, y + yy, z + 0.33, '#b9bec3', ME); });        // corner plates
    [0.3, 0.6].forEach(function (yy) {                                                              // black hinges, four screws each
      B.rbox(0.014, 0.08, 0.085, dx + 0.02, y + yy, z + 0.368, blk, { r: 0.003, b: 'gloss' });
      B.cyl(0.008, 0.09, dx + 0.028, y + yy + 0.04, z + 0.368, blk, { seg: 8, b: 'gloss' });
      [[-0.022, 0.018], [0.022, 0.018], [-0.022, 0.062], [0.022, 0.062]].forEach(function (q) { B.cyl(0.005, 0.004, dx + 0.028, y + yy + q[1], z + 0.368 + q[0], '#d5d9dc', { axis: 'x', seg: 8, b: 'metal' }); });
    });
    B.rbox(0.03, 0.15, 0.03, dx + 0.03, y + 0.38, z - 0.33, blk, { r: 0.008, b: 'gloss' });         // door handle
    /* the machine */
    B.box(0.5, 0.012, 0.74, x - 0.02, y + 0.17, z, '#0f1011', IN);                                    // chip tray floor
    B.box(0.36, 0.05, 0.56, x - 0.02, y + 0.182, z, ink, IN);                                          // base casting
    B.box(0.24, 0.03, 0.2, x + 0.02, y + 0.232, z - 0.02, '#121314', IN);                              // saddle
    B.box(0.2, 0.034, 0.5, x + 0.03, y + 0.262, z - 0.02, '#d5d9dc', ME);                             // T-slot table
    for (i = -2; i <= 2; i++) B.box(0.01, 0.004, 0.5, x + 0.03 + i * 0.04, y + 0.2945, z - 0.02, '#7b8186', S);
    B.box(0.2, 0.01, 0.006, x + 0.03, y + 0.27, z + 0.232, '#aeb3b7', ME);
    B.box(0.11, 0.46, 0.26, x - 0.2, y + 0.182, z + 0.02, ink, IN);                                    // column
    B.box(0.012, 0.36, 0.3, x - 0.12, y + 0.26, z + 0.02, '#101112', { rz: -0.2, b: 'matte' });       // its sloped cover
    B.box(0.1, 0.13, 0.62, x - 0.19, y + 0.52, z, ink, IN);                                            // cross beam
    B.box(0.01, 0.016, 0.58, x - 0.136, y + 0.54, z, '#c9cdd1', ME); B.box(0.01, 0.016, 0.58, x - 0.136, y + 0.615, z, '#c9cdd1', ME);   // linear rails
    B.cyl(0.007, 0.56, x - 0.132, y + 0.585, z, '#d5d9dc', { axis: 'z', seg: 8, b: 'metal' });       // ball screw and bellows
    for (i = 0; i < 9; i++) B.cyl(0.02, 0.012, x - 0.132, y + 0.585, z - 0.27 + i * 0.02, i % 2 ? '#8d9297' : '#a9aeb3', { axis: 'z', seg: 10, b: 'satin' });
    B.rbox(0.11, 0.21, 0.13, x - 0.075, y + 0.47, hz, blk, { r: 0.006, b: 'gloss' });                 // spindle head
    B.rbox(0.05, 0.19, 0.04, x - 0.085, y + 0.48, hz + 0.083, blk, { r: 0.005, b: 'gloss' });
    B.rbox(0.003, 0.052, 0.052, x - 0.019, y + 0.565, hz, '#eceded', { r: 0.001, b: 'gloss' });       // badge plate
    [[-0.05, 0.49], [0.05, 0.49], [-0.05, 0.66], [0.05, 0.66], [-0.05, 0.575], [0.05, 0.575]].forEach(function (p) {
      B.cyl(0.009, 0.004, x - 0.018, y + p[1], hz + p[0], '#d5d9dc', { axis: 'x', seg: 10, b: 'metal' }); B.cyl(0.006, 0.008, x - 0.014, y + p[1], hz + p[0], '#b9bec3', { axis: 'x', seg: 6, b: 'metal' });
    });
    B.cyl(0.05, 0.04, x - 0.07, y + 0.43, hz, '#d9dde0', { seg: 22, b: 'metal' });                    // polished spindle nose, tapering down
    B.cyl(0.034, 0.045, x - 0.07, y + 0.385, hz, '#d9dde0', { rt: 0.05, seg: 22, b: 'metal' });
    B.cyl(0.03, 0.01, x - 0.07, y + 0.375, hz, '#aeb3b7', { seg: 18, b: 'metal' }); B.cyl(0.022, 0.012, x - 0.07, y + 0.363, hz, '#c9cdd1', { seg: 16, b: 'metal' });
    B.cyl(0.017, 0.03, x - 0.07, y + 0.333, hz, '#8a8f94', { seg: 6, b: 'metal' });                   // collet nut
    B.cyl(0.004, 0.015, x - 0.07, y + 0.318, hz, '#c9cdd1', { seg: 6, b: 'metal' });
    B.cyl(0.004, 0.018, x - 0.07, y + 0.3, hz, '#3d6bff', { seg: 6, b: 'led' });                      // coated end mill, below the shank
    /* four-station tool rack and the tool setter at the right-hand end of the table */
    var rz = z - 0.3;
    B.box(0.03, 0.1, 0.03, x - 0.08, y + 0.182, rz, ink, IN); B.box(0.03, 0.1, 0.03, x + 0.1, y + 0.182, rz, ink, IN);
    B.rbox(0.26, 0.012, 0.075, x + 0.01, y + 0.282, rz + 0.01, blk, { r: 0.003, b: 'gloss' });
    for (i = 0; i < 4; i++) {
      var tx = x - 0.08 + i * 0.06;
      B.torus(0.019, 0.006, tx, y + 0.296, rz + 0.03, '#0e0f10', { seg: 14, b: 'gloss' });
      B.cyl(0.013, 0.03, tx, y + 0.27, rz + 0.03, '#c9cdd1', { seg: 12, b: 'metal' }); B.cyl(0.015, 0.01, tx, y + 0.3, rz + 0.03, '#8a8f94', { seg: 12, b: 'metal' });
      B.cyl(0.003, 0.03, tx, y + 0.24, rz + 0.03, i % 2 ? '#c9cdd1' : '#3d6bff', { seg: 5, b: i % 2 ? 'metal' : 'led' });
      B.cyl(0.004, 0.005, tx - 0.022, y + 0.294, rz - 0.012, '#d5d9dc', { seg: 6, b: 'metal' });
    }
    B.cyl(0.021, 0.045, x + 0.15, y + 0.182, z - 0.2, '#d5d9dc', { seg: 16, b: 'metal' });            // tool setter with its brass pin
    B.cyl(0.023, 0.006, x + 0.15, y + 0.205, z - 0.2, '#9aa0a5', { seg: 16, b: 'metal' });
    B.cyl(0.011, 0.008, x + 0.15, y + 0.227, z - 0.2, C.brass, { seg: 12, b: 'metal' }); B.cyl(0.004, 0.008, x + 0.15, y + 0.235, z - 0.2, '#d5d9dc', { seg: 6, b: 'metal' });
    B.hose([[x - 0.2, y + 0.65, z + 0.1], [x - 0.16, y + 0.72, z + 0.14], [x - 0.09, y + 0.72, z + 0.1], [x - 0.07, y + 0.69, z + 0.06]], 0.011, '#8d9297');   // cable conduit
    B.tube([[x - 0.1, y + 0.735, z - 0.2], [x - 0.06, y + 0.7, z - 0.12], [x - 0.04, y + 0.66, z - 0.02], [x - 0.05, y + 0.64, hz + 0.04]], 0.004, '#2a9be8', { b: 'gloss', seg: 18, sides: 6 });   // air line
    B.box(0.46, 0.006, 0.016, x + 0.02, y + 0.724, z + 0.33, '#fff6e2', { b: 'led' });                // work lights
    B.box(0.46, 0.006, 0.016, x + 0.02, y + 0.724, z - 0.33, '#fff6e2', { b: 'led' });
    B.pool(x + 0.02, y + 0.305, z - 0.02, 0.36, 0.62, 0.2);
  }

  function drill(B, z) {                              // bench drill: green head, big feed wheel, digital panel; faces +X
    var x = 0.36, y = 0.9, gr = '#1c7a5a', i, a, wy = y + 0.6, wz = z - 0.155;
    B.at(x, z);
    B.rbox(0.34, 0.03, 0.37, x + 0.02, y, z, '#c4c9cd', { r: 0.008, b: 'metal' });                 // cast table
    [-0.09, 0, 0.09].forEach(function (d) { B.box(0.15, 0.003, 0.012, x + 0.11, y + 0.03, z + d, '#7d8388', G); });
    B.box(0.02, 0.035, 0.3, x - 0.02, y + 0.03, z, '#d9dde0', ME);                                  // fence
    B.box(0.05, 0.006, 0.3, x + 0.005, y + 0.03, z, '#d9dde0', ME);
    B.cyl(0.014, 0.022, x, y + 0.036, z - 0.1, C.red, { seg: 8, b: 'gloss' }); B.cyl(0.014, 0.022, x, y + 0.036, z + 0.1, C.red, { seg: 8, b: 'gloss' });
    B.rbox(0.09, 0.07, 0.11, x - 0.11, y + 0.03, z, '#bfc4c8', { r: 0.01, b: 'metal' });           // column foot
    B.cyl(0.027, 0.64, x - 0.11, y + 0.06, z, '#d7dbde', { seg: 16, b: 'metal' });                 // column (ends inside the head) and rack
    B.box(0.012, 0.5, 0.016, x - 0.079, y + 0.12, z, '#9fa5aa', ME);
    B.rbox(0.06, 0.05, 0.08, x - 0.1, y + 0.13, z, '#bfc4c8', { r: 0.008, b: 'metal' });           // quick clamp
    B.box(0.16, 0.018, 0.03, x - 0.01, y + 0.14, z - 0.03, '#151618', { ry: 0.35, b: 'gloss' });
    B.box(0.16, 0.018, 0.03, x - 0.01, y + 0.14, z + 0.03, '#151618', { ry: -0.35, b: 'gloss' });
    B.rbox(0.3, 0.3, 0.17, x - 0.01, y + 0.44, z, gr, { r: 0.03, b: 'gloss' });                    // head
    B.rbox(0.12, 0.2, 0.174, x - 0.12, y + 0.47, z, '#26292c', { r: 0.02, b: 'gloss' });           // motor vents
    for (i = 0; i < 5; i++) B.box(0.07, 0.006, 0.178, x - 0.12, y + 0.5 + i * 0.03, z, '#111214', G);
    B.cyl(0.03, 0.012, x + 0.142, y + 0.69, z, C.yellow, { axis: 'x', seg: 14, b: 'gloss' });       // emergency stop
    B.cyl(0.021, 0.03, x + 0.158, y + 0.69, z, C.red, { axis: 'x', seg: 12, b: 'gloss' });
    B.box(0.004, 0.085, 0.1, x + 0.141, y + 0.555, z, '#155c44', G);                                // control panel
    B.box(0.004, 0.035, 0.07, x + 0.1425, y + 0.595, z, '#b9d68c', { b: 'led' });
    [[C.green, -0.03], ['#f1f1ee', -0.01], [C.red, 0.01], [C.yellow, 0.03]].forEach(function (c) { B.cyl(0.006, 0.004, x + 0.1435, y + 0.572, z + c[1], c[0], { axis: 'x', seg: 8, b: 'gloss' }); });
    B.cyl(0.026, 0.006, x + 0.141, y + 0.5, z - 0.03, '#e6e6e2', { axis: 'x', seg: 14, b: 'gloss' });   // speed dial
    B.cyl(0.022, 0.018, x + 0.153, y + 0.5, z - 0.03, '#151618', { axis: 'x', seg: 14, b: 'gloss' });
    B.cyl(0.02, 0.026, x + 0.15, y + 0.49, z + 0.045, C.red, { axis: 'x', seg: 10, b: 'gloss' });      // gear selector
    B.cyl(0.022, 0.05, x + 0.07, y + 0.395, z, '#b9bec2', { seg: 12, b: 'metal' });                 // spindle, chuck, bit
    B.cyl(0.03, 0.05, x + 0.07, y + 0.35, z, '#18191b', { seg: 14, b: 'gloss' });
    B.cyl(0.035, 0.012, x + 0.07, y + 0.385, z, C.red, { seg: 14, b: 'gloss' });
    B.cyl(0.014, 0.03, x + 0.07, y + 0.32, z, '#18191b', { rt: 0.03, seg: 14, b: 'gloss' });
    B.cyl(0.004, 0.075, x + 0.07, y + 0.245, z, C.alu, { seg: 6, b: 'metal' });
    B.cyl(0.012, 0.08, x - 0.01, wy, z - 0.115, '#9aa0a5', { axis: 'z', seg: 8, b: 'metal' });      // feed wheel on its shaft
    B.torus(0.098, 0.015, x - 0.01, wy, wz, '#3a3d41', { axis: 'z', seg: 28, tube: 8, b: 'gloss' });
    B.cyl(0.026, 0.035, x - 0.01, wy, wz, '#c9cdd1', { axis: 'z', seg: 12, b: 'metal' });
    for (i = 0; i < 3; i++) { a = i * Math.PI * 2 / 3 + 0.5; B.box(0.085, 0.018, 0.014, x - 0.01 + Math.cos(a) * 0.05, wy + Math.sin(a) * 0.05 - 0.009, wz, '#c9cdd1', { rz: a, b: 'metal' }); }
    B.tube([[x - 0.14, y + 0.5, z + 0.06], [x - 0.2, y + 0.3, z + 0.12], [x - 0.24, y + 0.06, z + 0.2], [x - 0.3, y + 0.02, z + 0.3]], 0.005, '#151618', { b: 'gloss', seg: 20 });
  }

  function sander(B, z) {
    /* Small table belt sander, modelled on the one in the room: olive body about 25 x 20 cm, aluminium table in front,
       the belt standing on edge along the back of the table under a black cover, dust port on the left, switch on the right. */
    var x = 0.38, y = 0.9, ol = '#5d6b3c', bk = '#17181a', i;
    B.at(x, z);
    B.box(0.52, 0.004, 0.46, x + 0.03, y, z + 0.03, '#ecece6');                                      // white cutting mat
    B.rbox(0.215, 0.022, 0.262, x, y + 0.004, z, ol, { r: 0.008, b: 'satin' });                      // foot
    B.rbox(0.19, 0.125, 0.25, x - 0.005, y + 0.022, z, ol, { r: 0.01, b: 'satin' });                 // body
    B.box(0.2, 0.006, 0.256, x - 0.002, y + 0.147, z, '#d9d23c', G);                                 // yellow line under the table
    B.box(0.15, 0.008, 0.215, x + 0.024, y + 0.153, z - 0.012, '#d5d9dc', ME);                       // table
    B.rbox(0.055, 0.078, 0.075, x - 0.078, y + 0.153, z + 0.095, bk, { r: 0.014, b: 'gloss' });      // drive housing
    B.rbox(0.042, 0.02, 0.215, x - 0.08, y + 0.214, z - 0.005, bk, { r: 0.008, b: 'gloss' });        // top cover over the belt
    B.cyl(0.021, 0.055, x - 0.08, y + 0.161, z - 0.108, bk, { seg: 12, b: 'gloss' });                // idler roller
    B.box(0.012, 0.05, 0.165, x - 0.066, y + 0.162, z - 0.018, '#b9b6ae');                           // net belt on its perforated support
    for (i = 0; i < 7; i++) B.box(0.004, 0.011, 0.011, x - 0.0575, y + 0.172 + (i % 2) * 0.019, z - 0.085 + i * 0.022, '#6a6761');
    B.cyl(0.021, 0.075, x - 0.07, y + 0.172, z + 0.168, bk, { axis: 'z', seg: 14, b: 'gloss' });     // dust port
    B.cyl(0.014, 0.022, x - 0.02, y + 0.128, z + 0.136, bk, { axis: 'z', seg: 10, b: 'gloss' });     // locking knob
    B.box(0.1, 0.03, 0.02, x + 0.03, y + 0.161, z - 0.088, '#d5d9dc', ME);                            // angle stop
    B.box(0.05, 0.008, 0.012, x + 0.02, y + 0.195, z - 0.088, bk, G);
    B.box(0.004, 0.06, 0.07, x + 0.092, y + 0.052, z + 0.0, '#141516', G);                            // rating plate with its yellow stripe
    B.box(0.004, 0.06, 0.012, x + 0.092, y + 0.052, z + 0.044, C.yellow, G);
    B.rbox(0.022, 0.062, 0.036, x + 0.099, y + 0.04, z - 0.092, '#141516', { r: 0.004, b: 'gloss' });  // switch: on above, off below
    B.box(0.006, 0.02, 0.024, x + 0.112, y + 0.074, z - 0.092, '#b5c832', G); B.box(0.006, 0.02, 0.024, x + 0.112, y + 0.046, z - 0.092, C.red, G);
    B.tube([[x - 0.02, y + 0.035, z + 0.128], [x + 0.0, y + 0.012, z + 0.2], [x + 0.09, y + 0.012, z + 0.26], [x + 0.16, y + 0.012, z + 0.21]], 0.005, '#151618', { b: 'gloss', seg: 16 });
  }

  function solderStation(B, x, z, ry) {               // soldering station and iron stand; front faces local +Z
    B.at(x, z); B.push(tr(x, 0.9, z).multiply(rotY(ry)));
    var blue = '#2445b0', yel = '#f4c21f';
    B.rbox(0.1, 0.125, 0.125, 0, 0, 0, blue, { r: 0.014, b: 'gloss' });
    B.rbox(0.082, 0.1, 0.008, 0, 0.012, 0.064, yel, { r: 0.003, b: 'gloss' });
    B.box(0.05, 0.022, 0.003, 0, 0.078, 0.0695, '#141414', G);
    [-0.014, 0, 0.014].forEach(function (d) { B.box(0.008, 0.013, 0.002, d, 0.0825, 0.0715, '#ff3b30', { b: 'led' }); });
    B.cyl(0.008, 0.004, -0.02, 0.055, 0.07, '#d9d9d5', { axis: 'z', seg: 8, b: 'gloss' }); B.cyl(0.008, 0.004, 0.02, 0.055, 0.07, '#d9d9d5', { axis: 'z', seg: 8, b: 'gloss' });
    B.cyl(0.011, 0.02, 0, 0.03, 0.075, '#141414', { axis: 'z', seg: 8, b: 'gloss' });
    B.rbox(0.075, 0.028, 0.17, 0.17, 0, 0.02, blue, { r: 0.008, b: 'gloss' });                       // iron stand
    B.box(0.055, 0.012, 0.06, 0.17, 0.028, 0.07, '#8b8f94', G);
    B.cyl(0.02, 0.02, 0.17, 0.028, 0.005, C.brass, { seg: 8, b: 'metal' });
    B.push(tr(0.17, 0.035, -0.045).multiply(rotX(-0.75)));
    B.cyl(0.024, 0.06, 0, 0, 0, yel, { rt: 0.03, seg: 10, b: 'gloss' });
    B.cyl(0.004, 0.07, 0, -0.02, 0, C.alu, { seg: 5, b: 'metal' });
    B.cyl(0.012, 0.11, 0, 0.05, 0, '#2a2b2e', { seg: 8, b: 'gloss' });
    B.cyl(0.014, 0.02, 0, 0.06, 0, yel, { seg: 8, b: 'gloss' });
    B.pop();
    B.tube([[0, 0.03, 0.09], [0.03, 0.006, 0.15], [0.12, 0.006, 0.16], [0.25, 0.006, 0.05], [0.25, 0.05, -0.12], [0.17, 0.152, -0.154]], 0.004, '#151618', { b: 'gloss', seg: 28 });
    B.pop();
  }

  function psu(B, x, z) {                             // bench power supply, dials facing +Z
    var i;
    B.at(x, z);
    B.rbox(0.26, 0.16, 0.32, x, 0.9, z, '#e7e4dc', { r: 0.008, b: 'gloss' });
    for (i = 0; i < 7; i++) B.box(0.16, 0.002, 0.012, x, 1.0605, z - 0.1 + i * 0.03, '#8d8a82', G);
    B.box(0.24, 0.14, 0.004, x, 0.91, z + 0.161, '#d6d3ca', G);
    [-0.055, 0.055].forEach(function (d) {
      B.box(0.085, 0.034, 0.004, x + d, 1.005, z + 0.164, '#161616', G);
      B.box(0.06, 0.018, 0.003, x + d, 1.013, z + 0.1665, '#ff4338', { b: 'led' });
    });
    [-0.085, -0.03, 0.03, 0.085].forEach(function (d) { B.cyl(0.013, 0.02, x + d, 0.972, z + 0.172, '#2b2c2f', { axis: 'z', seg: 12, b: 'gloss' }); });
    [[C.red, -0.05], ['#1b1b1b', 0], [C.green, 0.05]].forEach(function (c) { B.cyl(0.009, 0.022, x + c[1], 0.932, z + 0.172, c[0], { axis: 'z', seg: 8, b: 'gloss' }); });
    B.tube([[x - 0.05, 0.932, z + 0.185], [x - 0.08, 0.908, z + 0.26], [x - 0.02, 0.908, z + 0.36], [x + 0.12, 0.908, z + 0.4], [x + 0.26, 0.908, z + 0.36]], 0.004, C.red, { b: 'gloss', seg: 24 });
    B.tube([[x, 0.932, z + 0.185], [x + 0.02, 0.908, z + 0.25], [x + 0.1, 0.908, z + 0.31], [x + 0.22, 0.908, z + 0.3], [x + 0.3, 0.908, z + 0.33]], 0.004, '#1b1b1b', { b: 'gloss', seg: 24 });
  }

  function meter(B, x, z, ry) {                       // handheld multimeter
    B.push(tr(x, 0.9, z).multiply(rotY(ry)));
    B.rbox(0.085, 0.04, 0.17, 0, 0, 0, C.red, { r: 0.012, b: 'gloss' });
    B.box(0.066, 0.006, 0.148, 0, 0.038, 0, '#2a2b2e', G);
    B.box(0.05, 0.004, 0.035, 0, 0.044, -0.045, '#a9b39a', { b: 'led' });
    B.cyl(0.022, 0.008, 0, 0.044, 0.02, '#151618', { seg: 14, b: 'gloss' });
    B.box(0.016, 0.006, 0.01, -0.02, 0.044, -0.012, C.yellow, G);
    B.pop();
  }

  function trolley(B, x, z, ry) {                     // roller tool cabinet, drawers face local +Z
    B.at(x, z); B.push(tr(x, 0, z).multiply(rotY(ry)));
    var body = '#39424d', front = '#5b6877', hs = [0.065, 0.065, 0.065, 0.065, 0.12, 0.12, 0.17], y = 0.87, i, j;
    [[-0.3, -0.16], [0.3, -0.16], [-0.3, 0.16], [0.3, 0.16]].forEach(function (p) {
      B.cyl(0.055, 0.04, p[0], 0.055, p[1], '#232528', { axis: 'x', seg: 14, b: 'gloss' });
      B.cyl(0.03, 0.044, p[0], 0.055, p[1], '#b8bec4', { axis: 'x', seg: 10, b: 'metal' });
      B.box(0.06, 0.03, 0.07, p[0], 0.095, p[1], '#9aa1a8', ME);
    });
    B.rbox(0.72, 0.77, 0.44, 0, 0.115, 0, body, { r: 0.012, b: 'gloss' });
    for (i = 0; i < hs.length; i++) {
      y -= hs[i] + 0.008;
      B.box(0.6, hs[i], 0.014, 0.045, y, 0.224, front, G);
      B.box(0.606, 0.02, 0.024, 0.045, y + hs[i] - 0.017, 0.2345, '#c3c9cf', ME);                   // full-width handle rail, proud of the drawer on every side
    }
    B.box(0.09, 0.75, 0.016, -0.31, 0.125, 0.224, '#2a3038', G);                                     // lock column
    B.cyl(0.012, 0.01, -0.31, 0.8, 0.236, '#c3c9cf', { axis: 'z', seg: 8, b: 'metal' });
    B.box(0.11, 0.026, 0.006, 0.24, 0.808, 0.234, C.orange, G);
    for (i = 0; i < 6; i++) for (j = 0; j < 4; j++) B.box(0.004, 0.03, 0.03, 0.362, 0.3 + i * 0.09, -0.12 + j * 0.08, '#20252b', G);   // perforated side
    B.rbox(0.78, 0.06, 0.5, 0, 0.885, 0, '#aeb6be', { r: 0.014, b: 'gloss' });                      // top frame and work surface
    B.box(0.7, 0.012, 0.42, 0, 0.94, 0, '#1f2226', G);
    B.box(0.7, 0.02, 0.012, 0, 0.945, 0.204, '#1f2226', G); B.box(0.7, 0.02, 0.012, 0, 0.945, -0.204, '#1f2226', G);
    B.cyl(0.016, 0.4, -0.43, 0.84, 0, '#18191b', { axis: 'z', seg: 10, b: 'gloss' });               // push handle
    B.box(0.05, 0.02, 0.03, -0.4, 0.83, 0.17, '#aeb6be', G); B.box(0.05, 0.02, 0.03, -0.4, 0.83, -0.17, '#aeb6be', G);
    B.pop();
  }

  function bin(B, x, z) {                             // swing-top bin with a liner
    B.at(x, z);
    B.rbox(0.3, 0.5, 0.26, x, 0, z, '#f1f1ee', { r: 0.02, b: 'gloss' });
    B.box(0.31, 0.024, 0.27, x, 0.47, z, '#18191b', G);
    B.rbox(0.31, 0.11, 0.27, x, 0.5, z, '#f6f6f3', { r: 0.035, b: 'gloss' });
  }

  function aircon(B, z) {                             // wall-mounted AC unit on the far wall
    B.rbox(0.24, 0.3, 0.86, W - 0.12, 2.68, z, '#f4f4f1', { r: 0.03, b: 'gloss' });
    B.box(0.02, 0.012, 0.78, W - 0.245, 2.7, z, '#c9cdd1', G); B.box(0.1, 0.008, 0.8, W - 0.2, 2.682, z, '#dfe2e3', { rz: 0.5, b: 'gloss' });
  }

  /* ====================================================================
     The room
     ==================================================================== */
  function buildRoom(B) {
    var rnd = rng(7), i, k;

    /* walls (inward-facing only); the far wall is clad in ribbed panels */
    B.wall('N', 0, W, 0, H, C.wall);
    B.wall('S', 0, W, 0, H, C.wall);
    B.wall('E', 0, 2.5, 0, H, C.wall);
    B.wall('E', 2.5, L, 0, H, '#ffffff', 'wallrib');
    B.wall('W', 0, 3.58, 0, H, C.wall);
    B.wall('W', 3.58, 5.75, 2.16, H, C.wall);
    B.wall('W', 5.75, 6.56, 0, H, C.wall);
    B.wall('W', 6.56, 10.99, 0, 1.12, C.wall);
    B.wall('W', 6.56, 10.99, 2.38, H, C.wall);
    B.wall('W', 10.99, L, 0, H, C.wall);
    /* soft shading where the floor meets the walls, and at the foot of each wall */
    B.delay = 0;
    B.edge(CX, 0.3, W, 0.6, Math.PI); B.edge(CX, L - 0.3, W, 0.6, 0);
    B.edge(0.3, CZ, L, 0.6, -Math.PI / 2); B.edge(W - 0.3, CZ, L, 0.6, Math.PI / 2);
    B.wall('N', 0, W, 0, 0.5, '#000000', 'shadeEdge', 0.006); B.wall('S', 0, W, 0, 0.5, '#000000', 'shadeEdge', 0.006);
    B.wall('E', 0, L, 0, 0.5, '#000000', 'shadeEdge', 0.006);
    B.wall('W', 0, 3.58, 0, 0.5, '#000000', 'shadeEdge', 0.006); B.wall('W', 5.75, L, 0, 0.5, '#000000', 'shadeEdge', 0.006);

    /* boxed columns and the corner store */
    B.at(5.15, 2.7); B.box(1.31, H, 0.4, 5.145, 0, 2.7, '#ffffff', { b: 'rib', w: 'x' });
    B.at(5.4, L); B.box(0.8, H, 0.4, 5.4, 0, L - 0.2, '#ffffff', { b: 'rib', w: 'x' });
    B.at(0.5, 13.6);
    var corner = new T.Shape();
    corner.moveTo(0, 13.0); corner.lineTo(0.42, 13.0); corner.lineTo(1.16, 13.74); corner.lineTo(1.16, L); corner.lineTo(0, L); corner.closePath();
    B.add(new T.ExtrudeGeometry(corner, { depth: H, bevelEnabled: false }), rotX(Math.PI / 2).premultiply(tr(0, H, 0)), C.wall);
    B.push(tr(0.80, 0, 13.36).multiply(rotY(-Math.PI / 4)));                    // service door on the diagonal
    B.box(0.96, 2.1, 0.02, 0, 0, 0, '#7e878a'); B.rbox(0.86, 2.02, 0.03, 0, 0.02, 0.012, '#9aa1a3', { r: 0.006 });
    B.cyl(0.011, 0.11, 0.33, 1.02, 0.045, C.alu, { axis: 'x', seg: 8, b: 'metal' });
    B.box(0.16, 0.14, 0.004, -0.05, 1.5, 0.029, C.yellow, G); B.box(0.16, 0.1, 0.004, -0.05, 1.37, 0.029, '#f4f4f1', G);
    B.box(0.12, 0.09, 0.004, -0.05, 1.67, 0.029, C.red, G);
    B.pop();

    /* entrance: double doors standing open */
    B.at(0, 4.66);
    B.box(0.1, 2.16, 0.06, 0.03, 0, 3.58, C.white); B.box(0.1, 2.16, 0.06, 0.03, 0, 5.75, C.white);
    B.box(0.1, 0.06, 2.23, 0.03, 2.13, 4.665, C.white);
    [[3.62, -0.262], [5.71, 0.262]].forEach(function (d, n) {
      B.push(tr(0.05, 0, d[0]).multiply(rotY(d[1])));                           // leaf runs along local +X, swung ~75 degrees into the room
      B.box(1.04, 0.1, 0.045, 0.52, 0, 0, C.white); B.box(1.04, 0.07, 0.045, 0.52, 2.03, 0, C.white);
      B.box(1.04, 0.09, 0.045, 0.52, 1.0, 0, C.white);
      B.box(0.07, 2.1, 0.045, 0.035, 0, 0, C.white); B.box(0.07, 2.1, 0.045, 1.005, 0, 0, C.white);
      B.box(0.9, 1.94, 0.012, 0.52, 0.09, 0, '#d6e7ee', { b: 'glass' });
      B.rbox(0.56, 0.035, 0.05, 0.6, 1.03, n === 0 ? 0.05 : -0.05, '#18191b', { r: 0.01, b: 'gloss' });   // panic bar
      B.box(0.05, 0.07, 0.06, 0.34, 1.01, n === 0 ? 0.04 : -0.04, '#18191b', G); B.box(0.05, 0.07, 0.06, 0.86, 1.01, n === 0 ? 0.04 : -0.04, '#18191b', G);
      B.box(0.22, 0.05, 0.06, 0.2, 2.04, n === 0 ? 0.05 : -0.05, '#b9bfc5', ME);                          // closer
      B.pop();
    });

    /* fixed window on the machine wall */
    B.at(0, 8.78);
    B.box(0.26, 0.06, 4.55, 0.13, 1.06, 8.775, '#18191b'); B.box(0.26, 0.06, 4.55, 0.13, 2.38, 8.775, '#18191b');
    [6.53, 8.775, 11.02].forEach(function (z) { B.box(0.26, 1.3, 0.06, 0.13, 1.1, z, '#18191b'); });
    B.box(0.05, 0.04, 4.43, 0.04, 1.12, 8.775, C.white); B.box(0.05, 0.04, 4.43, 0.04, 2.34, 8.775, C.white);
    [6.6, 8.72, 8.83, 10.95].forEach(function (z) { B.box(0.05, 1.22, 0.04, 0.04, 1.14, z, C.white); });
    B.box(0.012, 1.26, 4.43, 0.03, 1.12, 8.775, '#d6e7ee', { b: 'glass' });

    /* ---------- electronics bench (Z = 0) and the soldering return ---------- */
    var seats = [0.62, 1.42, 2.22, 3.02, 3.82, 4.62];
    B.at(2.6, 0.4);
    B.shade(2.9, 0.5, 6.2, 1.5);
    B.rbox(5.8, 0.045, 0.8, 2.9, 0.855, 0.4, C.oakTop, { r: 0.008, b: 'oak', w: 'x' });
    B.box(5.8, 0.1, 0.022, 2.9, 0.9, 0.011, C.oakEdge, { b: 'oak', w: 'x' });
    B.box(5.0, 0.055, 0.04, 2.5, 0.8, 0.72, C.khaki);
    legsAlongX(B, [0.06, 1.02, 2.62, 4.22, 4.96], 0.73, 0.07);
    B.at(5.4, 1.7);
    B.shade(5.3, 1.7, 1.5, 2.2);
    B.rbox(0.8, 0.045, 1.7, 5.4, 0.855, 1.65, C.oakTop, { r: 0.008, b: 'oak', w: 'z' });
    B.box(0.022, 0.1, 2.5, W - 0.011, 0.9, 1.25, C.oakEdge, { b: 'oak', w: 'z' });
    legsAlongZ(B, [1.3, 2.42], 5.07, 5.73);
    B.at(2.6, 0.2);
    uppers(B, tr(0, 0, 0), 5.4, function (cx, mw, n, ya, yb, d) {
      if (n < 3) return;                                                        // the first cabinets are still empty
      var c = 2 + Math.floor(rnd() * 2), j;
      for (j = 0; j < c; j++) {                                                 // clear kit boxes with blue latches
        B.rbox(mw - 0.14, 0.075, d - 0.08, cx, ya + j * 0.08, d / 2, '#d5dce4', { r: 0.008 });
        B.box(0.05, 0.03, 0.01, cx - 0.14, ya + 0.02 + j * 0.08, d - 0.035, C.blue); B.box(0.05, 0.03, 0.01, cx + 0.14, ya + 0.02 + j * 0.08, d - 0.035, C.blue);
      }
      if (n % 2) { B.rbox(0.09, 0.04, 0.17, cx - 0.1, yb, d / 2, C.red, { r: 0.01 }); B.rbox(0.09, 0.04, 0.17, cx + 0.06, yb, d / 2, C.red, { r: 0.01 }); }
      else { B.box(0.2, 0.035, 0.24, cx, yb, d / 2, '#b9bec3', ME); B.box(0.17, 0.012, 0.17, cx, yb + 0.035, d / 2 - 0.03, '#202226', G); }   // scale
    });
    seats.forEach(function (x) { B.box(0.6, 0.004, 0.44, x, 0.9, 0.54, '#ffffff', { b: 'mat' }); });
    psu(B, 1.82, 0.2); psu(B, 3.42, 0.2);
    B.at(2.6, 0.3); meter(B, 2.56, 0.2, 0.25); meter(B, 2.7, 0.21, -0.15);
    B.box(0.2, 0.035, 0.24, 0.95, 0.9, 0.18, '#b9bec3', ME); B.box(0.17, 0.012, 0.17, 0.95, 0.935, 0.15, '#202226', G);          // compact scale
    B.box(0.12, 0.004, 0.04, 0.95, 0.936, 0.275, '#a9b39a', { b: 'led' });
    seats.forEach(function (x) { stool(B, x, 1.0, 0); });                       // six stools, square to the bench
    stool(B, 4.78, 1.62, -Math.PI / 2);
    B.at(4.0, 0.9);
    pendant(B, 0.5, 0.85, 2.5, 0.85, 2.55, H); pendant(B, 2.9, 0.85, 4.9, 0.85, 2.55, H);
    B.pool(1.5, 0.914, 0.52, 2.7, 0.95, 0.28); B.pool(3.9, 0.914, 0.52, 2.7, 0.95, 0.28);

    /* soldering corner: fume extractor with two arms, two soldering stations */
    B.at(5.4, 0.6);
    B.rbox(0.3, 0.46, 0.3, 5.42, 0.9, 0.42, C.cream, { r: 0.014, b: 'gloss' });
    B.box(0.22, 0.06, 0.004, 5.42, 1.23, 0.572, '#202226', G);
    for (i = 0; i < 6; i++) B.box(0.2, 0.008, 0.004, 5.42, 0.98 + i * 0.03, 0.572, '#c9c2b0', G);                                  // grille
    B.cyl(0.014, 0.006, 5.33, 0.94, 0.574, '#202226', { axis: 'z', seg: 10, b: 'gloss' });
    B.cyl(0.05, 0.03, 5.36, 1.36, 0.42, '#18191b', { seg: 12, b: 'gloss' }); B.cyl(0.05, 0.03, 5.48, 1.36, 0.42, '#18191b', { seg: 12, b: 'gloss' });
    B.hose([[5.36, 1.38, 0.42], [5.3, 1.75, 0.45], [5.05, 1.98, 0.5], [4.72, 1.8, 0.52], [4.6, 1.4, 0.5], [4.62, 1.21, 0.5]], 0.04, '#18191b');
    B.hose([[5.48, 1.38, 0.42], [5.52, 1.8, 0.6], [5.5, 2.02, 1.0], [5.42, 1.85, 1.4], [5.38, 1.45, 1.55], [5.38, 1.23, 1.56]], 0.04, '#18191b');
    B.cyl(0.115, 0.1, 4.62, 1.11, 0.5, '#18191b', { rt: 0.042, seg: 16, b: 'gloss' });
    B.cyl(0.115, 0.1, 5.38, 1.13, 1.56, '#18191b', { rt: 0.042, seg: 16, b: 'gloss' });
    solderStation(B, 4.26, 0.22, 0);
    solderStation(B, 5.56, 1.86, -Math.PI / 2);
    B.at(5.4, 1.5);
    B.box(0.44, 0.004, 0.6, 5.36, 0.9, 1.5, '#ffffff', { b: 'mat' });
    aircon(B, 1.98);
    bin(B, 4.85, 2.28);

    /* hardware wall: the multi-compartment cabinet by the door, 5 x 13 tilt bins */
    B.at(0.2, 2.95);
    B.shade(0.3, 2.945, 0.9, 1.5);
    B.box(0.42, 0.1, 1.2, 0.21, 0, 2.945, C.charcoal);
    B.box(0.34, 1.9, 1.16, 0.17, 0.1, 2.945, '#d9dcde');
    for (i = 0; i < 13; i++) {
      for (k = 0; k < 5; k++) {
        var by = 0.17 + i * 0.14, bz = 2.505 + k * 0.22;
        B.box(0.02, 0.05 + rnd() * 0.035, 0.19, 0.35, by + 0.004, bz, '#aab0b6', ME);                                              // the screws
        B.box(0.03, 0.105, 0.2, 0.357, by, bz, '#f1f5f8', { b: 'frost', uv: [1, 1] });                                             // clear front
        B.rbox(0.05, 0.036, 0.206, 0.386, by + 0.072, bz, C.blue, { r: 0.006, b: 'gloss' });                                       // blue lip
        B.box(0.004, 0.022, 0.1, 0.412, by + 0.079, bz, '#f4f4f2', G);                                                             // label
      }
    }

    /* ---------- machine wall (X = 0) ---------- */
    B.at(0.35, 9.4);
    B.shade(0.45, 9.475, 1.5, 7.4);
    B.rbox(0.7, 0.045, 6.85, 0.35, 0.855, 9.475, C.oakTop, { r: 0.008, b: 'oak', w: 'z' });
    B.box(0.022, 0.1, 6.85, 0.011, 0.9, 9.475, C.oakEdge, { b: 'oak', w: 'z' });
    legsAlongZ(B, [6.1, 7.2, 8.2, 9.3, 10.45, 11.6, 12.85], 0.64, 0.07);
    B.at(0.35, 7.7); drawerUnit(B, 0.34, 7.72, 0.76);
    B.at(0.35, 8.75); drawerUnit(B, 0.34, 8.75, 0.76);
    B.at(0.35, 11.0); drawerUnit(B, 0.34, 11.02, 0.76);
    B.at(0.35, 12.2); drawerUnit(B, 0.34, 12.2, 0.76);
    sander(B, 6.35);
    drill(B, 6.95);
    B.at(0.3, 7.45); kendo(B, 0.2, 7.42, Math.PI / 2);
    B.rbox(0.15, 0.02, 0.42, 0.5, 0.9, 7.92, '#18191b', { r: 0.006, b: 'gloss' });                                                  // keyboard for the router
    B.box(0.12, 0.004, 0.39, 0.5, 0.92, 7.92, '#2a2b2e', G);
    cnc(B, 8.75);
    B.at(0.3, 9.4);
    B.rbox(0.3, 0.1, 0.24, 0.36, 0.9, 9.42, C.cardboard, { ry: 0.15, r: 0.004 }); B.rbox(0.22, 0.07, 0.18, 0.4, 1.0, 9.43, C.cardboard, { ry: -0.1, r: 0.004 });
    B.box(0.3, 0.002, 0.04, 0.36, 1.0, 9.42, '#b08a58', { ry: 0.15 });
    var coil = []; for (i = 0; i <= 36; i++) coil.push([0.12 + Math.cos(i * 1.5) * 0.03, 0.96 + Math.sin(i * 1.5) * 0.03, 9.2 + i * 0.012]);
    B.tube(coil, 0.006, '#2a9be8', { b: 'gloss', seg: 110, sides: 6 });                                                              // air line
    /* the PC */
    B.at(0.35, 10.0);
    B.rbox(0.4, 0.38, 0.175, 0.3, 0.9, 9.76, '#18191b', { r: 0.008, b: 'gloss' });
    B.box(0.004, 0.36, 0.15, 0.502, 0.91, 9.76, '#232528', G); B.box(0.004, 0.012, 0.11, 0.504, 1.2, 9.76, '#0e0f10', G);
    B.cyl(0.006, 0.004, 0.505, 1.24, 9.71, '#7fd0ff', { axis: 'x', seg: 8, b: 'led' });
    B.rbox(0.2, 0.012, 0.24, 0.24, 0.9, 10.22, '#c9cdd1', { r: 0.005, b: 'metal' }); B.box(0.03, 0.15, 0.05, 0.2, 0.91, 10.22, '#c9cdd1', ME);
    B.rbox(0.022, 0.37, 0.63, 0.23, 1.02, 10.22, '#131416', { r: 0.006, b: 'gloss' });
    B.box(0.003, 0.345, 0.605, 0.2425, 1.035, 10.22, '#22303a', G);
    B.rbox(0.15, 0.02, 0.44, 0.5, 0.9, 10.22, '#18191b', { r: 0.006, b: 'gloss' }); B.box(0.12, 0.004, 0.41, 0.5, 0.92, 10.22, '#2a2b2e', G);
    B.rbox(0.1, 0.03, 0.06, 0.52, 0.9, 10.55, '#18191b', { r: 0.012, b: 'gloss' });                                                  // mouse
    stool(B, 0.98, 9.95, Math.PI / 2); stool(B, 0.98, 10.5, Math.PI / 2);
    stool(B, 0.98, 6.95, Math.PI / 2);
    for (i = 0; i < 4; i++) printer(B, 10.95 + i * 0.57, rnd);
    B.at(0.4, 9.5);
    pendant(B, 0.75, 6.4, 0.75, 8.6, 2.55, H); pendant(B, 0.75, 9.0, 0.75, 10.9, 2.55, H); pendant(B, 0.75, 11.3, 0.75, 12.8, 2.55, H);
    B.pool(0.42, 0.914, 7.5, 0.85, 2.8, 0.24); B.pool(0.42, 0.914, 9.95, 0.85, 2.5, 0.24);
    /* shop vac and bin under the sander */
    B.at(0.4, 6.4);
    B.cyl(0.16, 0.4, 0.36, 0.07, 6.5, '#1d2023', { seg: 18, b: 'gloss' }); B.cyl(0.165, 0.09, 0.36, 0.44, 6.5, '#1c7a5a', { seg: 18, b: 'gloss' });
    B.cyl(0.05, 0.05, 0.36, 0.53, 6.5, '#18191b', { seg: 12, b: 'gloss' }); B.rbox(0.2, 0.025, 0.04, 0.36, 0.58, 6.5, '#18191b', { r: 0.008, b: 'gloss' });
    B.cyl(0.03, 0.05, 0.25, 0.03, 6.38, '#18191b', { axis: 'z', seg: 8, b: 'gloss' }); B.cyl(0.03, 0.05, 0.47, 0.03, 6.38, '#18191b', { axis: 'z', seg: 8, b: 'gloss' });
    B.hose([[0.5, 0.32, 6.52], [0.62, 0.42, 6.62], [0.58, 0.3, 6.78], [0.46, 0.14, 6.74], [0.5, 0.06, 6.6]], 0.022, '#18191b');
    bin(B, 0.3, 6.03);

    /* ---------- the two build tables ---------- */
    buildTable(B, 3.697, true);
    buildTable(B, 9.863, false);

    /* ---------- glass office between the tables ---------- */
    var fr = '#18191b', OX = 3.49, OZ0 = 5.99, OZ1 = 8.89, OH = 2.6;
    B.at(4.6, 6.0);
    B.box(W - OX - 0.06, 1.2, 0.1, (OX + 0.06 + W) / 2, 0, OZ0 + 0.05, C.wall);              // starts after the corner post, so no two faces share a plane
    [OX + 0.03, 4.65, W - 0.03].forEach(function (x) { B.box(0.05, OH - 1.2, 0.06, x, 1.2, OZ0 + 0.05, fr); });
    B.box(W - OX, 0.05, 0.06, (OX + W) / 2, 1.2, OZ0 + 0.05, fr); B.box(W - OX, 0.05, 0.06, (OX + W) / 2, OH - 0.05, OZ0 + 0.05, fr);
    B.box(W - OX - 0.1, OH - 1.3, 0.012, (OX + W) / 2, 1.25, OZ0 + 0.05, '#d6e7ee', { b: 'glass' });
    B.at(3.5, 7.4);
    [OZ0 + 0.03, 6.98, 7.96].forEach(function (z) { B.box(0.06, OH, 0.05, OX + 0.03, 0, z, fr); });
    B.box(0.06, 0.05, OZ1 - OZ0, OX + 0.03, OH - 0.05, (OZ0 + OZ1) / 2, fr); B.box(0.06, 0.05, 1.97, OX + 0.03, 0, 6.98, fr);
    B.box(0.06, 0.05, 1.97, OX + 0.03, 1.0, 6.98, fr);
    B.box(0.012, OH - 0.1, 1.9, OX + 0.03, 0.05, 6.98, '#d6e7ee', { b: 'glass' });
    B.box(0.06, OH, 0.05, OX + 0.03, 0, OZ1 - 0.03, fr);
    B.push(tr(OX + 0.03, 0, OZ1 - 0.06).multiply(rotY(1.15)));                  // office door, ajar
    B.box(0.05, 2.1, 0.04, 0, 0, 0, fr); B.box(0.05, 2.1, 0.04, 0, 0, -0.86, fr);
    B.box(0.04, 0.05, 0.86, 0, 2.05, -0.43, fr); B.box(0.04, 0.05, 0.86, 0, 0, -0.43, fr);
    B.box(0.012, 2.0, 0.8, 0, 0.05, -0.43, '#d6e7ee', { b: 'glass' });
    B.box(0.03, 0.02, 0.12, 0.03, 1.02, -0.74, C.alu, ME); B.box(0.03, 0.02, 0.12, -0.03, 1.02, -0.74, C.alu, ME);
    B.pop();
    B.at(4.0, 8.9);
    B.box(1.0, 0.05, 0.06, 3.99, OH - 0.05, OZ1 - 0.03, fr); B.box(1.0, 0.05, 0.06, 3.99, 0, OZ1 - 0.03, fr);
    B.box(0.94, OH - 0.1, 0.012, 3.99, 0.05, OZ1 - 0.03, '#d6e7ee', { b: 'glass' });
    B.box(1.31, H, 0.42, 5.145, 0, 8.7, C.wall);                                // boxed column, sticker on its far face
    B.at(5.0, 7.3);
    B.shade(5.05, 7.3, 1.9, 1.2);
    B.rbox(1.5, 0.04, 0.8, 5.05, 0.71, 7.3, C.oakTop, { r: 0.008, b: 'oak', w: 'x' });
    [[4.36, 6.96], [4.36, 7.64], [5.74, 6.96], [5.74, 7.64]].forEach(function (p) { B.box(0.045, 0.71, 0.045, p[0], 0, p[1], C.khaki); });
    B.rbox(0.42, 0.6, 0.55, 5.5, 0.05, 7.34, '#e4e6e7', { r: 0.008 });                                                               // drawer pedestal
    [0.12, 0.3, 0.48].forEach(function (yy) { B.box(0.38, 0.015, 0.012, 5.5, yy + 0.1, 7.062, '#b9bfc5', ME); });
    B.rbox(0.56, 0.33, 0.022, 5.0, 0.86, 7.52, '#131416', { r: 0.006, b: 'gloss' }); B.box(0.53, 0.3, 0.003, 5.0, 0.875, 7.5075, '#22303a', G);
    B.box(0.05, 0.12, 0.04, 5.0, 0.75, 7.55, '#c9cdd1', ME); B.rbox(0.22, 0.012, 0.16, 5.0, 0.75, 7.54, '#c9cdd1', { r: 0.005, b: 'metal' });
    B.rbox(0.42, 0.018, 0.14, 5.0, 0.75, 7.2, '#e3e5e6', { r: 0.005, b: 'gloss' }); B.rbox(0.06, 0.028, 0.1, 5.33, 0.75, 7.2, '#e3e5e6', { r: 0.012, b: 'gloss' });
    stool(B, 5.0, 6.72, Math.PI, 0.5);
    B.at(5.5, 6.4);
    B.rbox(0.45, 0.6, 0.6, 5.55, 0, 6.45, '#dfe2e3', { r: 0.008 });                                                                  // printer on its cabinet
    B.rbox(0.42, 0.22, 0.46, 5.55, 0.6, 6.45, '#eceeef', { r: 0.02, b: 'gloss' }); B.rbox(0.42, 0.06, 0.46, 5.55, 0.82, 6.45, '#d2d6d8', { r: 0.02, b: 'gloss' });
    B.box(0.3, 0.004, 0.2, 5.5, 0.88, 6.5, '#18191b', G); B.box(0.1, 0.03, 0.004, 5.42, 0.74, 6.682, '#22303a', G);

    /* tool trolley, parked in the aisle by the second table */
    trolley(B, 2.4, 8.85, -2.36);

    /* ---------- materials wall (Z = L) ---------- */
    var seatS = [1.75, 2.8, 3.85];
    B.at(2.8, L - 0.4);
    B.shade(2.8, L - 0.5, 3.8, 1.5);
    B.rbox(3.25, 0.045, 0.8, 2.8, 0.855, L - 0.4, C.oakTop, { r: 0.008, b: 'oak', w: 'x' });
    B.box(3.25, 0.1, 0.022, 2.8, 0.9, L - 0.011, C.oakEdge, { b: 'oak', w: 'x' });
    B.box(3.1, 0.055, 0.04, 2.8, 0.8, L - 0.72, C.khaki);
    legsAlongX(B, [1.24, 2.28, 3.32, 4.38], L - 0.73, L - 0.07);
    var dots = [C.yellow, '#e7e7e2', '#bfc4c8', '#8f979c', '#2b2d30', C.red, '#d84a9a', '#6a57c9', C.blue, '#2f8f63', C.orange];
    uppers(B, tr(4.22, 0, L).multiply(rotY(Math.PI)), 3.0, function (cx, mw, n, ya, yb, d) {
      [ya, yb].forEach(function (y, row) {                                      // filament, boxed by colour
        var j, col = dots[(n * 2 + row + 3) % dots.length], px;
        for (j = 0; j < 5; j++) {
          px = cx - mw / 2 + 0.085 + j * ((mw - 0.17) / 4);
          B.box(0.082, 0.22, 0.2, px, y, d / 2 + 0.02, '#f3f3f0');
          B.box(0.045, 0.09, 0.006, px, y + 0.09, d / 2 + 0.122, col);
          B.box(0.06, 0.012, 0.006, px, y + 0.03, d / 2 + 0.122, '#7fbf9a');
        }
      });
    });
    seatS.forEach(function (x) { B.box(0.6, 0.004, 0.44, x, 0.9, L - 0.54, '#ffffff', { b: 'mat' }); stool(B, x, L - 1.0, Math.PI); });
    B.at(2.8, L - 0.9);
    pendant(B, 1.5, L - 0.85, 4.1, L - 0.85, 2.55, H);
    B.pool(2.8, 0.914, L - 0.52, 3.4, 0.95, 0.28);
    B.at(5.0, L - 0.5);                                                          // air line with a blow gun on the pillar
    var hose = []; for (i = 0; i <= 40; i++) hose.push([4.96 + Math.cos(i * 1.6) * 0.05, 1.95 - i * 0.026, L - 0.44 + Math.sin(i * 1.6) * 0.035]);
    B.tube(hose, 0.011, '#ff5b2e', { b: 'gloss', seg: 130, sides: 6 });
    B.rbox(0.1, 0.12, 0.03, 4.96, 1.98, L - 0.415, '#bfc5ca', { r: 0.006, b: 'metal' });
    B.box(0.03, 0.1, 0.03, 4.96, 0.83, L - 0.44, '#18191b', G); B.cyl(0.006, 0.09, 4.96, 0.8, L - 0.5, C.alu, { axis: 'z', seg: 6, b: 'metal' });
    aircon(B, 11.2);

    /* disc pendants washing the walls with light */
    [0.9, 2.3, 3.7, 5.0].forEach(function (x) {
      B.at(x, 0.4); B.cyl(0.13, 0.012, x, 2.66, 0.36, C.brown, { seg: 22 }); B.cyl(0.008, 0.43, x, 2.67, 0.36, C.white, { seg: 5 }); B.cyl(0.03, 0.03, x, 2.63, 0.36, C.white, { seg: 10 });
      B.glow(tr(x, 2.68, 0.012), 1.1, 0.9, 0.5);
      var xs = x * 0.72 + 0.9;
      B.at(xs, L - 0.4); B.cyl(0.13, 0.012, xs, 2.66, L - 0.36, C.brown, { seg: 22 }); B.cyl(0.008, 0.43, xs, 2.67, L - 0.36, C.white, { seg: 5 }); B.cyl(0.03, 0.03, xs, 2.63, L - 0.36, C.white, { seg: 10 });
    });
    [6.15, 11.75, 12.6].forEach(function (z) {
      B.at(0.3, z); B.cyl(0.13, 0.012, 0.36, 2.66, z, C.brown, { seg: 22 }); B.cyl(0.008, 0.43, 0.36, 2.67, z, C.white, { seg: 5 }); B.cyl(0.03, 0.03, 0.36, 2.63, z, C.white, { seg: 10 });
      B.glow(tr(0.012, 2.6, z).multiply(rotY(Math.PI / 2)), 1.0, 0.9, 0.45);
    });
  }

  /* ====================================================================
     Hand-drawn wall graphics (canvas)
     ==================================================================== */
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    return t;
  }
  function burst(g, cx, cy, rO, rI, n, rot, fill, lw) {
    g.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? rI : rO * (0.86 + ((i * 37) % 11) / 40), a = rot + i * Math.PI / n;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath(); g.lineJoin = 'round';
    if (lw) { g.lineWidth = lw; g.strokeStyle = '#111'; g.stroke(); }
    g.fillStyle = fill; g.fill();
  }
  function cloud(g, cx, cy, w, h, fill, lw) {
    var pts = [], n = 9, i, r = Math.min(w, h) * 0.27;
    for (i = 0; i < n; i++) { var a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * w * 0.33, cy + Math.sin(a) * h * 0.24]); }
    g.fillStyle = '#111'; pts.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], r + lw, 0, 7); g.fill(); });
    g.fillStyle = fill; pts.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fill(); });
    g.beginPath(); g.ellipse(cx, cy, w * 0.36, h * 0.26, 0, 0, 7); g.fill();
  }
  function word(g, text, cx, cy, size, fill, lw, rot, stroke) {
    g.save(); g.translate(cx, cy); g.rotate(rot || 0); g.transform(1, 0, -0.16, 1, 0, 0);
    g.font = '900 ' + size + 'px Archivo, "Arial Black", Impact, sans-serif';
    try { g.fontStretch = 'expanded'; } catch (e) {}
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (lw) { g.lineWidth = lw; g.strokeStyle = stroke || '#111'; g.strokeText(text, 0, 0); }
    g.fillStyle = fill; g.fillText(text, 0, 0); g.restore();
  }
  var ART = {
    oops: function (g, w, h) {                                   // by the front door
      cloud(g, w * 0.36, h * 0.2, w * 0.62, h * 0.34, '#ffc61a', 5); word(g, 'oops!', w * 0.36, h * 0.2, 74, '#fff', 12, -0.08);
      word(g, 'oops!', w * 0.72, h * 0.46, 70, '#111', 0, -0.06);
      cloud(g, w * 0.3, h * 0.58, w * 0.56, h * 0.3, '#fff', 5); word(g, 'oops!', w * 0.3, h * 0.58, 66, '#ffc61a', 12, -0.12);
      burst(g, w * 0.66, h * 0.82, w * 0.3, w * 0.17, 9, 0.2, '#ffc61a', 0); word(g, 'oops!', w * 0.66, h * 0.82, 58, '#fff', 11, -0.1);
    },
    what: function (g, w, h) {                                   // above the soldering corner
      burst(g, w * 0.42, h * 0.27, w * 0.36, w * 0.2, 11, 0.1, '#e3256b', 7); word(g, 'Oops', w * 0.42, h * 0.27, 96, '#ffc61a', 14, -0.14);
      burst(g, w * 0.56, h * 0.72, w * 0.36, w * 0.21, 10, 0.5, '#e3256b', 7); word(g, 'WHAT?!', w * 0.55, h * 0.72, 88, '#ffb21a', 14, -0.1);
    },
    omg: function (g, w, h) { word(g, 'OMG!', w * 0.5, h * 0.54, h * 0.78, '#15171a', 0, -0.07); },
    omg2: function (g, w, h) {                                   // on the column behind table two
      burst(g, w * 0.5, h * 0.42, w * 0.46, w * 0.25, 12, 0.3, '#f39a1f', 6); burst(g, w * 0.5, h * 0.42, w * 0.33, w * 0.22, 10, 0.1, '#fff', 4);
      word(g, 'OMG!!', w * 0.5, h * 0.42, 92, '#ffb21a', 14, -0.08);
      g.fillStyle = '#f39a1f'; g.fillRect(w * 0.44, h * 0.62, w * 0.12, h * 0.26);
    },
    ouch: function (g, w, h) { cloud(g, w * 0.5, h * 0.5, w * 0.86, h * 0.8, '#e3256b', 6); word(g, 'ouch', w * 0.5, h * 0.5, 92, '#fff', 0, -0.05); },
    cmyk: function (g, w, h) {                                   // behind the printers
      var cs = [['#12a9e6', 'C', 0.56, 0.2], ['#e3256b', 'M', 0.76, 0.2], ['#ffc61a', 'Y', 0.56, 0.4], ['#d7d7d2', 'K', 0.76, 0.4]];
      cs.forEach(function (c) {
        g.fillStyle = c[0]; g.beginPath(); g.arc(w * c[2], h * c[3], w * 0.115, 0, 7); g.fill();
        g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(w * c[2], h * c[3], w * 0.05, 0, 7); g.fill();
        g.fillStyle = '#222'; g.font = '700 ' + (w * 0.055) + 'px Archivo, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c[1], w * c[2], h * c[3] + 2);
      });
      [['#15171a', 0.2, 0.3], ['#e3256b', 0.33, 0.52], ['#12a9e6', 0.12, 0.72]].forEach(function (d) {
        var x = w * d[1], y = h * d[2], r = w * 0.05;
        g.fillStyle = d[0]; g.beginPath(); g.moveTo(x, y - r * 2.6); g.quadraticCurveTo(x + r * 1.5, y - r * 0.2, x + r, y + r * 0.5);
        g.arc(x, y + r * 0.5, r, 0, Math.PI); g.quadraticCurveTo(x - r * 1.5, y - r * 0.2, x, y - r * 2.6); g.fill();
      });
    },
    kit: function (g, w, h) {                                    // yellow maker's-tools cluster on the office wall
      var r = rng(3), i; g.fillStyle = '#ffc61a'; g.strokeStyle = '#ffc61a'; g.lineWidth = 7; g.lineCap = 'round';
      for (i = 0; i < 26; i++) {
        var a = r() * 6.28, d = Math.sqrt(r()) * w * 0.4, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d, s = 12 + r() * 16, k = i % 4;
        g.save(); g.translate(x, y); g.rotate(r() * 3);
        if (k === 0) { g.beginPath(); g.arc(0, 0, s * 0.6, 0, 7); g.stroke(); }
        else if (k === 1) { g.fillRect(-s, -s * 0.22, s * 2, s * 0.44); }
        else if (k === 2) { g.beginPath(); g.moveTo(0, -s); g.lineTo(s, s * 0.8); g.lineTo(-s, s * 0.8); g.closePath(); g.stroke(); }
        else { g.beginPath(); g.moveTo(-s, 0); g.lineTo(s, 0); g.moveTo(s * 0.5, -s * 0.5); g.lineTo(s, 0); g.lineTo(s * 0.5, s * 0.5); g.stroke(); }
        g.restore();
      }
    }
  };

  /* neutral studio surroundings, used only for reflections on glass, metal and plastic */
  function studio(renderer) {
    try {
      var s = new T.Scene();
      var panel = function (w, h, x, y, z, rx, ry, c) {
        var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide }));
        m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
      };
      s.add(new T.Mesh(new T.BoxGeometry(24, 12, 24), new T.MeshBasicMaterial({ color: 0x7c8488, side: T.BackSide })));
      panel(16, 16, 0, 5.9, 0, Math.PI / 2, 0, 0xffffff);          // bright ceiling
      panel(24, 24, 0, -5.9, 0, -Math.PI / 2, 0, 0x5d5a55);         // floor
      panel(10, 4, -11.9, 1, 0, 0, Math.PI / 2, 0xe9f2fa);          // cool, like the window side
      panel(10, 4, 11.9, 1, 3, 0, -Math.PI / 2, 0xfff1dc);          // warm
      panel(8, 3, 0, 1, -11.9, 0, 0, 0xffffff);
      var pm = new T.PMREMGenerator(renderer), rt = pm.fromScene(s, 0.035);
      pm.dispose();
      return rt.texture;
    } catch (e) { return null; }
  }

  /* ====================================================================
     create(): renderer, materials, scene, intro, camera flight
     ==================================================================== */
  function create(canvas, opt) {
    opt = opt || {};
    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(36, 1, 0.2, 90);
    var uRise = { value: 0 };
    scene.environment = studio(renderer);

    /* the build-up: every vertex grows from the floor once the wave reaches it */
    function rise(mat) {
      mat.onBeforeCompile = function (s) {
        s.uniforms.uRise = uRise;
        s.vertexShader = 'attribute float aDelay;\nuniform float uRise;\nvarying float vRise;\n' + s.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n float rk = clamp((uRise - aDelay) / 0.22, 0.0, 1.0);\n vRise = rk;\n float rb = rk - 1.0;\n rk = 1.0 + 2.2 * rb * rb * rb + 1.2 * rb * rb;\n transformed.y *= rk;');
        s.fragmentShader = 'varying float vRise;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vRise <= 0.0) discard;');
      };
      return mat;
    }

    var B = new Builder(), t0 = performance.now();
    buildRoom(B);
    var buildMs = Math.round(performance.now() - t0);

    /* ---------- textures, all drawn here so the site ships no texture files ---------- */
    function repeat(t, x, y) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(x, y); return t; }
    var woodTex = repeat(canvasTex(1024, 512, function (g, w, h) {            // oak: 1.6 m along the grain, 0.8 m across
      var r = rng(5), i, y, a, x, amp, ph, f;
      g.fillStyle = '#dcbd8e'; g.fillRect(0, 0, w, h);
      for (i = 0; i < 6; i++) { g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,238,205' : '165,120,66') + ',' + (0.04 + r() * 0.06) + ')'; g.fillRect(0, i * h / 6, w, h / 6); }
      for (i = 0; i < 420; i++) {
        y = r() * h; a = 0.03 + r() * 0.1; amp = r() * 4; ph = r() * 6.28; f = 1 + Math.floor(r() * 3);
        g.strokeStyle = r() > 0.38 ? 'rgba(140,96,48,' + a + ')' : 'rgba(255,242,214,' + a + ')';
        g.lineWidth = 0.6 + r() * 2; g.beginPath();
        for (x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x / w * 6.2832 * f + ph) * amp);
        g.stroke();
      }
      for (i = 1; i < 6; i++) { g.fillStyle = 'rgba(120,84,44,.16)'; g.fillRect(0, i * h / 6 - 1, w, 1.5); }
    }), 1 / 1.6, 1 / 0.8);
    var ribTex = repeat(canvasTex(128, 8, function (g, w, h) {                // ribbed cladding: four ribs per 12 cm
      for (var i = 0; i < 4; i++) {
        var gr = g.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
        gr.addColorStop(0, '#bdb5a3'); gr.addColorStop(0.18, '#e9e2d2'); gr.addColorStop(0.6, '#efe9da'); gr.addColorStop(0.9, '#d9d1bf'); gr.addColorStop(1, '#bdb5a3');
        g.fillStyle = gr; g.fillRect(i * 32, 0, 32, h);
      }
    }), 1 / 0.12, 1);
    var matTex = canvasTex(256, 256, function (g, w, h) {                     // cutting mat with its grid
      g.fillStyle = '#6e6873'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(214,150,120,.28)'; g.lineWidth = 1;
      for (var i = 16; i < w; i += 16) { g.beginPath(); g.moveTo(i + 0.5, 12); g.lineTo(i + 0.5, h - 12); g.moveTo(12, i + 0.5); g.lineTo(w - 12, i + 0.5); g.stroke(); }
      g.strokeStyle = 'rgba(224,160,128,.55)'; g.lineWidth = 2; g.strokeRect(12, 12, w - 24, h - 24);
    });
    var frostTex = repeat(canvasTex(32, 8, function (g, w, h) {               // twin-wall polycarbonate ribs
      var gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#d9dedf'); gr.addColorStop(0.62, '#f4f6f6'); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }), 1, 1);
    var perfTex = repeat(canvasTex(64, 64, function (g) { g.fillStyle = '#8f8972'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#45423a'; g.fillRect(17, 17, 30, 30); }), 1, 1);
    var glowTex = canvasTex(128, 128, function (g) {
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
    var softTex = canvasTex(64, 64, function (g, w, h) {                      // soft-edged patch
      var d = g.createImageData(w, h), x, y, a;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        a = smooth(Math.min(x, w - 1 - x) / 18) * smooth(Math.min(y, h - 1 - y) / 18);
        d.data[(y * w + x) * 4] = d.data[(y * w + x) * 4 + 1] = d.data[(y * w + x) * 4 + 2] = 255; d.data[(y * w + x) * 4 + 3] = a * 255;
      }
      g.putImageData(d, 0, 0);
    });
    var edgeTex = canvasTex(4, 64, function (g, w, h) {                       // dark at the bottom edge, clear at the top
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    edgeTex.wrapS = T.RepeatWrapping;

    function std(o) { return rise(new T.MeshStandardMaterial(o)); }
    function shadeMat(tex, op) { return rise(new T.MeshBasicMaterial({ map: tex, color: 0x000000, transparent: true, opacity: op, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 })); }
    var ribMat = std({ vertexColors: true, map: ribTex, roughness: 0.82, envMapIntensity: 0.2 });
    var mats = {
      wall: std({ vertexColors: true, roughness: 0.94, envMapIntensity: 0.2 }),
      wallrib: ribMat, rib: ribMat,
      matte: std({ vertexColors: true, roughness: 0.84, envMapIntensity: 0.24 }),
      oak: std({ vertexColors: true, map: woodTex, roughness: 0.56, envMapIntensity: 0.28 }),
      mat: std({ vertexColors: true, map: matTex, roughness: 0.9, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
      satin: std({ vertexColors: true, roughness: 0.6, metalness: 0.06, envMapIntensity: 0.5 }),
      gloss: std({ vertexColors: true, roughness: 0.36, metalness: 0.04, envMapIntensity: 0.95 }),
      metal: std({ vertexColors: true, roughness: 0.27, metalness: 0.9, envMapIntensity: 1.3 }),
      perf: std({ map: perfTex, roughness: 0.75, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
      shadeRect: shadeMat(softTex, 0.3), shadeEdge: shadeMat(edgeTex, 0.26),
      led: rise(new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
      glow: rise(new T.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 })),
      frost: std({ vertexColors: true, map: frostTex, transparent: true, opacity: 0.6, roughness: 0.5, envMapIntensity: 0.6, depthWrite: false }),
      glass: std({ vertexColors: true, transparent: true, opacity: 0.17, roughness: 0.04, envMapIntensity: 1.5, depthWrite: false, side: T.DoubleSide }),
      smoke: std({ vertexColors: true, transparent: true, opacity: 0.4, roughness: 0.08, envMapIntensity: 1.4, depthWrite: false, side: T.DoubleSide }),
      tint: std({ vertexColors: true, transparent: true, opacity: 0.8, roughness: 0.1, envMapIntensity: 1.0, depthWrite: false, side: T.DoubleSide })
    };
    var depthMat = rise(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }));
    var casts = { matte: 1, rib: 1, oak: 1, satin: 1, gloss: 1, metal: 1 }, receives = { wall: 1, wallrib: 1, perf: 1, mat: 1 };
    var room = new T.Group(); scene.add(room);
    ['wall', 'wallrib', 'matte', 'rib', 'oak', 'mat', 'satin', 'gloss', 'metal', 'perf', 'shadeRect', 'shadeEdge', 'led', 'glow', 'frost', 'glass', 'smoke', 'tint'].forEach(function (n, i) {
      var m = B.mesh(n, mats[n]); if (!m) return;
      if (casts[n]) { m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = depthMat; }
      if (receives[n]) m.receiveShadow = true;
      m.renderOrder = i + 1; room.add(m);
    });

    /* floor */
    var tile = canvasTex(512, 512, function (g) {
      g.fillStyle = C.floor; g.fillRect(0, 0, 512, 512);
      var r = rng(11), i;
      for (i = 0; i < 2600; i++) { g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255' : '112,108,100') + ',' + (0.025 + r() * 0.05) + ')'; g.fillRect(r() * 512, r() * 512, 1 + r() * 4, 1 + r() * 4); }
      for (i = 0; i < 26; i++) { g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255' : '120,116,108') + ',.035)'; g.beginPath(); g.ellipse(r() * 512, r() * 512, 30 + r() * 80, 20 + r() * 50, r() * 3, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(96,92,86,.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 512, 512);
    });
    repeat(tile, W / 0.8, L / 0.8);
    var floorMat = new T.MeshStandardMaterial({ map: tile, roughness: 0.62, envMapIntensity: 0.14, transparent: true, opacity: 0 });
    var floor = new T.Mesh(new T.PlaneGeometry(W, L), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(CX, 0, CZ); floor.receiveShadow = true; scene.add(floor);
    var plinthMat = new T.MeshStandardMaterial({ color: C.plinth, roughness: 0.9, transparent: true, opacity: 0 });
    var plinth = new T.Mesh(new T.BoxGeometry(W + 0.26, 0.16, L + 0.26), plinthMat);
    plinth.position.set(CX, -0.105, CZ); scene.add(plinth);                        // top sits 25 mm under the floor, never level with it

    /* the architect's drawing, lying on the floor */
    var ink = new T.Color(opt.ink || '#141a1c');
    var planMat = new T.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    var plan = new T.Mesh(new T.PlaneGeometry(PLAN.w / PLAN.ppm, PLAN.h / PLAN.ppm), planMat);
    plan.rotation.x = -Math.PI / 2;
    plan.position.set((PLAN.w / 2 - PLAN.x0) / PLAN.ppm, 0.02, (PLAN.h / 2 - PLAN.y0) / PLAN.ppm);
    plan.renderOrder = 40; plan.visible = false; scene.add(plan);
    var planReady = false;
    if (opt.plan) {
      new T.TextureLoader().load(opt.plan, function (t) {
        t.anisotropy = 8; t.minFilter = T.LinearMipmapLinearFilter; planMat.map = t; planMat.needsUpdate = true; plan.visible = true; planReady = true;
      }, undefined, function () { planReady = true; });
    } else planReady = true;

    /* wall graphics */
    var decals = [];
    function decal(name, cw, chh, w, h, m, x, z) {
      var tex = canvasTex(cw, chh, ART[name]);
      var mat = new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      var mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat);
      mesh.applyMatrix4(m); mesh.renderOrder = 30; scene.add(mesh);
      decals.push({ mat: mat, tex: tex, name: name, delay: Math.min(1, Math.hypot(x - DOOR.x, z - DOOR.z) / 11.4) * 0.78 });
    }
    decal('oops', 512, 640, 0.72, 0.9, tr(0.014, 1.95, 6.15).multiply(rotY(Math.PI / 2)), 0, 6.15);
    decal('what', 512, 640, 1.04, 1.3, tr(W - 0.014, 1.98, 0.95).multiply(rotY(-Math.PI / 2)), W, 0.95);
    decal('omg', 1024, 320, 1.9, 0.6, tr(2.0, 2.76, L - 0.014).multiply(rotY(Math.PI)), 2.0, L);
    decal('omg2', 512, 512, 0.85, 0.85, tr(5.1, 1.75, 8.924), 5.1, 8.9);
    decal('ouch', 384, 320, 0.5, 0.42, tr(4.62, 2.25, L - 0.014).multiply(rotY(Math.PI)), 4.6, L);
    decal('cmyk', 512, 512, 1.5, 1.5, tr(0.014, 2.15, 11.95).multiply(rotY(Math.PI / 2)), 0, 11.95);
    decal('kit', 384, 384, 0.62, 0.62, tr(4.95, 0.62, 5.985).multiply(rotY(Math.PI)), 4.95, 6.0);

    /* soft shadow under the whole model */
    var under = new T.Mesh(new T.PlaneGeometry(W + 9, L + 9), new T.MeshBasicMaterial({
      map: canvasTex(128, 256, function (g, w, h) {
        for (var i = 0; i < 26; i++) {                 // stacked soft rectangles stand in for a blur
          var k = i / 25, ix = w * (0.12 + 0.2 * k), iy = h * (0.1 + 0.11 * k);
          g.fillStyle = 'rgba(0,0,0,' + (0.012 + 0.03 * k) + ')'; g.fillRect(ix, iy, w - ix * 2, h - iy * 2);
        }
      }), transparent: true, opacity: 0, depthWrite: false, toneMapped: false
    }));
    under.rotation.x = -Math.PI / 2; under.position.set(CX + 0.3, -0.2, CZ + 0.2); under.renderOrder = -1; scene.add(under);

    /* light: a soft sky, one warm key light with shadows, a cool fill */
    var hemi = new T.HemisphereLight(0xffffff, 0xa39c90, 0.42); scene.add(hemi);
    var sun = new T.DirectionalLight(0xfff1dc, 0.54);
    sun.position.set(CX - 6, 13, CZ - 4.5); sun.target.position.set(CX, 0, CZ); scene.add(sun, sun.target);
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var smap = (!coarse && renderer.capabilities.maxTextureSize >= 4096) ? 4096 : 2048;
    sun.castShadow = true; sun.shadow.mapSize.set(smap, smap);
    var sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 34;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = smap > 2048 ? 5 : 3.5;
    var fill = new T.DirectionalLight(0xdfeaf2, 0.12); fill.position.set(CX + 7, 6, CZ + 6); scene.add(fill);

    /* ---------- camera flight ---------- */
    var N = STOPS.length;
    var curveP = new T.CatmullRomCurve3(STOPS.map(function (s) { return new T.Vector3().fromArray(s.p); }), false, 'centripetal');
    var curveT = new T.CatmullRomCurve3(STOPS.map(function (s) { return new T.Vector3().fromArray(s.t); }), false, 'centripetal');
    var state = {
      w: 1, h: 1, portrait: false, dpr: 1,
      uTarget: 0, u: 0, shiftX: 0, shiftY: 0, shiftXT: 0, shiftYT: 0,
      px: 0, py: 0, pxS: 0, pyS: 0,
      t: 0, intro: 0, introDone: false, introSpeed: 1, running: false, visible: true, raf: 0, last: 0,
      slow: 0, frames: 0
    };
    var vP = new T.Vector3(), vT = new T.Vector3(), vA = new T.Vector3(), vB = new T.Vector3(), vC = new T.Vector3(), vD = new T.Vector3();
    var qTop = new T.Quaternion(), qLive = new T.Quaternion(), mLook = new T.Matrix4(), UP = new T.Vector3(0, 1, 0);
    var topPos = new T.Vector3();

    function overview(time, outP, outT) {                // the slow bird's-eye circuit
      var fit = state.portrait ? 1.0 : Math.max(1, 1.55 / (state.w / state.h));
      /* wide screens circle the whole room; tall screens sway around its short end, where it fits */
      var th = state.portrait ? Math.PI / 2 + Math.sin(time * 0.13) * 0.62 : Math.PI + time * 0.06;
      outP.set(CX + Math.cos(th) * 18.4 * fit, (11.7 + Math.sin(time * 0.11) * 0.5) * fit, CZ + Math.sin(th) * 19.0 * fit);
      outT.set(CX, 0.5, CZ);
    }
    function stopPose(u, outP, outT) {                   // u in [1, N]; holds briefly on each stop
      var f = (u - 1), i = Math.floor(f), r = f - i;
      r = smooth((r - 0.14) / 0.72);
      var k = Math.min(1, (i + r) / (N - 1));
      curveP.getPoint(k, outP); curveT.getPoint(k, outT);
      if (state.portrait) outP.sub(outT).multiplyScalar(1.22).add(outT);   // step back a little on tall screens
    }
    function pose(u, time, outP, outT) {
      if (u <= 0) { overview(time, outP, outT); return; }
      if (u < 1) { overview(time, vA, vB); stopPose(1, vC, vD); var e = smooth(u); outP.lerpVectors(vA, vC, e); outT.lerpVectors(vB, vD, e); return; }
      if (u <= N) { stopPose(u, outP, outT); return; }
      stopPose(N, vA, vB); overview(time, vC, vD); var e2 = smooth(u - N); outP.lerpVectors(vA, vC, e2); outT.lerpVectors(vB, vD, e2);
    }
    function topDown() {                                 // the opening shot: straight down on the drawing
      var tanH = Math.tan(camera.fov * Math.PI / 360), a = state.w / state.h, hgt;
      if (!state.portrait) hgt = Math.max(L * 1.5 / (2 * tanH * a), W * 2.3 / (2 * tanH));
      else hgt = Math.max(L * 1.45 / (2 * tanH), W * 1.6 / (2 * tanH * a));
      topPos.set(CX, hgt, CZ);
      mLook.lookAt(topPos, vA.set(CX, 0, CZ), state.portrait ? vB.set(0, 0, -1) : vB.set(1, 0, 0));
      qTop.setFromRotationMatrix(mLook);
    }

    function resize() {
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      state.w = w; state.h = h; state.portrait = w / h < 0.9;
      var cap = Math.min(window.devicePixelRatio || 1, 2);
      var budget = Math.sqrt(3.4e6 / (w * h));           // keep the pixel count sane on 4K screens
      state.dpr = Math.max(0.75, Math.min(cap, budget) - state.slow * 0.25);
      renderer.setPixelRatio(state.dpr); renderer.setSize(w, h, false);
      camera.fov = state.portrait ? 50 : 36; camera.aspect = w / h; camera.updateProjectionMatrix();
      topDown();
      if (!state.running) frame(performance.now());
    }

    function frame(now) {
      var dt = Math.min(0.05, (now - (state.last || now)) / 1000); state.last = now;
      if (!opt.still) state.t += dt;

      /* intro timeline: drawing -> room rises from it -> camera tips into flight */
      if (!state.introDone) {
        if (planReady) state.intro += dt * state.introSpeed;
        var it = state.intro;
        uRise.value = smooth((it - 0.9) / 2.5) * 1.02;
        planMat.opacity = smooth(it / 0.5) * (1 - smooth((it - 1.5) / 1.9));
        floorMat.opacity = plinthMat.opacity = smooth((it - 0.9) / 1.2);
        under.material.opacity = smooth((it - 1.4) / 1.6) * (opt.dark ? 0.75 : 0.42);
        if (it > 1.35 && !state.risen) { state.risen = true; if (opt.onRise) opt.onRise(); }
        if (it >= 4.4) finishIntro();
      }
      var camBlend = state.introDone ? 1 : smooth((state.intro - 1.7) / 2.6);
      decals.forEach(function (d) { d.mat.opacity = smooth((uRise.value - d.delay - 0.16) / 0.12); });

      /* flight */
      state.u += (state.uTarget - state.u) * (1 - Math.exp(-dt * 4.2));
      state.shiftX += (state.shiftXT - state.shiftX) * (1 - Math.exp(-dt * 3));
      state.shiftY += (state.shiftYT - state.shiftY) * (1 - Math.exp(-dt * 3));
      state.pxS += (state.px - state.pxS) * (1 - Math.exp(-dt * 2.5));
      state.pyS += (state.py - state.pyS) * (1 - Math.exp(-dt * 2.5));
      pose(state.u, state.t, vP, vT);
      mLook.lookAt(vP, vT, UP); qLive.setFromRotationMatrix(mLook);
      camera.position.lerpVectors(topPos, vP, camBlend);
      camera.quaternion.copy(qTop).slerp(qLive, camBlend);
      if (camBlend >= 1) {                               // a little parallax from the pointer
        var far = state.u < 1 ? 0.5 : 0.16;
        camera.translateX(state.pxS * far); camera.translateY(-state.pyS * far * 0.6);
        camera.lookAt(vT);
      }
      camera.setViewOffset(state.w, state.h, -state.shiftX * state.w * camBlend, state.shiftY * state.h * camBlend, state.w, state.h);

      renderer.render(scene, camera);

      if (opt.onFrame) {
        camera.getWorldDirection(vA);
        opt.onFrame({ u: state.u, x: camera.position.x, z: camera.position.z, heading: Math.atan2(vA.x, -vA.z), intro: camBlend });
      }
      /* drop resolution a notch if the machine is struggling */
      if (state.introDone && dt > 0.034) { if (++state.frames > 45 && state.slow < 3) { state.slow++; state.frames = 0; resize(); } }
      else if (state.frames > 0) state.frames--;

      if (state.running && state.visible) state.raf = requestAnimationFrame(frame);
    }

    function finishIntro() {
      if (state.introDone) return;
      state.introDone = true; uRise.value = 2;
      if (!state.risen) { state.risen = true; if (opt.onRise) opt.onRise(); }
      planMat.opacity = 0; plan.visible = false;
      floorMat.opacity = plinthMat.opacity = 1; floorMat.transparent = plinthMat.transparent = false; floorMat.needsUpdate = plinthMat.needsUpdate = true;
      under.material.opacity = opt.dark ? 0.75 : 0.42;
      if (opt.onReady) opt.onReady();
    }

    var api = {
      stops: STOPS, count: N,
      resize: resize,
      start: function () { if (state.running) return; state.running = true; state.last = 0; state.raf = requestAnimationFrame(frame); },
      stop: function () { state.running = false; cancelAnimationFrame(state.raf); },
      setVisible: function (v) {
        if (v === state.visible) return; state.visible = v;
        if (v && state.running) { state.last = 0; cancelAnimationFrame(state.raf); state.raf = requestAnimationFrame(frame); }
      },
      setProgress: function (u) { state.uTarget = u; if (u > 0.05 && !state.introDone) state.introSpeed = 5; },
      jump: function (u) { state.uTarget = state.u = u; },
      setShift: function (x, y) { state.shiftXT = x; state.shiftYT = y; },
      setPointer: function (x, y) { state.px = x; state.py = y; },
      skipIntro: function () { state.intro = 10; finishIntro(); },
      setTheme: function (inkHex, dark) {
        ink.set(inkHex); planMat.color.copy(ink);
        opt.dark = dark; hemi.intensity = dark ? 0.39 : 0.42; if (state.introDone) under.material.opacity = dark ? 0.75 : 0.42;
        if (!state.running) frame(performance.now());
      },
      redrawArt: function () { decals.forEach(function (d) { var c = d.tex.image; var g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); ART[d.name](g, c.width, c.height); d.tex.needsUpdate = true; }); },
      renderOnce: function () { frame(performance.now()); },
      debug: { scene: scene, camera: camera, renderer: renderer, state: state, buildMs: buildMs }
    };
    resize();
    window.MakerRoom.instance = api;
    return api;
  }

  window.MakerRoom = { create: create, STOPS: STOPS, size: { w: W, l: L } };
})();
