const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
// Expose the internal simulator only inside the test VM, never in the plugin.
const source = client.replace("return { inject: ['slots'], apply };", 'return { Encounter, palette };');

function encounter(seed, w = 1600, h = 1000) {
  let state = seed;
  let api;
  let rafId = 0;
  const runtime = { now: 0, hidden: false, frames: new Map() };
  const math = Object.create(Math);
  math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  vm.runInNewContext(source, {
    Math: math,
    performance: { now: () => runtime.now },
    requestAnimationFrame: fn => { runtime.frames.set(++rafId, fn); return rafId; },
    cancelAnimationFrame: id => runtime.frames.delete(id),
    document: { get hidden() { return runtime.hidden; }, removeEventListener() {} },
    window: {
      matchMedia: () => ({ matches: false }),
      __ModuleLoader__: { load: ({ factory }) => { api = factory(() => ({})); } },
    },
  });
  const e = new api.Encounter();
  Object.assign(e, { w, h, baseL: Math.max(170, Math.min(w * 0.65, h * 0.6, 620)), phase: 'cruise' });
  e.seedOrca();
  e.palette = api.palette;
  e.runtime = runtime;
  return e;
}

function step(e, dt) {
  e.clock += dt;
  e.updateCruise(dt);
}

test('distributed client is built from the current template and mask', () => {
  const template = fs.readFileSync(path.join(root, 'client.template.js'), 'utf8');
  const mask = JSON.parse(fs.readFileSync(path.join(root, 'mask.json'), 'utf8'));
  assert.equal(client, template.replace('__MASK__', JSON.stringify(mask)));
});

test('long swims return from edges, stay finite and move along the body heading', () => {
  for (const [w, h] of [[1600, 1000], [1000, 700], [390, 844], [600, 400]]) {
    let sampled = 0, central = 0, partial = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const e = encounter(seed, w, h);
      let gliding = 0;
      let stroking = 0;
      let outsideFor = 0;
      for (let i = 0; i < 18000; i += 1) {
        const before = { ...e.orca };
        step(e, 1 / 30);
        const o = e.orca;
        assert.ok([o.x, o.y, o.heading, o.speed, e.bank, e.curvature].every(Number.isFinite));
        assert.ok(o.speed > 7 && o.speed < 26);
        assert.ok(Math.abs(o.speed - before.speed) < 6.5 / 30);
        // No sideways sliding or position clamp, even during a turn.
        const dx = o.x - before.x;
        const dy = o.y - before.y;
        assert.ok(Math.abs(dx * Math.sin(o.heading) - dy * Math.cos(o.heading)) < 1e-8);
        const outside = Math.max(-o.x, o.x - w, -o.y, o.y - h);
        assert.ok(outside < e.baseL * 0.23, `seed ${seed}, ${w}x${h}, outside ${outside}`);
        outsideFor = outside > 0 ? outsideFor + 1 / 30 : 0;
        assert.ok(outsideFor < 35);
        if (e.gait === 'glide') gliding++; else stroking++;
        if (i % 30 === 0) {
          sampled++;
          if (o.x > w * 0.2 && o.x < w * 0.8 && o.y > h * 0.2 && o.y < h * 0.8) central++;
          const points = [[0.98, 0], [0.04, 0.14], [0.04, -0.14], [0.65, 0.22], [0.65, -0.22]].map(([u, v]) => e.bodyPoint(u, v));
          if (points.some(p => p.x < 0 || p.x > w || p.y < 0 || p.y > h)) partial++;
        }
        assert.ok(e.trail.length <= 64 && e.tailRipples.length <= 16 && e.spray.length <= 24);
      }
      assert.ok(gliding > 600 && stroking > 600);
    }
    assert.ok(central / sampled > 0.65, `${w}x${h}: too little central swimming`);
    assert.ok(partial / sampled > 0.025, `${w}x${h}: never explores the edges`);
    assert.ok(partial / sampled < 0.16, `${w}x${h}: too much of the body outside the frame`);
  }
});

