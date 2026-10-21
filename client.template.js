window.__ModuleLoader__.load({
  id: '@sherl98/dsh-orca-ocean',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Three quantised fields traced from the reference orca: anti-aliased
    // silhouette coverage, ink-density shading and the white flank patches.
    const DATA = __MASK__;
    const COLS = DATA.cols;
    const ROWS = DATA.rows;
    const VHALF = DATA.vhalf;
    const HEX = '0123456789abcdef';

    function decode(rows) {
      const out = new Uint8Array(COLS * ROWS);
      for (let r = 0; r < ROWS; r += 1) {
        const line = rows[r];
        for (let c = 0; c < COLS; c += 1) {
          out[r * COLS + c] = HEX.indexOf(line.charAt(c));
        }
      }
      return out;
    }

    const COV = decode(DATA.cov);
    const TONE = decode(DATA.tone);
    const PATCH = decode(DATA.patch);

    const MONO =
      'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
    const TWO_PI = Math.PI * 2;
    const GLYPHS = " .'`:;~-+=*xX%8#@";
    const PATCH_GLYPHS = '#%@8';
    const BUBBLE_GLYPHS = "o.'O";

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const smooth = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const easeIn = (t) => t * t;
    const easeOut = (t) => 1 - (1 - t) * (1 - t);

    function hash2(x, y) {
      let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }

    function wrapAngle(a) {
      while (a > Math.PI) a -= TWO_PI;
      while (a < -Math.PI) a += TWO_PI;
      return a;
    }

    function isDark() {
      const body = document.body;
      const root = document.documentElement;
      return Boolean(
        (body && body.hasAttribute('data-ds-dark-theme')) ||
          (root && root.hasAttribute('data-ds-dark-theme')),
      );
    }

    // Monochrome ink for the animal, muted slate water underneath. No fills.
    function palette(dark) {
      return dark
        ? {
            ink: '236, 243, 247',
            inkRgb: [236, 243, 247],
            patch: '#ffffff',
            patchRgb: [255, 255, 255],
            water: '152, 196, 216',
            waterRgb: [152, 196, 216],
            wake: '176, 214, 228',
            crest: '208, 234, 242',
          }
        : {
            ink: '10, 20, 26',
            inkRgb: [10, 20, 26],
            patch: '#ffffff',
            patchRgb: [255, 255, 255],
            water: '66, 100, 116',
            waterRgb: [56, 92, 108],
            wake: '40, 82, 100',
            crest: '22, 60, 78',
          };
    }

    function mixRgb(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ];
    }

    function rgbCss(c) {
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }

    function sampleField(field, u, v) {
      const fx = clamp(u, 0, 1) * (COLS - 1);
      const fy = clamp(v, 0, 1) * (ROWS - 1);
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = x0 < COLS - 1 ? x0 + 1 : x0;
      const y1 = y0 < ROWS - 1 ? y0 + 1 : y0;
      const tx = fx - x0;
      const ty = fy - y0;
      const a = field[y0 * COLS + x0];
      const b = field[y0 * COLS + x1];
      const c = field[y1 * COLS + x0];
      const d = field[y1 * COLS + x1];
      const top = a + (b - a) * tx;
      const bot = c + (d - c) * tx;
      return (top + (bot - top) * ty) / 15;
    }

    const CSS = `
.orca-live{position:relative;isolation:isolate}
.orca-ocean-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block}
.orca-live [data-composer-seat]{background:transparent!important}
.orca-live [data-composer-card]{
  background:color-mix(in srgb, var(--dsw-specific-input-major) 32%, transparent)!important;
  -webkit-backdrop-filter:blur(10px) saturate(1.06);
  backdrop-filter:blur(10px) saturate(1.06);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.10),inset 0 0 0 .5px rgba(255,255,255,.06),0 18px 48px -24px rgba(0,0,0,.42)!important;
  transition:background-color .35s ease,backdrop-filter .35s ease,-webkit-backdrop-filter .35s ease;
}
[data-ds-dark-theme] .orca-live [data-composer-card]{
  background:color-mix(in srgb, var(--dsw-specific-input-major) 46%, transparent)!important;
  -webkit-backdrop-filter:blur(12px) saturate(1.1);
  backdrop-filter:blur(12px) saturate(1.1);
}
`;

    class Encounter {
      constructor() {
        this.host = null;
        this.canvas = null;
        this.ctx = null;
        this.phase = 'idle';
        this.reduced = false;
        this.dark = false;
        this.w = 0;
        this.h = 0;
        this.dpr = 1;
        this.cw = 7;
        this.ch = 11;
        this.cols = 0;
        this.rows = 0;
        this.baseL = 520;
        this.font = '';
        this.clock = 0;
        this.enter = 0;
        this.enterAt = 0;
        this.seed = Math.random() * TWO_PI;
        this.wave = Math.random() * TWO_PI;
        this.orca = null;
        this.poseScale = 1;
        this.trail = [];
        this.bubbles = [];
        this.turnRate = 0;
        this.speedNorm = 0;
        this.prevCruiseHeading = null;
        this.spray = [];
        this.nextSpray = 0;
        this.headingVisual = 0;
        this.waterSeed = Math.random() * 1000;
        this.tailRipples = [];
        this.tailPulse = -1;
        this.diveAt = 0;
        this.diveX = 0;
        this.diveY = 0;
        this.diveHeading = 0;
        this.lastBubble = 0;
        this.diveTimer = 0;
        this.last = 0;
        this.lastDraw = 0;
        this.lastTrail = 0;
        this.raf = 0;
        this.resizeTimer = 0;
        this.themeObserver = null;
        this.resizeObserver = null;
        this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.boundLoop = (now) => this.loop(now);
        this.onWinResize = () => this.scheduleResize();
        this.onMotion = () => this.motionChanged();
      }

      show(host) {
        if (!host) return;
        if (this.host === host) {
          if (this.phase !== 'idle' && this.phase !== 'done') {
            if (this.diveTimer) {
              clearTimeout(this.diveTimer);
              this.diveTimer = 0;
            }
            return;
          }
          this.destroy();
        } else if (this.host) {
          this.destroy();
        }
        this.host = host;
        this.reduced = this.motionQuery.matches;
        this.dark = isDark();
        this.phase = 'enter';
        this.clock = 0;
        this.enter = 0;
        this.seed = Math.random() * TWO_PI;
        this.wave = Math.random() * TWO_PI;
        this.poseScale = 1;
        this.trail = [];
        this.bubbles = [];
        this.turnRate = 0;
        this.speedNorm = 0;
        this.prevCruiseHeading = null;
        this.spray = [];
        this.nextSpray = 0;
        this.headingVisual = 0;
        this.waterSeed = Math.random() * 1000;
        this.tailRipples = [];
        this.tailPulse = -1;
        this.lastBubble = 0;
        this.lastTrail = 0;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'orca-ocean-canvas';
        this.canvas.setAttribute('aria-hidden', 'true');
        this.ctx = this.canvas.getContext('2d');
        host.insertBefore(this.canvas, host.firstChild);
        host.classList.add('orca-live');
        this.observe();
        this.resize();
        this.seedOrca();
        this.enterAt = performance.now();
        this.last = performance.now();
        this.lastDraw = 0;
        if (!this.reduced) this.raf = requestAnimationFrame(this.boundLoop);
        else this.drawStatic();
      }

      hide(host) {
        if (this.host !== host) return;
        if (this.reduced) {
          this.destroy();
          return;
        }
        if (this.phase === 'enter' || this.phase === 'cruise') {
          // A session switch or a transient re-render unmounts the probe too.
          // Give the slot a moment to remount before committing to the dive.
          if (this.diveTimer) return;
          this.diveTimer = setTimeout(() => {
            this.diveTimer = 0;
            if (
              this.host === host &&
              (this.phase === 'enter' || this.phase === 'cruise')
            ) {
              this.startDive(performance.now());
            }
          }, 120);
        }
      }

      destroy() {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
        this.resizeTimer = 0;
        if (this.diveTimer) clearTimeout(this.diveTimer);
        this.diveTimer = 0;
        if (this.themeObserver) this.themeObserver.disconnect();
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.themeObserver = null;
        this.resizeObserver = null;
        window.removeEventListener('resize', this.onWinResize);
        if (this.motionQuery && this.motionQuery.removeEventListener) {
          this.motionQuery.removeEventListener('change', this.onMotion);
        }
        if (this.host) this.host.classList.remove('orca-live');
        if (this.canvas && this.canvas.parentNode) {
          this.canvas.parentNode.removeChild(this.canvas);
        }
        this.host = null;
        this.canvas = null;
        this.ctx = null;
        this.orca = null;
        this.trail = [];
        this.bubbles = [];
        this.turnRate = 0;
        this.spray = [];
        this.tailRipples = [];
        this.tailPulse = -1;
        this.phase = 'idle';
      }

      observe() {
        const host = this.host;
        if (!host) return;
        this.themeObserver = new MutationObserver(() => this.themeChanged());
        this.themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-ds-dark-theme', 'class'],
        });
        if (document.body) {
          this.themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-ds-dark-theme', 'class'],
          });
        }
        if (typeof ResizeObserver !== 'undefined') {
          this.resizeObserver = new ResizeObserver(() => this.scheduleResize());
          this.resizeObserver.observe(host);
        }
        window.addEventListener('resize', this.onWinResize);
        if (this.motionQuery && this.motionQuery.addEventListener) {
          this.motionQuery.addEventListener('change', this.onMotion);
        }
      }

      themeChanged() {
        const dark = isDark();
        if (dark === this.dark) return;
        this.dark = dark;
        if (this.reduced) this.drawStatic();
      }

      motionChanged() {
        this.reduced = this.motionQuery.matches;
        if (this.reduced) {
          if (this.raf) cancelAnimationFrame(this.raf);
          this.raf = 0;
          this.enter = 1;
          this.drawStatic();
        } else if (this.host && !this.raf) {
          this.last = performance.now();
          this.lastDraw = 0;
          this.raf = requestAnimationFrame(this.boundLoop);
        }
      }

      scheduleResize() {
        if (this.resizeTimer) return;
        this.resizeTimer = setTimeout(() => {
          this.resizeTimer = 0;
          if (!this.host) return;
          this.resize();
          this.lastDraw = 0;
          if (this.reduced) this.drawStatic();
        }, 120);
      }

      resize() {
        const host = this.host;
        if (!host || !this.canvas) return;
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (width < 40 || height < 40) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.w = width;
        this.h = height;
        this.dpr = dpr;
        this.canvas.width = Math.max(1, Math.round(width * dpr));
        this.canvas.height = Math.max(1, Math.round(height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.ch = clamp(height / 106, 7.0, 9.4);
        this.cw = this.ch * 0.63;
        this.cols = Math.ceil(width / this.cw) + 1;
        this.rows = Math.ceil(height / this.ch) + 1;
        this.baseL = clamp(Math.min(width * 0.47, height * 0.6), 340, 620);
        this.font = `500 ${Math.round(this.ch * 0.94)}px ${MONO}`;

        if (this.orca) {
          this.orca.x = clamp(this.orca.x, 0, width);
          this.orca.y = clamp(this.orca.y, 0, height);
        }
        if (this.phase === 'dive' || this.phase === 'after') {
          this.diveX = clamp(this.diveX, 0, width);
          this.diveY = clamp(this.diveY, 0, height);
        }
      }

      seedOrca() {
        this.poseScale = 0.97;
        const L = this.baseL * this.poseScale;
        const inset = Math.min(this.w * 0.5, L * 0.08);
        const x = clamp(
          this.w * 0.5 + (Math.random() - 0.5) * this.w * 0.3,
          inset,
          this.w - inset,
        );
        const y = clamp(
          this.h * 0.48 + (Math.random() - 0.5) * this.h * 0.28,
          inset,
          this.h - inset,
        );
        const heading = Math.random() * TWO_PI;
        const speed = 20 + Math.random() * 4;
        this.orca = { x, y, heading, speed };
        this.turnRate = 0;
        this.speedNorm = speed / 26;
        this.prevCruiseHeading = heading;
        this.target = null;
        this.targetAt = 0;
        this.wanderPhase = Math.random() * TWO_PI;
        this.spray = [];
        this.nextSpray = 0;
        this.headingVisual = heading;
        this.wave = Math.random() * TWO_PI;
        this.tailPulse = Math.floor(this.wave / Math.PI);
      }

      pickTarget() {
        const o = this.orca;
        if (!o) return;
        const L = this.baseL * this.poseScale;
        const wide = Math.random() < 0.15;
        const spread = wide ? Math.PI : 1.75;
        let tx = o.x;
        let ty = o.y;
        for (let tries = 0; tries < 12; tries += 1) {
          const angle = o.heading + (Math.random() * 2 - 1) * spread;
          const dist = L * (0.9 + Math.random() * 1.6);
          tx = clamp(o.x + Math.cos(angle) * dist, 8, this.w - 8);
          ty = clamp(o.y + Math.sin(angle) * dist, 8, this.h - 8);
          if (Math.hypot(tx - o.x, ty - o.y) > L * 0.75) break;
        }
        // When close to an edge, prefer an inner target so the animal turns
        // back before it has to be hard-clamped.
        const edgeX = Math.max(L * 0.42, this.w * 0.12);
        const edgeY = Math.max(L * 0.42, this.h * 0.14);
        if (
          o.x < edgeX ||
          o.x > this.w - edgeX ||
          o.y < edgeY ||
          o.y > this.h - edgeY
        ) {
          tx = tx * 0.45 + this.w * 0.5 * 0.55;
          ty = ty * 0.45 + this.h * 0.5 * 0.55;
        }
        this.target = {
          x: clamp(tx, 8, this.w - 8),
          y: clamp(ty, 8, this.h - 8),
        };
        this.targetAt = this.clock + 11 + Math.random() * 7;
      }

      spawnTailRipple(x, y, heading) {
        const t = performance.now();
        const k =
          1 +
          0.5 * (this.speedNorm || 0) +
          0.8 *
            clamp(Math.abs(this.turnRate || 0) / 0.1, 0, 1.2);
        this.tailRipples.push({
          x,
          y,
          heading,
          t0: t,
          rmax: (14 + Math.random() * 16) * k,
          life: 0.9 + Math.random() * 0.6,
          seed: Math.random() * 1000,
          strength: k,
        });
        if (this.tailRipples.length > 9) this.tailRipples.shift();
      }

      updateCruise(dt) {
        const o = this.orca;
        if (!o) return;
        const L = this.baseL * this.poseScale;
        if (!this.target || this.clock > this.targetAt) this.pickTarget();
        let dx = this.target.x - o.x;
        let dy = this.target.y - o.y;
        if (Math.hypot(dx, dy) < L * 0.28) {
          this.pickTarget();
          dx = this.target.x - o.x;
          dy = this.target.y - o.y;
        }
        const desired = Math.atan2(dy, dx);
        let diff = wrapAngle(desired - o.heading);
        diff +=
          Math.sin(this.clock * 0.55 + this.wanderPhase) * 0.1 +
          Math.sin(this.clock * 0.21 + 2.1) * 0.05;
        // Softly turn back before reaching the hard screen edge.
        const edgePad = Math.max(L * 0.22, 70);
        if (
          o.x < edgePad ||
          o.x > this.w - edgePad ||
          o.y < edgePad ||
          o.y > this.h - edgePad
        ) {
          const inward = Math.atan2(this.h * 0.5 - o.y, this.w * 0.5 - o.x);
          diff += wrapAngle(inward - o.heading) * 0.6;
        }
        const maxTurn = 0.1;
        o.heading = wrapAngle(
          o.heading + clamp(diff, -maxTurn * dt, maxTurn * dt),
        );

        const prevHeading =
          this.prevCruiseHeading == null
            ? o.heading
            : this.prevCruiseHeading;
        const rawTurn =
          wrapAngle(o.heading - prevHeading) / Math.max(dt, 0.0001);
        this.prevCruiseHeading = o.heading;
        this.turnRate += (rawTurn - this.turnRate) * Math.min(1, dt * 2.5);
        this.speedNorm = clamp(o.speed / 26, 0, 1.6);

        const targetSpeed =
          20 +
          4 * Math.sin(this.clock * 0.07 + this.wanderPhase) +
          2.5 * Math.sin(this.clock * 0.019 + 1.3);
        o.speed += (targetSpeed - o.speed) * Math.min(1, dt * 0.25);
        o.x += Math.cos(o.heading) * o.speed * dt;
        o.y += Math.sin(o.heading) * o.speed * dt;

        o.x = clamp(o.x, 0, this.w);
        o.y = clamp(o.y, 0, this.h);

        const turnNorm = clamp(Math.abs(this.turnRate) / 0.1, 0, 1.4);
        if (
          (turnNorm > 0.35 || this.speedNorm > 1.15) &&
          this.clock > this.nextSpray
        ) {
          this.nextSpray = this.clock + 0.16 + Math.random() * 0.24;
          const hd = this.headingVisual;
          const c = Math.cos(hd);
          const s = Math.sin(hd);
          const nx = -s;
          const ny = c;
          const side = this.turnRate >= 0 ? -1 : 1;
          const strength = 0.5 + turnNorm * 0.7 + this.speedNorm * 0.3;
          for (let i = 0; i < 2; i += 1) {
            const along = -L * (0.18 + Math.random() * 0.26);
            const off = L * (0.06 + Math.random() * 0.07) * side;
            this.spray.push({
              x: o.x + c * along + nx * off,
              y: o.y + s * along + ny * off,
              vx:
                nx * side * (14 + Math.random() * 26) -
                c * (6 + Math.random() * 10),
              vy:
                ny * side * (14 + Math.random() * 26) -
                s * (6 + Math.random() * 10),
              t0: this.clock,
              life: 0.55 + Math.random() * 0.5,
              ch: Math.random() < 0.5 ? '~' : '.',
              strength,
            });
          }
        }
        if (this.spray.length > 24) {
          this.spray.splice(0, this.spray.length - 24);
        }
        if (this.spray.length) {
          this.spray = this.spray.filter(
            (sp) => this.clock - sp.t0 < sp.life,
          );
        }

        const lag = wrapAngle(o.heading - this.headingVisual);
        this.headingVisual += lag * Math.min(1, dt * 0.95);

        const depth =
          0.98 + 0.025 * Math.sin(this.clock * 0.05 + this.seed * 0.6);
        this.poseScale += (depth - this.poseScale) * Math.min(1, dt * 0.35);

        this.wave += dt * (1.15 + o.speed / 42);
        const bucket = Math.floor(this.wave / Math.PI);
        if (bucket !== this.tailPulse) {
          this.tailPulse = bucket;
          const tailL = this.baseL * this.poseScale;
          this.spawnTailRipple(
            o.x - Math.cos(this.headingVisual) * tailL * 0.45,
            o.y - Math.sin(this.headingVisual) * tailL * 0.45,
            this.headingVisual,
          );
        }
        if (this.tailRipples.length) {
          const now = performance.now();
          this.tailRipples = this.tailRipples.filter(
            (r) => now - r.t0 < r.life * 1000,
          );
        }
      }

      startDive(now) {
        this.phase = 'dive';
        this.diveAt = now;
        this.diveX = this.orca.x;
        this.diveY = this.orca.y;
        this.diveHeading = this.headingVisual;
        this.diveProgress = 0;
        this.diveCover = 0;
      }

      spawnBubble(x, y, t0, alpha) {
        this.bubbles.push({
          x,
          y,
          t0,
          vy: 12 + Math.random() * 26,
          drift: 1.4 + Math.random() * 4,
          phase: Math.random() * TWO_PI,
          life: 1.1 + Math.random() * 1.5,
          size: Math.random(),
          a: alpha,
        });
        if (this.bubbles.length > 46) this.bubbles.shift();
      }

      loop(now) {
        this.raf = requestAnimationFrame(this.boundLoop);
        if (!this.host || !this.ctx) return;
        if (now - this.lastDraw < 38) return;
        const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
        this.last = now;
        this.lastDraw = now;
        this.update(dt, now);
        this.draw(now);
        if (this.phase === 'done') this.destroy();
      }

      update(dt, now) {
        if (!this.orca || this.w < 10) return;
        this.clock += dt;
        const since = now - this.enterAt;
        this.enter = smooth(0, 1, since / 680);
        if (this.phase === 'enter' && since > 680) this.phase = 'cruise';

        if (this.phase === 'enter' || this.phase === 'cruise') {
          this.updateCruise(dt);
          if (now - this.lastTrail > 120) {
            this.lastTrail = now;
            this.trail.push({
              x: this.orca.x,
              y: this.orca.y,
              h: this.headingVisual,
              L: this.baseL * this.poseScale,
              t: now,
            });
            if (this.trail.length > 42) this.trail.shift();
          }
          while (this.trail.length && now - this.trail[0].t > 3000) this.trail.shift();
          if (now > this.lastBubble && since > 700) {
            this.lastBubble = now + 700 + Math.random() * 1200;
            const headX = this.orca.x + Math.cos(this.headingVisual) * this.baseL * 0.34;
            const headY = this.orca.y + Math.sin(this.headingVisual) * this.baseL * 0.34;
            this.spawnBubble(headX, headY, now, 0.34);
          }
        }

        if (this.phase === 'dive') {
          this.wave += dt * (1.6 + 2.2 * this.diveCover);
          this.diveProgress = clamp((now - this.diveAt) / 3000, 0, 1);
          this.diveCover = smooth(0.03, 1, this.diveProgress);
          if (this.diveProgress >= 1) {
            this.phase = 'after';
            this.diveCover = 1;
          }
        } else if (this.phase === 'after') {
          this.diveProgress = 1;
          this.diveCover = 1;
        } else {
          this.diveProgress = 0;
          this.diveCover = 0;
        }

        if (this.phase === 'after' && now - this.diveAt > 3450) {
          this.phase = 'done';
        }

        if (this.bubbles.length) {
          this.bubbles = this.bubbles.filter((b) => now - b.t0 < b.life * 1000);
        }

      }

      sceneAlpha(now) {
        if (this.phase === 'after' || this.phase === 'dive') {
          const since = (now - this.diveAt) / 1000;
          return 1 - smooth(2.65, 3.4, since);
        }
        return 1;
      }

      draw(now) {
        const ctx = this.ctx;
        if (!ctx || this.w < 10) return;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        const pal = palette(this.dark);
        const fade = this.sceneAlpha(now);
        const enter = this.enter;
        const alpha = enter * fade;
        this.drawWater(now, pal, alpha);
        this.drawWake(now, pal, alpha);
        if (this.phase !== 'after') this.drawOrca(now, pal, alpha);
        this.drawSpray(now, pal, alpha);

        // The surface water sweeps in front of the animal as it goes under.
        const cover =
          this.phase === 'dive'
            ? this.diveCover
            : this.phase === 'after'
              ? 1
              : 0;
        if (cover > 0.004) {
          this.drawWater(now, pal, alpha * cover * 0.45);
        }
        this.drawDiveRings(now, pal, alpha);
        this.drawBubbles(now, pal, alpha);
        ctx.globalAlpha = 1;
      }

      drawStatic() {
        if (!this.ctx || this.w < 10) return;
        this.enter = 1;
        this.clock = 2.2;
        if (!this.orca) this.seedOrca();
        this.poseScale = 0.96;
        this.wave = 1.2;
        this.draw(performance.now());
      }

      drawWater(now, pal, alpha) {
        if (alpha <= 0.01) return;
        const ctx = this.ctx;
        const t = this.clock;
        const seed = this.waterSeed;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // The water grain is deliberately finer than the animal.
        ctx.font = `500 ${Math.max(4, Math.round(this.ch * 0.78))}px ${MONO}`;
        ctx.fillStyle = `rgb(${pal.water})`;

        const driftX = t * 4;
        const driftY = t * 2;
        const dCover =
          this.phase === 'dive'
            ? this.diveCover
            : this.phase === 'after'
              ? 1
              : 0;

        // Long, thin, warped level-set ribbons. Dense characters inside the
        // ribbon, feathered at its edge: reads as moving water rather than
        // isolated specks or large blocks.
        const field = (px, py) => {
          const wx =
            px +
            driftX +
            36 * Math.sin(py * 0.007 + t * 0.11 + seed * 0.3) +
            14 * Math.sin(py * 0.021 - t * 0.17);
          const wy =
            py +
            driftY +
            32 * Math.cos(px * 0.006 - t * 0.09) +
            12 * Math.cos(px * 0.018 + t * 0.15);
          const a = wx * 0.0075 + wy * 0.0035;
          const b = wx * 0.0025 - wy * 0.0095;
          return (
            Math.sin(a + t * 0.16 + seed) * 0.62 +
            Math.sin(b - t * 0.13 + 1.7) * 0.52 +
            Math.sin((wx + wy) * 0.006 + t * 0.1 + 4.0) * 0.3 +
            Math.sin((wx - wy) * 0.016 - t * 0.2 + 2.2) * 0.14
          );
        };
        const densityAt = (px, py) => {
          const wx =
            px +
            driftX +
            40 * Math.sin(py * 0.006 + t * 0.08 + seed * 0.2) +
            16 * Math.sin(py * 0.018 - t * 0.12);
          const wy =
            py +
            driftY +
            34 * Math.cos(px * 0.005 - t * 0.07) +
            14 * Math.cos(px * 0.016 + t * 0.1);
          const flowA = 0.45 + 0.18 * Math.sin(seed + t * 0.025);
          const ca = Math.cos(flowA);
          const sa = Math.sin(flowA);
          const u = wx * ca + wy * sa;
          const v = -wx * sa + wy * ca;
          const n =
            Math.sin(u * 0.01 + t * 0.14) * 0.9 +
            Math.sin(v * 0.016 - t * 0.11 + 1.6) * 0.6 +
            Math.sin((u + v) * 0.005 + t * 0.08 + 4.0) * 0.4 +
            Math.sin((u - v) * 0.021 - t * 0.16 + 2.2) * 0.18;
          const ridge = 1 - Math.min(1, Math.abs(n) / 1.75);
          const mask =
            0.55 +
            0.45 *
              Math.sin(wx * 0.0032 - wy * 0.0021 + t * 0.04 + 1.3);
          return smooth(0.5, 0.97, ridge) * mask;
        };

        for (let r = 1; r < this.rows; r += 1) {
          for (let c = 1; c < this.cols; c += 1) {
            const hh = hash2(c + 13, r + 29);
            let x =
              c * this.cw + (hash2(c + 2, r + 7) - 0.5) * this.cw * 0.9;
            let y =
              r * this.ch + (hash2(c + 9, r + 3) - 0.5) * this.ch * 0.9;
            let waveBoost = 0;
            let suppress = 1;

            if (dCover > 0) {
              const Ld = this.baseL * this.poseScale;
              const cyd = this.diveY + Ld * 0.24 * dCover;
              const ddx = x - this.diveX;
              const ddy = y - cyd;
              const dist = Math.hypot(ddx, ddy) || 1;
              const ringR = Ld * (0.2 + 0.45 * dCover);
              const env = Math.exp(
                -Math.pow((dist - ringR) / (Ld * 0.13), 2),
              );
              const env2 = Math.exp(
                -Math.pow((dist - ringR * 1.55) / (Ld * 0.16), 2),
              );
              const inner = Math.exp(-Math.pow(dist / (Ld * 0.2), 2));
              const amp =
                Math.sin(dist * 0.045 - this.clock * 5.2 + this.waterSeed) *
                20 *
                env *
                dCover;
              x += (ddx / dist) * amp;
              y += (ddy / dist) * amp;
              waveBoost =
                env * 1.25 * dCover +
                env2 * 0.5 * dCover -
                inner * 0.55 * dCover;
            } else if (
              this.phase === 'enter' ||
              this.phase === 'cruise'
            ) {
              const o = this.orca;
              if (o) {
                const Ld = this.baseL * this.poseScale;
                const hd = this.headingVisual;
                const cA = Math.cos(hd);
                const sA = Math.sin(hd);
                const ddx = x - o.x;
                const ddy = y - o.y;
                const along = ddx * cA + ddy * sA;
                const across = -ddx * sA + ddy * cA;
                const q = Math.sqrt(
                  Math.pow(along / (Ld * 0.62), 2) +
                    Math.pow(across / (Ld * 0.24), 2),
                );
                if (q < 2.4) {
                  const env = Math.exp(-Math.pow((q - 0.9) / 0.6, 2));
                  const speedN = this.speedNorm || 0;
                  const turnN = clamp(
                    Math.abs(this.turnRate || 0) / 0.1,
                    0,
                    1.5,
                  );
                  const amp = (4 + 10 * speedN + 10 * turnN) * env;
                  const dist = Math.hypot(ddx, ddy) || 1;
                  x += (ddx / dist) * amp;
                  y += (ddy / dist) * amp;
                  waveBoost =
                    env * (0.5 + 0.6 * speedN + 0.9 * turnN) +
                    (along < 0 ? env * 0.3 * speedN : 0);
                  if (turnN > 0.4) {
                    const sideSign = (this.turnRate || 0) >= 0 ? 1 : -1;
                    if (across * sideSign > 0) waveBoost *= 1.5;
                  }
                }
                // Calm water around the swimming animal so its silhouette
                // does not compete with the surface texture.
                const qb = Math.sqrt(
                  Math.pow(along / (Ld * 0.62), 2) +
                    Math.pow(across / (Ld * 0.28), 2),
                );
                suppress = 0.35 + 0.65 * smooth(0.8, 1.6, qb);
              }
            }

            let d = densityAt(x, y);
            if (d < 0.06) continue;
            if (hh > 0.18 + d * 0.82 * suppress) continue;
            d *= suppress;
            const qq = clamp(d, 0, 1);
            const glyph =
              qq > 0.66
                ? hh < 0.55
                  ? '~'
                  : '='
                : qq > 0.42
                  ? hh < 0.6
                    ? '-'
                    : '~'
                  : hh < 0.7
                    ? '.'
                    : "'";
            const a =
              (0.035 + qq * 0.31) *
              alpha *
              (this.dark ? 1 : 0.75) *
              (1 + waveBoost) *
              (0.7 + hh * 0.45);
            if (a < 0.012) continue;
            ctx.globalAlpha = a;
            ctx.fillText(glyph, x, y);
          }
        }
        ctx.restore();
      }

      drawWake(now, pal, alpha) {
        const trail = this.trail;
        if (!trail.length || alpha <= 0.01) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = `rgb(${pal.wake})`;
        const speedN = this.speedNorm || 0;
        const turnN = clamp(Math.abs(this.turnRate || 0) / 0.1, 0, 1.4);
        for (let i = 0; i < trail.length; i += 2) {
          const p = trail[i];
          const age = (now - p.t) / 1000;
          if (age < 0.14 || age > 2.5) continue;
          const f = 1 - age / 2.5;
          const a =
            Math.pow(f, 1.85) *
            (0.55 + 0.2 * speedN + 0.25 * turnN) *
            alpha;
          if (a < 0.015) continue;
          const dx = Math.cos(p.h);
          const dy = Math.sin(p.h);
          const nx = -dy;
          const ny = dx;
          const tailX = p.x - dx * p.L * 0.46;
          const tailY = p.y - dy * p.L * 0.46;
          const spread = p.L * 0.04 + age * (30 + 30 * turnN);
          for (let side = -1; side <= 1; side += 2) {
            const hh = hash2((p.t / 90) | 0, side > 0 ? 7 : 19);
            const gx = tailX + nx * spread * side;
            const gy = tailY + ny * spread * side;
            ctx.globalAlpha = a * (0.55 + hh * 0.55);
            ctx.fillText(
              hh < 0.36 ? '~' : hh < 0.72 ? '-' : '.',
              gx,
              gy,
            );
            if (age < 1.15) {
              ctx.globalAlpha = a * 0.42;
              ctx.fillText(
                '.',
                gx - nx * this.cw * 1.6 * side,
                gy - ny * this.cw * 1.6 * side,
              );
            }
          }
          if (age < 0.8) {
            ctx.globalAlpha = a * 0.65;
            ctx.fillText('~', tailX, tailY);
          }
        }

        if (this.phase === 'cruise' || this.phase === 'enter') {
          const o = this.orca;
          const L = this.baseL * this.poseScale;
          const hd = this.headingVisual || o.heading;
          const dx = Math.cos(hd);
          const dy = Math.sin(hd);
          const nx = -dy;
          const ny = dx;

          const bx = o.x + dx * L * 0.47;
          const by = o.y + dy * L * 0.47;
          ctx.fillStyle = `rgb(${pal.water})`;
          for (let k = -3; k <= 3; k += 1) {
            const off = k * this.cw * 1.25;
            const ahead = Math.abs(k) * this.cw * 0.55;
            ctx.globalAlpha =
              (0.2 + 0.1 * speedN + 0.08 * turnN - Math.abs(k) * 0.025) *
              alpha;
            ctx.fillText(
              k === 0 ? '~' : '.',
              bx + nx * off + dx * ahead,
              by + ny * off + dy * ahead,
            );
          }

          for (let side = -1; side <= 1; side += 2) {
            for (let k = 0; k < 5; k += 1) {
              const u = 0.28 + k * 0.13;
              const along = (u - 0.5) * L;
              const off =
                (0.105 + 0.012 * Math.sin(this.clock * 0.9 + k)) *
                L *
                side;
              const px = o.x + dx * along + nx * off;
              const py = o.y + dy * along + ny * off;
              ctx.globalAlpha =
                (0.12 +
                  0.08 * speedN +
                  0.12 * turnN +
                  0.04 * Math.sin(this.clock * 1.4 + k + side)) *
                alpha;
              ctx.fillText(k % 2 ? '~' : '.', px, py);
            }
          }

          ctx.fillStyle = `rgb(${pal.wake})`;
          for (let i = 0; i < this.tailRipples.length; i += 1) {
            const r = this.tailRipples[i];
            const age = (now - r.t0) / 1000;
            if (age < 0 || age > r.life) continue;
            const p = age / r.life;
            const radius = 3 + r.rmax * (1 - Math.pow(1 - p, 1.8));
            const a =
              Math.pow(1 - p, 1.5) *
              0.32 *
              Math.min(1.8, r.strength || 1) *
              alpha;
            if (a < 0.012) continue;
            for (let j = 0; j < 10; j += 1) {
              const th = (j / 10) * TWO_PI + r.seed;
              const hh = hash2((r.seed * 7) | 0, j);
              const px = r.x + Math.cos(th) * radius;
              const py = r.y + Math.sin(th) * radius * 0.62;
              ctx.globalAlpha = a * (0.5 + hh * 0.6);
              ctx.fillText(
                hh < 0.55 ? '~' : hh < 0.82 ? '.' : '-',
                px,
                py,
              );
            }
          }
        }
        ctx.restore();
      }

      drawOrca(now, pal, alpha) {
        if (!this.orca || alpha <= 0.01) return;
        let cx = this.orca.x;
        let cy = this.orca.y;
        let heading = this.headingVisual || this.orca.heading;
        let scale = this.poseScale;
        let bodyAlpha = alpha;
        let cover = 0;
        if (this.phase === 'dive' || this.phase === 'after') {
          cx = this.diveX;
          cy = this.diveY;
          heading = this.diveHeading;
          cover = this.phase === 'after' ? 1 : this.diveCover;
        }
        const L = this.baseL * scale;
        if (cover > 0) cy += L * 0.24 * cover;
        if (L < 60 || bodyAlpha <= 0.015) return;
        const depth = clamp((scale - 0.9) / 0.16, 0, 1);
        bodyAlpha *=
          (0.84 + 0.16 * depth) * (1 - 0.87 * cover) * (this.dark ? 1 : 1.42);
        const ink = rgbCss(mixRgb(pal.inkRgb, pal.waterRgb, cover * 0.55));
        const patchInk = rgbCss(
          mixRgb(pal.patchRgb, pal.waterRgb, cover * 0.5),
        );
        const ctx = this.ctx;
        const cos = Math.cos(heading);
        const sin = Math.sin(heading);
        const nCols = Math.max(16, Math.ceil(L / this.cw));
        const nRows = Math.max(10, Math.ceil((2 * VHALF * L) / this.ch));
        const phase = this.wave;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(heading);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = ink;
        for (let r = 0; r < nRows; r += 1) {
          const v = ((r + 0.5) / nRows - 0.5) * 2 * VHALF;
          const ly = v * L;
          for (let c = 0; c < nCols; c += 1) {
            // Mask columns run tail (0) -> head (1). Local +x is forward, so
            // the head must sit at +L/2 and the fluke at -L/2.
            const u = (c + 0.5) / nCols;
            const lx = (u - 0.5) * L;
            let px = lx;
            let py = ly;
            if (cover > 0) {
              // A small sink and a gentle head-down arch: the body stays the
              // same size, but it visibly works its way under the surface.
              const bend =
                (u - 0.5) * 0.12 * L * cover +
                Math.sin(u * 9 + this.wave * 1.4) * 0.006 * L * cover;
              px = lx + Math.sin(heading) * bend;
              py = ly + Math.cos(heading) * bend;
              if (hash2(c * 3 + 7, r * 5 + 11) < cover * 0.05) continue;
            }
            const tailness = 1 - u;
            const alive =
              1 +
              cover * 1.35 +
              Math.min(1.2, Math.abs(this.turnRate || 0) / 0.1) * 0.35;
            const sway =
              (Math.sin(phase - tailness * 5.1) * 0.028 +
                Math.sin(phase * 0.5 - tailness * 2.7) * 0.009) *
              alive *
              (0.2 + 0.8 * tailness * tailness);
            // The dorsal fin and the pectoral flipper flex a little on their
            // own, slower than the tail, so the animal never looks rigid.
            const finSpan =
              smooth(0.54, 0.61, u) * (1 - smooth(0.73, 0.79, u));
            let finOffset = 0;
            if (finSpan > 0.001) {
              const dorsalW = finSpan * smooth(-0.09, -0.21, v);
              if (dorsalW > 0.001) {
                const flapD = Math.sin(phase * 0.62 + 1.2);
                finOffset += flapD * 0.007 * dorsalW * alive;
              }
              const flipW = finSpan * smooth(0.09, 0.22, v);
              if (flipW > 0.001) {
                const flapF = Math.sin(phase * 0.62 + 2.6);
                const root = 0.085;
                const rel = v + sway - root;
                finOffset +=
                  (rel * (0.08 * flapF * flipW) + flapF * 0.012 * flipW) *
                  alive;
              }
            }
            const vm = clamp(
              (v + sway + finOffset + VHALF) / (2 * VHALF),
              0,
              1,
            );
            const cov = sampleField(COV, u, vm);
            if (cov < 0.21) continue;
            const sx = cx + px * cos - py * sin;
            const sy = cy + px * sin + py * cos;
            if (sx < -20 || sx > this.w + 20 || sy < -20 || sy > this.h + 20) continue;
            const t = sampleField(TONE, u, vm);
            const key = hash2((u * 160) | 0, (vm * 88) | 0);
            if (t > 0.55) {
              const pw = sampleField(PATCH, u, vm);
              if (pw > 0.44) {
                if (this.dark) {
                  ctx.globalAlpha =
                    clamp(0.5 + pw * 0.5, 0, 1) * bodyAlpha;
                  ctx.fillStyle = patchInk;
                  ctx.fillText(PATCH_GLYPHS[(key * 4) | 0], px, py);
                  ctx.fillStyle = ink;
                }
                continue;
              }
            }
            let a = 0.24 + t * 0.72;
            if (cov < 0.72) a *= 0.4 + cov * 0.6;
            a *= bodyAlpha;
            if (a < 0.02) continue;
            const jitter = key < 0.18 ? -1 : key > 0.86 ? 1 : 0;
            const idx = clamp(Math.round(1 + t * 15) + jitter, 1, GLYPHS.length - 1);
            ctx.globalAlpha = a;
            ctx.fillText(GLYPHS.charAt(idx), px, py);
            if (t > 0.5 && cov > 0.58 && key > 0.45) {
              ctx.globalAlpha = a * 0.38;
              ctx.fillText(
                '.',
                px + this.cw * 0.46,
                py + this.ch * 0.32,
              );
            }
          }
        }
        ctx.restore();
      }

      drawSpray(now, pal, alpha) {
        if (!this.spray.length || alpha <= 0.01) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = `rgb(${pal.water})`;
        for (let i = 0; i < this.spray.length; i += 1) {
          const sp = this.spray[i];
          const age = this.clock - sp.t0;
          if (age < 0 || age > sp.life) continue;
          const x = sp.x + sp.vx * age;
          const y = sp.y + sp.vy * age + 20 * age * age;
          const a =
            Math.pow(1 - age / sp.life, 1.4) *
            0.5 *
            Math.min(1.8, sp.strength || 1) *
            alpha;
          if (a < 0.012) continue;
          ctx.globalAlpha = a;
          ctx.fillText(sp.ch, x, y);
        }
        ctx.restore();
      }

      drawDiveRings(now, pal, alpha) {
        if (this.phase !== 'dive' && this.phase !== 'after') return;
        if (alpha <= 0.01) return;
        const L = this.baseL * this.poseScale;
        const hd = this.diveHeading;
        const cos = Math.cos(hd);
        const sin = Math.sin(hd);
        const q = this.phase === 'after' ? 1 : this.diveCover;
        const bodyY = this.diveY + L * 0.1 * q;
        const baseT = (now - this.diveAt) / 1000;
        const centers = [
          { x: this.diveX, y: bodyY, s: 1.0, seed: 11 },
          {
            x: this.diveX + cos * L * 0.3,
            y: bodyY + sin * L * 0.3,
            s: 0.62,
            seed: 27,
          },
          {
            x: this.diveX - cos * L * 0.32,
            y: bodyY - sin * L * 0.32,
            s: 0.58,
            seed: 41,
          },
        ];
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = `rgb(${pal.crest})`;
        ctx.font = `500 ${Math.round(this.ch * 1.12)}px ${MONO}`;

        // Ripples are deliberately uneven: three centres along the body,
        // broken and radially wobbled arcs, so they read as disturbed water
        // rather than clean target rings.
        for (let ci = 0; ci < centers.length; ci += 1) {
          const c0 = centers[ci];
          for (let k = 0; k < 3; k += 1) {
            const age = baseT - ci * 0.07 - k * 0.16;
            if (age < 0) continue;
            const p = age / 2.6;
            if (p > 1) continue;
            const grow = 1 - Math.pow(1 - p, 1.55);
            const shape = 0.9 + 0.2 * hash2(c0.seed, k);
            const rx = L * (0.13 + 0.5 * grow) * c0.s * shape;
            const ry = rx * (0.33 + 0.12 * hash2(c0.seed + 3, k));
            const a =
              Math.pow(1 - p, 1.1) *
              (0.6 + 0.15 * hash2(c0.seed + 5, k)) *
              alpha;
            if (a < 0.01) continue;
            const count = clamp(
              Math.round((Math.PI * (rx + ry)) / (this.cw * 2.0)),
              14,
              100,
            );
            for (let j = 0; j < count; j += 1) {
              const th = (j / count) * TWO_PI;
              const hh = hash2(c0.seed * 13 + j * 3, k + 7);
              if (hh < 0.03) continue;
              const wob =
                1 +
                0.1 * Math.sin(th * 3 + c0.seed + baseT * 1.8) +
                0.07 * (hash2(j + c0.seed, k) - 0.5);
              const ex = Math.cos(th) * rx * wob;
              const ey = Math.sin(th) * ry * wob;
              const x = c0.x + ex * cos - ey * sin;
              const y = c0.y + ex * sin + ey * cos;
              if (x < -10 || x > this.w + 10 || y < -10 || y > this.h + 10) {
                continue;
              }
              const glyph =
                hh < 0.3 ? '~' : hh < 0.55 ? '-' : hh < 0.8 ? '.' : "'";
              ctx.globalAlpha = a * (0.45 + hh * 0.7);
              ctx.fillText(glyph, x, y);
            }
          }
        }
        ctx.restore();
      }

      drawBubbles(now, pal, alpha) {
        if (!this.bubbles.length || alpha <= 0.01) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = `rgb(${pal.wake})`;
        for (let i = 0; i < this.bubbles.length; i += 1) {
          const b = this.bubbles[i];
          const age = (now - b.t0) / 1000;
          if (age < 0 || age > b.life) continue;
          const p = age / b.life;
          const x = b.x + Math.sin(age * 4.2 + b.phase) * b.drift * age;
          const y = b.y - b.vy * age;
          const a = b.a * (1 - p) * alpha;
          if (a < 0.03) continue;
          ctx.globalAlpha = a;
          ctx.fillText(
            BUBBLE_GLYPHS[(b.size * BUBBLE_GLYPHS.length) | 0],
            x,
            y,
          );
        }
        ctx.restore();
      }

    }

    function apply(cordis) {
      const encounter = new Encounter();
      const style = document.createElement('style');
      style.dataset.plugin = '@sherl98/dsh-orca-ocean';
      style.textContent = CSS;

      cordis.effect(() => {
        document.head.appendChild(style);
        return () => {
          style.remove();
          encounter.destroy();
        };
      });

      function HeroProbe(props) {
        const ref = React.useRef(null);
        const sessionId = props && props.sessionId;
        React.useEffect(() => {
          const el = ref.current;
          const host = el && el.closest('[data-conversation-region="chat"]');
          if (!host) return undefined;
          encounter.show(host);
          return () => encounter.hide(host);
        }, [sessionId]);
        return h('span', {
          ref,
          'aria-hidden': 'true',
          style: { display: 'none' },
        });
      }

      cordis.effect(() =>
        cordis.slots.inject('conversation.hero.options', () =>
          cordis.slots.register(
            { name: 'conversation.hero.options', id: 'orca-ocean-hero', order: 900 },
            HeroProbe,
          ),
        ),
      );
    }

    return { inject: ['slots'], apply };
  },
});