test('gliding removes thrust and tail motion while inertia decays', () => {
  const e = encounter(7);
  e.gait = 'glide';
  e.glideUntil = 100;
  e.target = {x: 1400, y: 500};
  e.targetAt = 100;
  e.cruiseSpeed = 8;
  e.strokeGain = 0;
  e.wave = Math.PI;
  const before = e.orca.speed;
  for (let i = 0; i < 60; i++) step(e, 1 / 60);
  assert.equal(e.wave, Math.PI);
  assert.equal(e.strokeGain, 0);
  assert.equal(e.thrust, 0);
  assert.equal(e.bodyPose(0.05).heave, 0);
  assert.ok(e.orca.speed < before && e.orca.speed > before * 0.85);
});

test('a shared body pose keeps the head stable and the deformation bounded at every scale', () => {
  const e = encounter(3);
  e.strokeGain = 1;
  for (const length of [170, 340, 620]) {
    e.baseL = length;
    for (const curvature of [-2.5, 0, 2.5]) {
      e.curvature = curvature;
      e.bank = curvature * 0.35;
      for (let phase = 0; phase < Math.PI * 2; phase += 0.2) {
        e.wave = phase;
        assert.equal(Math.abs(e.bodyPose(0.9).heave), 0);
        for (let u = 0; u <= 1; u += 0.05) {
          const p = e.bodyPose(u, 0.2);
          assert.ok(Math.abs(p.x) < 0.055 && Math.abs(p.y) < 0.09);
          assert.ok(p.width > 0.9 && p.width < 1.03);
        }
      }
    }
  }
});

test('body and wake emitters rotate together; shed wake stays in world space', () => {
  const e = encounter(1);
  e.strokeGain = 0.9;
  e.thrust = 2;
  e.orca.heading = 0;
  const a = e.bodyPoint(0.065, 0.115);
  e.orca.heading = Math.PI / 2;
  const b = e.bodyPoint(0.065, 0.115);
  const L = e.baseL * e.poseScale;
  const { plane, lift } = e.projectionFrame();
  assert.ok(Math.abs(b.x - e.orca.x + (a.y - e.orca.y + a.z * L * lift) / plane) < 1e-8);
  assert.ok(Math.abs(b.y - e.orca.y + b.z * L * lift - (a.x - e.orca.x) * plane) < 1e-8);
  e.spawnTailRipple();
  assert.equal(e.tailRipples.length, 2);
  assert.equal(e.tailRipples[1].x, b.x);
  assert.equal(e.tailRipples[1].y, b.y);
  const wake = JSON.stringify(e.tailRipples);
  e.orca.x += 100;
  e.orca.heading += 1;
  assert.equal(JSON.stringify(e.tailRipples), wake);
});

test('body sampling preserves nose and tail through a full stroke and both turns', () => {
  const e = encounter(2);
  e.orca.x = 800;
  e.orca.y = 500;
  e.orca.heading = e.headingVisual = 0;
  e.dark = true;
  e.strokeGain = 1;
  let glyphs;
  e.ctx = { save() {}, restore() {}, translate() {}, rotate() {}, fillText(ch, x, y) { glyphs.push({ x, y }); } };
  for (const bend of [-1.8, 0, 1.8]) {
    e.curvature = bend;
    e.bank = bend * 0.45;
    for (let phase = 0; phase < Math.PI * 2; phase += 0.5) {
      e.wave = phase;
      glyphs = [];
      e.drawOrca(0, e.palette(true), 1);
      assert.ok(glyphs.length > 500);
      assert.ok(glyphs.filter(p => p.x - e.orca.x > e.baseL * 0.32).length > 30);
      assert.ok(glyphs.filter(p => p.x - e.orca.x < -e.baseL * 0.35).length > 30);
      assert.ok(glyphs.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      assert.ok(glyphs.every(p => Math.abs(p.x / e.cw - Math.round(p.x / e.cw)) < 1e-8));
      assert.ok(glyphs.every(p => Math.abs(p.y / e.ch - Math.round(p.y / e.ch)) < 1e-8));
    }
  }
});

test('integration gives comparable results at 30 and 120 steps per second', () => {
  const a = encounter(9);
  const b = encounter(9);
  for (let i = 0; i < 60 * 30; i++) step(a, 1 / 30);
  for (let i = 0; i < 60 * 120; i++) step(b, 1 / 120);
  assert.ok(Math.hypot(a.orca.x - b.orca.x, a.orca.y - b.orca.y) < 8);
  assert.ok(Math.abs(a.orca.speed - b.orca.speed) < 0.35);
});


test('exploration reverses turn direction instead of settling into a one-way orbit', () => {
  for (const [w, h] of [[1600, 1000], [1000, 700], [390, 844], [600, 400]]) {
   for (let seed = 1; seed <= 12; seed++) {
    const e = encounter(seed, w, h);
    let left = 0, right = 0, run = 0, longest = 0, sign = 0;
    let slowest = Infinity, fastest = 0, shallowest = 1, deepest = 0;
    for (let i = 0; i < 18000; i++) {
      step(e, 1 / 30);
      const turn = e.turnRate / 30;
      if (turn > 0) right += turn; else left -= turn;
      if (Math.sign(turn) !== sign) { longest = Math.max(longest, run); run = 0; sign = Math.sign(turn); }
      run += Math.abs(turn);
      slowest = Math.min(slowest, e.orca.speed); fastest = Math.max(fastest, e.orca.speed);
      shallowest = Math.min(shallowest, e.depth); deepest = Math.max(deepest, e.depth);
    }
    assert.ok(Math.min(left, right) > 4, `seed ${seed} only turns ${left}/${right}`);
    assert.ok(Math.max(longest, run) < Math.PI * 2, `seed ${seed} makes an uninterrupted full circle`);
    assert.ok(fastest - slowest > 8);
    assert.ok(deepest - shallowest > 0.35);
   }
  }
});

function capture(e, draw) {
  const glyphs = new Map();
  e.ctx = { save() {}, restore() {}, fillText(ch, x, y) { glyphs.set(`${x},${y}`, `${ch}:${this.globalAlpha.toFixed(2)}`); } };
  draw();
  return glyphs;
}

function changed(a, b) {
  let n = 0;
  for (const [key, value] of a) if (b.get(key) !== value) n++;
  for (const key of b.keys()) if (!a.has(key)) n++;
  return n;
}

test('a stationary animal changes its glyphs and silhouette through strokes and rolls', () => {
  const e = encounter(4);
  e.orca.x = 800; e.orca.y = 500; e.orca.heading = 0;
  e.strokeGain = 1; e.dark = true; e.wave = 0;
  const draw = () => e.drawOrca(0, e.palette(true), 1);
  const initial = capture(e, draw);
  e.wave = Math.PI;
  const stroked = capture(e, draw);
  assert.ok(changed(initial, stroked) > initial.size * 0.18);
  e.bank = 1;
  const rolled = capture(e, draw);
  assert.ok(changed(stroked, rolled) > stroked.size * 0.3);
});

test('shed vortices change the ambient wave field without drawing the wake overlay', () => {
  const e = encounter(8);
  e.cols = Math.ceil(e.w / e.cw) + 1; e.rows = Math.ceil(e.h / e.ch) + 1;
  e.clock = 2; e.phase = 'idle';
  const draw = () => e.drawWater(0, e.palette(true), 1);
  const calm = capture(e, draw);
  e.tailRipples.push({x: 800, y: 500, t0: 0, vx: -2, vy: 0, rmax: 70, life: 7, strength: 1.2, side: 1});
  const disturbed = capture(e, draw);
  assert.ok(changed(calm, disturbed) > 50);
});

test('overhead camera keeps the dorsal silhouette broad at maximum bank', () => {
  const e = encounter(2);
  for (const bank of [-1, 1]) {
    e.bank = bank;
    e.rollDrift = bank * 0.045;
    e.pitch = 0.08;
    const frame = e.projectionFrame();
    assert.ok(frame.plane > 0.97);
    assert.ok(frame.cr > 0.97);
    assert.ok(frame.cp > 0.99);
  }
});

test('body pressure and vortices preserve the ambient water lattice without dark gaps', () => {
  const e = encounter(6);
  e.cols = Math.ceil(e.w / e.cw) + 1; e.rows = Math.ceil(e.h / e.ch) + 1;
  e.clock = 3;
  e.phase = 'idle';
  const draw = () => e.drawWater(0, e.palette(true), 1);
  const calm = capture(e, draw);
  e.phase = 'cruise'; e.bank = 1;
  e.tailRipples.push({x: 800, y: 500, t0: 1, vx: -2, vy: 0, rmax: 70, life: 7, strength: 1.2, side: 1});
  const swimming = capture(e, draw);
  for (const [position, value] of calm) {
    assert.ok(swimming.has(position), `water cell removed at ${position}`);
    assert.ok(Number(swimming.get(position).split(':')[1]) >= Number(value.split(':')[1]));
  }
  assert.ok(changed(calm, swimming) > 100);
});

test('dive continues the incoming pose and velocity, sinks nose first and clears its wake', () => {
  const e = encounter(4);
  for (let i = 0; i < 300; i++) step(e, 1 / 30);
  const initial = {...e.orca, depth:e.depth, pitch:e.pitch, scale:e.poseScale, gain:e.strokeGain, bank:e.bank};
  e.startDive(1000);
  e.updateDive(0, 1000);
  assert.equal(e.orca.x, initial.x);
  assert.equal(e.orca.y, initial.y);
  assert.equal(e.pitch, initial.pitch);
  assert.equal(e.poseScale, initial.scale);
  assert.equal(e.strokeGain, initial.gain);
  e.updateDive(0.001, 1001);
  assert.ok(Math.abs(Math.hypot(e.orca.x-initial.x, e.orca.y-initial.y) / 0.001 - initial.speed) < 0.02);
  for (let i = 1; i <= 54; i++) e.update(1 / 60, 1000 + i * 1000 / 60);
  assert.ok(e.bodyPoint(0.9).z < e.bodyPoint(0.6).z - 0.1);
  assert.ok(e.bodyPoint(0.9).z < e.bodyPoint(0.1).z);
  assert.ok(e.surfaceRipples.length >= 3);
  assert.ok(e.orca.speed < initial.speed && e.bank < Math.abs(initial.bank) + 0.001);
  for (let i = 55; i <= 240; i++) e.update(1 / 60, 1000 + i * 1000 / 60);
  assert.equal(e.phase, 'done');
  assert.equal(e.surfaceRipples.length, 0);
});


test('water continues moving without an animal and reuses the lattice until resize', () => {
  const e = encounter(8);
  e.cols = Math.ceil(e.w / e.cw) + 1; e.rows = Math.ceil(e.h / e.ch) + 1;
  e.phase = 'idle'; e.clock = 3;
  const draw = () => e.drawWater(0, e.palette(true), 1);
  const a = capture(e, draw);
  const cache = e.waterGrid;
  e.clock += 1.5;
  const b = capture(e, draw);
  assert.equal(e.waterGrid, cache);
  assert.ok(changed(a, b) > a.size * 0.3);
  e.w = 390; e.cols = Math.ceil(e.w / e.cw) + 1;
  capture(e, draw);
  assert.notEqual(e.waterGrid, cache);
  assert.equal(e.waterGrid.x.length, e.cols * e.rows);
});

test('reused projection buffers leave no old silhouette after a large move', () => {
  const e = encounter(4, 2000, 1000);
  e.dark = true; e.orca.heading = 0; e.orca.x = 450;
  capture(e, () => e.drawOrca(0, e.palette(true), 1));
  const buffer = e.glyphBuffer, columns = e.poseColumns;
  e.orca.x = 1500;
  const moved = capture(e, () => e.drawOrca(0, e.palette(true), 1));
  assert.equal(e.glyphBuffer, buffer);
  assert.equal(e.poseColumns, columns);
  assert.ok(moved.size > 500);
  assert.ok([...moved.keys()].every(p => Number(p.split(',')[0]) > 1100));
});

test('hidden animation cancels callbacks and resumes a pending dive without a time jump', () => {
  const e = encounter(1);
  e.host = {};
  e.runtime.now = 1000; e.runtime.hidden = true;
  e.visibilityChanged();
  assert.equal(e.raf, 0);
  e.startDive(1120);
  e.runtime.now = 11000; e.runtime.hidden = false;
  e.visibilityChanged();
  assert.equal(e.diveAt, 11000);
  assert.equal(e.enterAt, 10000);
  assert.equal(e.last, 11000);
  assert.equal(e.runtime.frames.size, 1);
  e.runtime.now = 12000; e.runtime.hidden = true;
  e.visibilityChanged();
  assert.equal(e.runtime.frames.size, 0);
  e.runtime.now = 16000; e.runtime.hidden = false;
  e.visibilityChanged();
  assert.equal(e.diveAt, 15000);
});

test('high refresh displays do not run extra simulation or rendering work', () => {
  const e = encounter(1);
  e.host = {}; e.ctx = {};
  let draws = 0, updates = 0, elapsed = 0;
  e.draw = () => { draws++; };
  e.update = dt => { updates++; elapsed += dt; assert.ok(dt <= 1 / 60 + 1e-9); };
  for (let i = 1; i <= 120; i++) e.loop(i * 1000 / 120);
  assert.equal(draws, 30);
  assert.ok(updates <= 90);
  assert.ok(Math.abs(elapsed - 1) < 1e-9);
});

test('water time interpolation remains accurate and avoids resampling unchanged times', () => {
  const e = encounter(8);
  e.cols = Math.ceil(e.w / e.cw) + 1; e.rows = Math.ceil(e.h / e.ch) + 1;
  const grid = e.prepareWater(), density = e.waterDensity;
  let samples = 0;
  e.waterDensity = (...args) => { samples++; return density.apply(e, args); };
  for (const time of [4, 4.033, 4.066, 4.099, 4.13, 4.17, 4.23, 20, 0]) {
    e.clock = time;
    e.updateWaterField(grid);
    for (let r = 0; r < grid.fr; r += 7) {
      for (let c = 0; c < grid.fc; c += 9) {
        const exact = density.call(e, c * e.cw * 2, r * e.ch * 2, time);
        assert.ok(Math.abs(grid.field[r * grid.fc + c] - exact) < 0.001);
      }
    }
    const before = samples;
    e.updateWaterField(grid);
    assert.equal(samples, before);
  }
  e.waterSeed += 12;
  e.updateWaterField(grid);
  assert.ok(Math.abs(grid.field[0] - density.call(e, 0, 0)) < 1e-6);
});

test('body projection storage is bounded by the animal instead of the viewport', () => {
  const e = encounter(3, 2400, 1400);
  e.orca.x = 1200; e.orca.y = 700;
  e.ctx = { save() {}, restore() {}, fillText() {} };
  const viewportCells = (Math.ceil(e.w / e.cw) + 1) * (Math.ceil(e.h / e.ch) + 1);
  for (const heading of [0, 0.7, Math.PI / 2, 2.4, Math.PI]) {
    e.orca.heading = heading;
    e.drawOrca(0, e.palette(true), 1);
    assert.ok(e.glyphBuffer.score.length < viewportCells * 0.4);
  }
});

test('ambient cache preserves 30 Hz foreground and invalidates on theme or dive', () => {
  const e = encounter(8, 1000, 700);
  e.cols = Math.ceil(e.w / e.cw) + 1; e.rows = Math.ceil(e.h / e.ch) + 1;
  e.clock = 3; e.enter = 1;
  let paints = 0, bodyFrames = 0;
  e.ctx = { setTransform() {}, save() {}, restore() {}, clearRect() {}, beginPath() {}, rect() {}, clip() {}, fillText() { paints++; } };
  e.drawOrca = () => { bodyFrames++; e.paintGlyph(e.ctx, '#', 500, 350); };
  e.drawWake = e.drawSpray = e.drawDiveRings = () => {};
  e.draw(0);
  const first = paints, at = e.waterGrid.paintClock;
  e.clock += 1 / 30;
  e.draw(0);
  assert.equal(e.waterGrid.paintClock, at);
  assert.equal(bodyFrames, 2);
  assert.ok(paints - first < first * 0.1);
  e.clock += 1 / 30;
  e.draw(0);
  assert.equal(e.waterGrid.paintClock, e.clock);
  e.dark = true;
  e.draw(0);
  assert.equal(e.waterGrid.paintTheme, true);
  e.enter = 0.8;
  e.draw(0);
  assert.equal(e.waterGrid.paintAlpha, 0.8);
  e.clock += 0.01; e.enter = 1;
  e.draw(0);
  assert.equal(e.waterGrid.paintAlpha, 1);
  assert.equal(e.waterGrid.paintClock, e.clock);
  e.clock += 1 / 30;
  e.startDive(1000);
  e.draw(1000);
  assert.equal(e.waterGrid.paintClock, e.clock);
});
