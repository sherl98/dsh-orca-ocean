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
    const CAMERA_PLANE = 0.975;
    const CAMERA_LIFT = Math.sqrt(1 - CAMERA_PLANE * CAMERA_PLANE);
    const GLYPHS = " .'`:;~-+=*xX%8#@";
    const PATCH_GLYPHS = '#%@8';
    const WATER_GLYPHS = '~=-.\'';

    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const smooth = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };

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

    function expire(items, now) {
      let count = 0;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (now - item.t0 < item.life) items[count++] = item;
      }
      items.length = count;
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
            inkRgb: [236, 243, 247],
            patchRgb: [255, 255, 255],
            water: '152, 196, 216',
            waterRgb: [152, 196, 216],
            wake: '176, 214, 228',
            crest: '208, 234, 242',
          }
        : {
            inkRgb: [10, 20, 26],
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

    // A shaped dorsal surface, not a flat rotating sprite. The flippers and
    // flukes are thin; the trunk has a rounded cross-section and a dorsal ridge.
    function surfaceHeight(u, v) {
      const trunk = smooth(0.12, 0.43, u) * (1 - smooth(0.82, 1.01, u));
      const radius = 0.018 + trunk * 0.11;
      const section = Math.sqrt(Math.max(0, 1 - Math.pow(v / radius, 2)));
      const back = trunk * 0.085 * section;
      const dorsal = 0.095 * Math.exp(-Math.pow((u - 0.565) / 0.062, 2)) *
        (1 - smooth(0.005, 0.022, Math.abs(v)));
      return back + dorsal;
    }

    const SURFACE = [];
    for (let c = 0; c < COLS; c += 1) {
      const u = c / (COLS - 1);
      for (let r = 0; r < ROWS; r += 1) {
        const i = r * COLS + c;
        if (COV[i] < 2) continue;
        const v = (r / (ROWS - 1) - 0.5) * 2 * VHALF;
        const z = surfaceHeight(u, v);
        const nx = -(surfaceHeight(u + 0.003, v) - surfaceHeight(u - 0.003, v)) / 0.006;
        const ny = -(surfaceHeight(u, v + 0.003) - surfaceHeight(u, v - 0.003)) / 0.006;
        const norm = Math.hypot(nx, ny, 1);
        SURFACE.push({ column: c, finTip: smooth(0.085, 0.22, Math.abs(v)), u, v, z, nx: nx / norm, ny: ny / norm, nz: 1 / norm,
          cov: COV[i] / 15, tone: TONE[i] / 15, patch: PATCH[i] / 15 });
      }
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
        this.turnRate = 0;
        this.turnVel = 0;
        this.bank = 0;
        this.strokeGain = 1;
        this.speedNorm = 0;
        this.spray = [];
        this.nextSpray = 0;
        this.waterSeed = Math.random() * 1000;
        this.tailRipples = [];
        this.surfaceRipples = [];
        this.tailPulse = -1;
        this.diveAt = 0;
        this.diveTimer = 0;
        this.last = 0;
        this.lastDraw = 0;
        this.raf = 0;
        this.resizeTimer = 0;
        this.themeObserver = null;
        this.resizeObserver = null;
        this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.boundLoop = (now) => this.loop(now);
        this.onWinResize = () => this.scheduleResize();
        this.onMotion = () => this.motionChanged();
        this.hiddenAt = null;
        this.onVisibility = () => this.visibilityChanged();
        this.damage = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
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
        this.turnRate = 0;
        this.turnVel = 0;
        this.bank = 0;
        this.strokeGain = 1;
        this.speedNorm = 0;
        this.spray = [];
        this.nextSpray = 0;
        this.waterSeed = Math.random() * 1000;
        this.tailRipples = [];
        this.surfaceRipples = [];
        this.tailPulse = -1;
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
        if (!this.reduced && !document.hidden) this.raf = requestAnimationFrame(this.boundLoop);
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
        document.removeEventListener('visibilitychange', this.onVisibility);
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
        this.glyphBuffer = null;
        this.waterGrid = null;
        this.poseColumns = null;
        this.hiddenAt = null;
        this.trail = [];
        this.turnRate = 0;
        this.turnVel = 0;
        this.bank = 0;
        this.strokeGain = 1;
        this.spray = [];
        this.tailRipples = [];
        this.surfaceRipples = [];
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
        document.addEventListener('visibilitychange', this.onVisibility);
        if (document.hidden) this.hiddenAt = performance.now();
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
          if (this.phase === 'dive' || this.phase === 'after') { this.destroy(); return; }
          this.enter = 1;
          this.drawStatic();
        } else if (this.host && !this.raf && !document.hidden) {
          this.last = performance.now();
          this.lastDraw = 0;
          this.raf = requestAnimationFrame(this.boundLoop);
        }
      }

      visibilityChanged() {
        if (!this.host) return;
        const now = performance.now();
        if (document.hidden) {
          if (this.hiddenAt === null) this.hiddenAt = now;
          if (this.raf) cancelAnimationFrame(this.raf);
          this.raf = 0;
          return;
        }
        if (this.hiddenAt !== null) {
          this.enterAt += now - this.hiddenAt;
          if (this.phase === 'dive' || this.phase === 'after') this.diveAt += now - Math.max(this.hiddenAt, this.diveAt);
          this.hiddenAt = null;
        }
        this.last = now;
        this.lastDraw = 0;
        if (!this.reduced && !this.raf) this.raf = requestAnimationFrame(this.boundLoop);
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
        if (this.font && this.w === width && this.h === height &&
          this.canvas.width === Math.round(width * dpr) && this.canvas.height === Math.round(height * dpr) && this.dpr === dpr) return;
        this.w = width;
        this.h = height;
        this.dpr = dpr;
        this.waterGrid = null;
        this.canvas.width = Math.max(1, Math.round(width * dpr));
        this.canvas.height = Math.max(1, Math.round(height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.ch = clamp(height / 106, 7.0, 9.4);
        this.cw = this.ch * 0.63;
        this.cols = Math.ceil(width / this.cw) + 1;
        this.rows = Math.ceil(height / this.ch) + 1;
        this.baseL = clamp(Math.min(width * 0.65, height * 0.6), 170, 620);
        this.font = `500 ${Math.round(this.ch * 0.94)}px ${MONO}`;

        if (this.orca) {
          this.orca.x = clamp(this.orca.x, 0, width);
          this.orca.y = clamp(this.orca.y, 0, height);
        }
      }

      seedOrca() {
        this.poseScale = 0.98;
        const heading = Math.random() * TWO_PI;
        this.orca = {
          x: this.w * (0.32 + Math.random() * 0.36),
          y: this.h * (0.3 + Math.random() * 0.4),
          heading,
          speed: 15 + Math.random() * 3,
        };
        this.turnRate = 0;
        this.turnVel = 0;
        this.bank = 0;
        this.curvature = 0;
        this.speedNorm = this.orca.speed / 20;
        this.target = null;
        this.targetAt = 0;
        this.cruiseSpeed = 14 + Math.random() * 8;
        this.turnMemory = 0;
        this.turnRun = 0;
        this.crossing = false;
        this.crossingCooldown = 0;
        this.excursion = false;
        this.nextExcursion = 22 + Math.random() * 42;
        this.turnBudget = 1.7 + Math.random() * 1.1;
        this.closestTarget = Infinity;
        this.targetPassing = 0;
        this.visited = [];
        this.surfaceRipples = [];
        this.intentTurn = Math.random() < 0.5 ? -1 : 1;
        this.depth = 0.18;
        this.depthTarget = 0.18;
        this.depthVel = 0;
        this.pitch = 0;
        this.rollDrift = 0;
        this.rollTarget = 0;
        this.cadence = 1;
        this.glyphBuffer = null;
        this.gait = 'stroke';
        this.wave = 0;
        this.strokeEnd = TWO_PI * (1 + Math.floor(Math.random() * 2));
        this.glideUntil = 0;
        this.strokeGain = 0;
        this.thrust = 0;
        this.tailPulse = 0;
        this.wakeDistance = 0;
        this.spray = [];
        this.nextSpray = 0;
      }

      pickTarget() {
        const o = this.orca;
        const L = this.baseL;
        const desiredDistance = L * (0.45 + Math.random() * 1.25);
        const preferredSide = Math.abs(this.turnMemory) > 0.65 ? -Math.sign(this.turnMemory) : Math.random() < 0.5 ? -1 : 1;
        this.intentTurn = preferredSide;
        const excursion = this.clock >= this.nextExcursion;
        this.excursion = excursion;
        this.turnBudget = 1.7 + Math.random() * 1.1;
        let best;
        let bestScore = -Infinity;
        for (let i = 0; i < 32; i += 1) {
          const angle = Math.random() * TWO_PI;
          const radius = Math.sqrt(Math.random());
          let x = this.w * (0.5 + Math.cos(angle) * radius * 0.31);
          let y = this.h * (0.5 + Math.sin(angle) * radius * 0.29);
          if (excursion) {
            const side = i % 4;
            const inset = 0.04 + Math.random() * 0.06;
            if (side < 2) { x = this.w * (side ? 1 - inset : inset); y = this.h * (0.2 + Math.random() * 0.6); }
            else { y = this.h * (side === 2 ? inset : 1 - inset); x = this.w * (0.2 + Math.random() * 0.6); }
          }
          const distance = Math.hypot(x - o.x, y - o.y);
          if (distance < Math.min(L * 0.28, this.w * 0.2)) continue;
          const bearing = wrapAngle(Math.atan2(y - o.y, x - o.x) - o.heading);
          const sameTurn = Math.sign(bearing) === Math.sign(this.turnMemory);
          let recent = 0;
          for (const p of this.visited) recent += Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / (L * L * 0.16));
          const score = -Math.abs(distance - desiredDistance) / L - Math.abs(bearing) * 0.22 -
            (sameTurn ? Math.min(2, Math.abs(this.turnMemory)) * 0.7 : 0) - recent * 0.2 +
            (Math.sign(bearing) === preferredSide ? 0.25 : 0) + Math.random() * 0.3;
          if (score > bestScore) { bestScore = score; best = { x, y }; }
        }
        this.target = best || { x: this.w * 0.5, y: this.h * 0.5 };
        this.visited.push({ x: o.x, y: o.y });
        if (this.visited.length > 6) this.visited.shift();
        this.closestTarget = Math.hypot(this.target.x - o.x, this.target.y - o.y);
        this.targetPassing = 0;
        const travelTime = this.closestTarget / Math.max(12, o.speed);
        this.targetAt = this.clock + clamp(travelTime * (excursion ? 1.65 : 1.1) + 8 + Math.random() * 12, 16, 100);
        if (excursion) this.nextExcursion = this.targetAt + 35 + Math.random() * 65;
        this.cruiseSpeed = 12 + Math.random() * 10.5;
        this.depthTarget = 0.08 + Math.random() * 0.56;
        this.rollTarget = (Math.random() - 0.5) * 0.09;
        this.cadence = 0.9 + Math.random() * 0.22;
      }

      waterCurrent() {
        return {
          x: -1.8 + 0.45 * Math.sin(this.clock * 0.035 + this.waterSeed),
          y: -0.65 + 0.25 * Math.cos(this.clock * 0.027 + this.waterSeed),
        };
      }

      // Posterior dorsoventral strokes and pectoral control follow Fish et al.
      // (2003), doi:10.1111/j.1748-7692.2003.tb01318.x. Height, roll and pitch
      // are projected together; all emitters use that same articulated surface.
      bodyColumn(u, out = {}) {
        const rear = 1 - smooth(0.08, 0.72, u);
        const tail = 1 - smooth(0.08, 0.2, u);
        const phase = this.wave - (1 - u) * 1.15;
        const heave = Math.sin(phase) * 0.115 * rear * rear * this.strokeGain;
        const pitch = Math.cos(phase - 0.25) * 0.55 * this.strokeGain;
        out.x = tail * (u - 0.11) * (Math.cos(pitch) - 1);
        out.y = this.curvature * (u - 0.5) * (u - 0.5) * 0.075;
        out.z = heave + tail * (u - 0.11) * Math.sin(pitch);
        out.fin = smooth(0.53, 0.61, u) * (1 - smooth(0.73, 0.8, u));
        out.trim = Math.cos(this.wave - 1.3) * this.strokeGain * 0.012;
        out.normal = Math.cos(phase) * rear * this.strokeGain * 0.55;
        out.heave = heave;
        out.pitch = pitch;
        out.rear = rear;
        return out;
      }

      bodyPose(u, v = 0, out = {}, column = this.bodyColumn(u), finTip = smooth(0.085, 0.22, Math.abs(v))) {
        const fin = finTip * column.fin;
        const side = Math.sign(v);
        out.x = column.x + fin * (-0.018 * Math.abs(this.bank) + side * this.bank * 0.022);
        out.y = column.y;
        out.z = column.z + fin * (column.trim + side * this.bank * 0.045);
        out.width = 1;
        out.heave = column.heave;
        out.pitch = column.pitch;
        out.rear = column.rear;
        return out;
      }

      projectionFrame() {
        // Fixed, near-overhead camera. Small bank angles keep the full dorsal
        // silhouette readable instead of showing a side-on paper-thin surface.
        const yaw = Math.atan2(Math.sin(this.orca.heading) / CAMERA_PLANE, Math.cos(this.orca.heading));
        const roll = clamp(this.bank * 0.17 + this.rollDrift, -0.22, 0.22);
        const pitch = clamp(this.pitch, -0.1, this.phase === 'dive' ? 0.36 : 0.1);
        const c = Math.cos(yaw), s = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const xx = cp * c, xy = sr * sp * c - cr * s, xz = cr * sp * c + sr * s;
        const yx = cp * s, yy = sr * sp * s + cr * c, yz = cr * sp * s - sr * c;
        const zx = -sp, zy = sr * cp, zz = cr * cp;
        return {
          c, s, cr, sr, cp, sp, plane: CAMERA_PLANE, lift: CAMERA_LIFT,
          L: this.baseL * this.poseScale, x: this.orca.x, y: this.orca.y,
          depth: this.depth * 0.19,
          xx, xy, xz,
          yx: yx * CAMERA_PLANE - zx * CAMERA_LIFT,
          yy: yy * CAMERA_PLANE - zy * CAMERA_LIFT,
          yz: yz * CAMERA_PLANE - zz * CAMERA_LIFT,
          vx: yx * CAMERA_LIFT + zx * CAMERA_PLANE,
          vy: yy * CAMERA_LIFT + zy * CAMERA_PLANE,
          vz: yz * CAMERA_LIFT + zz * CAMERA_PLANE,
          zx, zy, zz,
          lx: -xx * 0.34 - yx * 0.42 + zx * 0.84,
          ly: -xy * 0.34 - yy * 0.42 + zy * 0.84,
          lz: -xz * 0.34 - yz * 0.42 + zz * 0.84,
        };
      }

      projectPoint(u, v, z, frame, pose = this.bodyPose(u, v), out = {}) {
        const x = u - 0.5 + pose.x;
        const y = v + pose.y;
        const height = z + pose.z;
        out.x = frame.x + (x * frame.xx + y * frame.xy + height * frame.xz) * frame.L;
        out.y = frame.y + (x * frame.yx + y * frame.yy + height * frame.yz + frame.depth * CAMERA_LIFT) * frame.L;
        out.z = x * frame.zx + y * frame.zy + height * frame.zz - frame.depth;
        out.view = x * frame.vx + y * frame.vy + height * frame.vz;
        return out;
      }

      bodyPoint(u, v = 0) {
        return this.projectPoint(u, v, surfaceHeight(u, v), this.projectionFrame());
      }

      spawnTailRipple() {
        const L = this.baseL * this.poseScale;
        const flow = this.waterCurrent();
        const heading = this.orca.heading;
        // A paired wake is shed into world space at the actual fluke tips.
        // Its direction and strength stay those of the stroke that made it.
        for (const side of [-1, 1]) {
          const point = this.bodyPoint(0.065, side * 0.115);
          this.tailRipples.push({
            ...point, heading, side, t0: this.clock,
            vx: flow.x - Math.cos(heading) * (3 + this.strokeGain * 4),
            vy: flow.y - Math.sin(heading) * (3 + this.strokeGain * 4),
            rmax: L * (0.045 + this.strokeGain * 0.045),
            life: 6.5 + this.strokeGain,
            strength: this.strokeGain * (1.15 - this.depth * 0.6),
          });
        }
        if (this.tailRipples.length > 16) this.tailRipples.splice(0, this.tailRipples.length - 16);
      }

      updateCruise(dt) {
        const o = this.orca;
        const L = this.baseL * this.poseScale;
        const distance = this.target ? Math.hypot(this.target.x - o.x, this.target.y - o.y) : Infinity;
        this.targetPassing = distance > this.closestTarget + L * 0.04 ? this.targetPassing + dt : 0;
        this.closestTarget = Math.min(this.closestTarget, distance);
        // Passing a destination ends the leg. Continuing to chase a missed
        // point was a source of sustained circles around that point.
        const arrival = Math.max(L * 0.18, o.speed / 0.19 * 1.15);
        if (this.crossing && (distance < arrival || this.clock > this.targetAt ||
          (this.targetPassing > 1.2 && this.closestTarget < L * 0.4))) {
          this.crossing = false;
          this.crossingCooldown = this.clock + 8;
          this.pickTarget();
        } else if (!this.crossing && (!this.target || this.clock > this.targetAt ||
          distance < L * (this.excursion ? 0.15 : 0.2) ||
          (this.excursion && Math.min(o.x, this.w - o.x, o.y, this.h - o.y) < L * 0.26) ||
          this.targetPassing > (this.excursion ? 3.5 : 1.8))) {
          this.pickTarget();
        }
        if (!this.crossing && this.clock > this.crossingCooldown && Math.abs(this.turnRun) > (this.excursion ? 2.25 : this.turnBudget)) {
          this.crossing = true;
          this.excursion = false;
          this.intentTurn = -Math.sign(this.turnRun);
          this.target = { x: this.w * (0.4 + Math.random() * 0.2), y: this.h * (0.4 + Math.random() * 0.2) };
          this.targetAt = this.clock + 70;
          this.closestTarget = Infinity;
          this.targetPassing = 0;
        }
        const dx = this.target.x - o.x;
        const dy = this.target.y - o.y;
        const dist = Math.hypot(dx, dy) || 1;
        let aimX = dx / dist;
        let aimY = dy / dist;
        const look = L * (this.excursion ? 0.23 : 0.33) + o.speed * 2.4;
        const px = o.x + Math.cos(o.heading) * look;
        const py = o.y + Math.sin(o.heading) * look;
        const margin = this.excursion ? 0.28 : 0.45;
        const padX = Math.min(L * margin, this.w * 0.27);
        const padY = Math.min(L * margin, this.h * 0.27);
        const pushX = (Math.max(0, padX - px) - Math.max(0, px - this.w + padX)) / padX;
        const pushY = (Math.max(0, padY - py) - Math.max(0, py - this.h + padY)) / padY;
        aimX += pushX * 2.6;
        aimY += pushY * 2.6;
        let diff = wrapAngle(Math.atan2(aimY, aimX) - o.heading);
        // The turn-rate limit sets a physical minimum radius, particularly in
        // small windows. Use it in the boundary prediction as well as steering.
        const radius = Math.max(o.speed / 0.19, 55, Math.min(L * (this.crossing ? 0.21 : 0.27), Math.min(this.w, this.h) * 0.19));
        const nearEdge = Math.abs(pushX) + Math.abs(pushY) > 0.1;
        if (nearEdge && Math.abs(diff) > 0.8) {
          const cost = side => {
            const angle = side * diff >= 0 ? Math.abs(diff) : TWO_PI - Math.abs(diff);
            let value = angle * 0.02 + (side * this.turnVel < 0 ? 0.025 : 0);
            for (let i = 1; i <= 10; i += 1) {
              const theta = Math.min(angle, Math.PI) * i / 10;
              const h = o.heading + side * theta;
              const x = o.x + radius * (Math.sin(h) - Math.sin(o.heading)) / side;
              const y = o.y - radius * (Math.cos(h) - Math.cos(o.heading)) / side;
              const outX = Math.max(0, padX * 0.7 - x, x - this.w + padX * 0.7) / L;
              const outY = Math.max(0, padY * 0.7 - y, y - this.h + padY * 0.7) / L;
              value += outX * outX + outY * outY;
            }
            return value;
          };
          diff = (cost(-1) < cost(1) ? -1 : 1) * Math.abs(diff);
        } else if (Math.abs(diff) > 2.5) {
          diff = this.intentTurn * Math.abs(diff);
        }
        const maxTurn = Math.min(0.19, o.speed / radius);
        const bias = nearEdge ? 0 : clamp(this.turnMemory * 0.045, -maxTurn * 0.65, maxTurn * 0.65);
        // After a long arc, cross the center before exploring again. Holding
        // this destination prevents repeated replanning from becoming an orbit.
        let desiredTurn = clamp(diff * (this.crossing ? 0.3 : 0.18) - (this.crossing ? 0 : bias), -maxTurn, maxTurn);
        // Release a persistent turn only when a full turning radius fits
        // inside the frame. Counter-steering breaks loops without snapping
        // either the heading or the position.
        if (Math.abs(this.turnRun) > 3.2 && Math.min(o.x, this.w - o.x, o.y, this.h - o.y) > radius * 1.25) {
          desiredTurn = -Math.sign(this.turnRun) * maxTurn * 0.55;
        }
        const response = Math.abs(desiredTurn) > Math.abs(this.turnVel) ? 1.15 : 0.9;
        this.turnVel += (desiredTurn - this.turnVel) * (1 - Math.exp(-dt * response));
        this.turnRate = this.turnVel;
        this.turnRun = this.turnRun * this.turnRate < 0 ? this.turnRate * dt : this.turnRun + this.turnRate * dt;
        o.heading = wrapAngle(o.heading + this.turnVel * dt);
        this.curvature += (this.turnRate / Math.max(o.speed, 1) * L - this.curvature) * (1 - Math.exp(-dt * 1.5));
        this.turnMemory = this.turnMemory * Math.exp(-dt / 45) + this.turnRate * dt;
        const targetBank = clamp(this.curvature * 0.32, -1, 1);
        this.bank += (targetBank - this.bank) * (1 - Math.exp(-dt * 1.5));
        const turnLoad = Math.abs(this.bank);
        const desiredSpeed = this.cruiseSpeed * (1 - 0.2 * turnLoad);
        this.depthVel += ((this.depthTarget - this.depth) * 0.2 - this.depthVel) * (1 - Math.exp(-dt * 0.8));
        this.depth += this.depthVel * dt;
        this.pitch += (clamp(this.depthVel * 2.8, -0.08, 0.08) - this.pitch) * (1 - Math.exp(-dt));
        this.rollDrift += (this.rollTarget - this.rollDrift) * (1 - Math.exp(-dt * 0.32));
        this.poseScale = 1.02 - this.depth * 0.2;

        if (this.gait === 'glide' && (this.clock >= this.glideUntil || o.speed < desiredSpeed * 0.58)) {
          this.gait = 'stroke';
          this.strokeEnd = this.wave + TWO_PI * (1 + Math.floor(Math.random() * 2));
        }
        if (this.gait === 'stroke') {
          const hz = clamp(4.5 * o.speed / L, 0.13, 0.3) * this.cadence;
          this.wave += TWO_PI * hz * dt;
          const finish = smooth(0, 1.05, this.strokeEnd - this.wave);
          const effort = clamp(0.8 + (desiredSpeed - o.speed) * 0.14 + turnLoad * 0.12, 0.15, 1.25);
          this.strokeGain += (effort * finish - this.strokeGain) * (1 - Math.exp(-dt * 2.8));
          if (this.wave >= this.strokeEnd) {
            this.wave = this.strokeEnd;
            this.gait = 'glide';
            this.glideUntil = this.clock + 3.5 + Math.random() * 6;
          }
        } else {
          this.strokeGain *= Math.exp(-dt * 3.2);
        }
        // Lift-based propulsion on both half-strokes, followed by quadratic
        // drag. Speed changes because of the stroke, never an unrelated sine.
        const power = Math.pow(Math.cos(this.wave - 0.85), 2);
        this.thrust = this.strokeGain * (1.2 + desiredSpeed * desiredSpeed * 0.0042) * (0.28 + 1.32 * power);
        const drag = 0.0033 * o.speed * o.speed * (1 + turnLoad * 0.28);
        o.speed = Math.max(0, o.speed + (this.thrust - drag) * dt);
        this.speedNorm = o.speed / 20;
        o.x += Math.cos(o.heading) * o.speed * dt;
        o.y += Math.sin(o.heading) * o.speed * dt;

        const pulse = Math.floor((this.wave - 0.85 + Math.PI / 2) / Math.PI);
        if (pulse !== this.tailPulse) {
          this.tailPulse = pulse;
          if (this.strokeGain > 0.22) this.spawnTailRipple();
        }
        expire(this.tailRipples, this.clock);
        this.wakeDistance += o.speed * dt;
        if (this.wakeDistance >= this.cw * 1.25) {
          this.wakeDistance = 0;
          const flow = this.waterCurrent();
          const tail = this.bodyPoint(0.07);
          this.trail.push({ ...tail, h: o.heading, L, t0: this.clock, life: 8, speed: this.speedNorm, bank: this.bank, effort: this.strokeGain, flow });
          if (this.trail.length > 64) this.trail.shift();
        }
        expire(this.trail, this.clock);
        // Small pressure streaks peel away from the pectorals. Underwater
        // disturbances advect with the water, without ballistic spray/gravity.
        if (this.clock >= this.nextSpray) {
          this.nextSpray = this.clock + 0.45;
          const flow = this.waterCurrent();
          for (const side of [-1, 1]) {
            const point = this.bodyPoint(0.65, side * 0.17);
            this.spray.push({ ...point, vx: flow.x - Math.sin(o.heading) * side * (1 + turnLoad * 3), vy: flow.y + Math.cos(o.heading) * side * (1 + turnLoad * 3), t0: this.clock, life: 2.8, ch: side > 0 ? "'" : '.', strength: 0.25 + this.speedNorm * 0.28 + turnLoad * 0.2 });
          }
        }
        expire(this.spray, this.clock);
      }

      startDive(now) {
        this.phase = 'dive';
        this.diveAt = now;
        this.diveStart = {
          ...this.orca, bank: this.bank, depth: this.depth, pitch: this.pitch,
          scale: this.poseScale, gain: this.strokeGain, roll: this.rollDrift,
          curvature: this.curvature,
        };
        this.diveProgress = 0;
        this.diveCover = 0;
        this.diveMarks = [
          { at: 0.22, u: 0.87, v: 0, strength: 0.6 },
          { at: 0.62, u: 0.57, v: -0.11, strength: 0.8 },
          { at: 0.72, u: 0.57, v: 0.11, strength: 0.8 },
          { at: 1.13, u: 0.065, v: -0.115, strength: 1 },
          { at: 1.13, u: 0.065, v: 0.115, strength: 1 },
        ];
      }

      updateDive(dt, now) {
        const t = Math.max(0, (now - this.diveAt) / 1000);
        const initial = this.diveStart;
        this.diveProgress = clamp(t / 2.9, 0, 1);
        this.diveCover = smooth(0.12, 2.9, t);
        // Continue the incoming velocity, then decelerate below the surface.
        // The head tucks first; the final tail stroke follows, without a roll.
        const travel = initial.speed * 1.65 * (1 - Math.exp(-t / 1.65));
        this.orca.x = initial.x + Math.cos(initial.heading) * travel;
        this.orca.y = initial.y + Math.sin(initial.heading) * travel;
        this.orca.speed = initial.speed * Math.exp(-t / 1.65);
        this.bank = initial.bank * (1 - smooth(0, 1.2, t));
        this.rollDrift = initial.roll * (1 - smooth(0, 1.2, t));
        this.curvature = initial.curvature * (1 - smooth(0, 1.1, t));
        this.pitch = initial.pitch + 0.28 * smooth(0, 0.85, t) - 0.09 * smooth(1.3, 2.7, t);
        this.depth = initial.depth + 1.65 * smooth(0.12, 2.8, t);
        this.poseScale = initial.scale * (1 - 0.14 * this.diveCover);
        const kick = initial.gain + (1.05 - initial.gain) * smooth(0, 0.4, t);
        this.strokeGain = kick * (1 - smooth(0.85, 1.85, t));
        this.wave += dt * (2.6 - 1.2 * this.diveCover);
        for (const mark of this.diveMarks) {
          if (mark.emitted || t < mark.at) continue;
          mark.emitted = true;
          const point = this.bodyPoint(mark.u, mark.v);
          this.surfaceRipples.push({ x: point.x, y: point.y, t0: this.clock,
            heading: initial.heading, strength: mark.strength,
            life: 2.6, size: this.baseL * 0.11, flow: this.waterCurrent() });
        }
        if (t >= 2.9) this.phase = 'after';
      }

      loop(now) {
        this.raf = 0;
        if (!this.host || !this.ctx || document.hidden) return;
        this.raf = requestAnimationFrame(this.boundLoop);
        if (now - this.lastDraw < 1000 / 30 - 0.5) return;
        const elapsed = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
        this.last = now;
        const steps = Math.max(1, Math.ceil(elapsed / (1 / 60)));
        for (let i = 0; i < steps; i += 1) this.update(elapsed / steps, now);
        this.lastDraw = now;
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
        }

        if (this.phase === 'dive') {
          this.updateDive(dt, now);
        } else if (this.phase === 'after') {
          this.diveProgress = 1;
          this.diveCover = 1;
        } else {
          this.diveProgress = 0;
          this.diveCover = 0;
        }
        if (this.phase === 'after' && now - this.diveAt > 3850) this.phase = 'done';
        expire(this.surfaceRipples, this.clock);


      }

      sceneAlpha(now) {
        if (this.phase === 'after' || this.phase === 'dive') {
          const since = (now - this.diveAt) / 1000;
          return 1 - smooth(2.9, 3.8, since);
        }
        return 1;
      }

      draw(now) {
        const ctx = this.ctx;
        if (!ctx || this.w < 10) return;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const pal = palette(this.dark);
        const fade = this.sceneAlpha(now);
        const enter = this.enter;
        const alpha = enter * fade;
        const grid = this.waterGrid;
        // The slow ambient sea is sampled at 15 Hz; the animal and wake remain
        // at 30 Hz. Repaint the previous foreground from character data, with
        // no full-screen bitmap cache or repeated full-screen text rasterization.
        if (this.phase === 'cruise' && alpha === 1 && grid && grid.paintTheme === this.dark && grid.paintAlpha === alpha &&
          this.clock >= grid.paintClock && this.clock - grid.paintClock < 1 / 15 - 0.001) {
          this.restoreWater(pal);
        } else {
          ctx.clearRect(0, 0, this.w, this.h);
          this.drawWater(now, pal, alpha);
        }
        this.damage.x0 = this.damage.y0 = Infinity;
        this.damage.x1 = this.damage.y1 = -Infinity;
        this.drawWake(now, pal, alpha);
        if (this.phase !== 'after') this.drawOrca(now, pal, alpha);
        this.drawSpray(now, pal, alpha);

        // Local surface disturbances persist after the silhouette has sunk.
        this.drawDiveRings(now, pal, alpha);
        ctx.globalAlpha = 1;
      }

      drawStatic() {
        if (!this.ctx || this.w < 10) return;
        this.enter = 1;
        this.clock = 2.2;
        if (!this.orca) this.seedOrca();
        this.poseScale = 0.96;
        this.wave = 0;
        this.strokeGain = 0;
        this.draw(performance.now());
      }

      waterDensity(px, py, t = this.clock) {
        const seed = this.waterSeed;
        const driftX = t * 1.8;
        const driftY = t * 0.65;
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
      }

      prepareWater() {
        const cols = this.cols;
        const rows = this.rows;
        let grid = this.waterGrid;
        if (grid && grid.cols === cols && grid.rows === rows && grid.cw === this.cw && grid.ch === this.ch) return grid;
        const count = cols * rows;
        // The field is smooth between adjacent characters. Sample it once per
        // 2x2 cells, then interpolate; static grain and jitter never need hashing again.
        const fc = Math.ceil(cols / 2) + 1;
        const fr = Math.ceil(rows / 2) + 1;
        grid = this.waterGrid = { cols, rows, cw: this.cw, ch: this.ch, fc, fr,
          x: new Float32Array(count), y: new Float32Array(count), grain: new Float32Array(count),
          sample: new Int32Array(count), fx: new Float32Array(count), fy: new Float32Array(count),
          field: new Float32Array(fc * fr),
          fieldFrom: new Float32Array(fc * fr), fieldTo: new Float32Array(fc * fr),
          fieldAt: -Infinity, fieldSeed: this.waterSeed,
          bendX: new Float32Array(count), bendY: new Float32Array(count),
          energy: new Float32Array(count), boost: new Float32Array(count),
          glyphs: new Uint8Array(count), opacity: new Float32Array(count),
          paintClock: -Infinity, paintTheme: this.dark, paintAlpha: 0 };
        for (let r = 1; r < rows; r += 1) {
          for (let c = 1; c < cols; c += 1) {
            const k = r * cols + c;
            const x = c * this.cw + (hash2(c + 2, r + 7) - 0.5) * this.cw * 0.9;
            const y = r * this.ch + (hash2(c + 9, r + 3) - 0.5) * this.ch * 0.9;
            grid.x[k] = x; grid.y[k] = y;
            grid.grain[k] = hash2(c + 13, r + 29);
            const gx = x / (this.cw * 2), gy = y / (this.ch * 2);
            grid.sample[k] = Math.floor(gy) * fc + Math.floor(gx);
            grid.fx[k] = gx % 1; grid.fy[k] = gy % 1;
          }
        }
        return grid;
      }

      updateWaterField(grid) {
        const interval = 0.1;
        const t = this.clock;
        const { fc, fr } = grid;
        const sample = (field, time) => {
          for (let r = 0; r < fr; r += 1) {
            for (let c = 0; c < fc; c += 1) field[r * fc + c] = this.waterDensity(c * this.cw * 2, r * this.ch * 2, time);
          }
        };
        // The original water drifts slowly. Interpolate two nearby time samples
        // at the full animation rate, instead of repeating trigonometry each frame.
        if (grid.fieldSeed !== this.waterSeed || t < grid.fieldAt || t >= grid.fieldAt + interval * 2) {
          grid.fieldAt = t;
          grid.fieldSeed = this.waterSeed;
          sample(grid.fieldFrom, t);
          sample(grid.fieldTo, t + interval);
        } else if (t >= grid.fieldAt + interval) {
          const previous = grid.fieldFrom;
          grid.fieldFrom = grid.fieldTo;
          grid.fieldTo = previous;
          grid.fieldAt += interval;
          sample(grid.fieldTo, grid.fieldAt + interval);
        }
        const mix = clamp((t - grid.fieldAt) / interval, 0, 1);
        for (let i = 0; i < grid.field.length; i += 1) {
          grid.field[i] = grid.fieldFrom[i] + (grid.fieldTo[i] - grid.fieldFrom[i]) * mix;
        }
      }

      waterAt(grid, x, y) {
        const gx = clamp(x / (this.cw * 2), 0, grid.fc - 1.001);
        const gy = clamp(y / (this.ch * 2), 0, grid.fr - 1.001);
        const k = Math.floor(gy) * grid.fc + Math.floor(gx);
        const fx = gx % 1, fy = gy % 1, f = grid.field;
        const a = f[k] + (f[k + 1] - f[k]) * fx;
        const b = f[k + grid.fc] + (f[k + grid.fc + 1] - f[k + grid.fc]) * fx;
        return a + (b - a) * fy;
      }

      disturbWater(grid, x, y, rx, ry, visit) {
        const c0 = Math.max(1, Math.floor((x - rx) / this.cw) - 1);
        const c1 = Math.min(grid.cols - 1, Math.ceil((x + rx) / this.cw) + 1);
        const r0 = Math.max(1, Math.floor((y - ry) / this.ch) - 1);
        const r1 = Math.min(grid.rows - 1, Math.ceil((y + ry) / this.ch) + 1);
        for (let r = r0; r <= r1; r += 1) {
          for (let c = c0; c <= c1; c += 1) {
            const k = r * grid.cols + c;
            visit(k, grid.x[k] - x, grid.y[k] - y);
          }
        }
      }

      paintGlyph(ctx, glyph, x, y) {
        ctx.fillText(glyph, x, y);
        const d = this.damage, pad = this.ch;
        if (x - pad < d.x0) d.x0 = x - pad;
        if (y - pad < d.y0) d.y0 = y - pad;
        if (x + pad > d.x1) d.x1 = x + pad;
        if (y + pad > d.y1) d.y1 = y + pad;
      }

      restoreWater(pal) {
        const d = this.damage;
        if (d.x0 > d.x1 || d.y0 > d.y1) return;
        const grid = this.waterGrid, ctx = this.ctx;
        // Align the single clip rectangle to device pixels so its edge never
        // accumulates translucent antialiasing over repeated redraws.
        const x0 = Math.floor(d.x0 * this.dpr) / this.dpr;
        const y0 = Math.floor(d.y0 * this.dpr) / this.dpr;
        const x1 = Math.ceil(d.x1 * this.dpr) / this.dpr;
        const y1 = Math.ceil(d.y1 * this.dpr) / this.dpr;
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
        ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
        ctx.font = `500 ${Math.max(4, Math.round(this.ch * 0.78))}px ${MONO}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgb(${pal.water})`;
        const c0 = Math.max(1, Math.floor((x0 - this.ch) / this.cw));
        const c1 = Math.min(grid.cols - 1, Math.ceil((x1 + this.ch) / this.cw));
        const r0 = Math.max(1, Math.floor(y0 / this.ch) - 1);
        const r1 = Math.min(grid.rows - 1, Math.ceil(y1 / this.ch) + 1);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const k = r * grid.cols + c;
            if (!grid.glyphs[k]) continue;
            ctx.globalAlpha = grid.opacity[k];
            ctx.fillText(WATER_GLYPHS[grid.glyphs[k] - 1], grid.x[k], grid.y[k]);
          }
        }
        ctx.restore();
      }

      drawWater(now, pal, alpha) {
        if (alpha <= 0.01) return;
        const grid = this.prepareWater();
        grid.glyphs.fill(0);
        grid.paintClock = this.clock;
        grid.paintTheme = this.dark;
        grid.paintAlpha = alpha;
        const { field, fc, bendX, bendY, energy, boost } = grid;
        bendX.fill(0); bendY.fill(0); energy.fill(0); boost.fill(0);
        this.updateWaterField(grid);
        // Local effects visit their own rectangles, instead of checking every
        // vortex and ring against every character in the viewport.
        const o = this.orca;
        const L = this.baseL * this.poseScale;
        if (o && (this.phase === 'cruise' || this.phase === 'enter' || this.phase === 'dive')) {
          const ca = Math.cos(o.heading), sa = Math.sin(o.heading);
          const length = L * 0.53, width = L * 0.15;
          const gain = clamp(o.speed / 20, 0, 1.5) * Math.exp(-this.depth * 1.3);
          const rx = 2 * Math.hypot(length * ca, width * sa);
          const ry = 2 * Math.hypot(length * sa, width * ca);
          this.disturbWater(grid, o.x, o.y, rx, ry, (k, dx, dy) => {
            const along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
            const q2 = (along / length) ** 2 + (across / width) ** 2;
            if (q2 > 4) return;
            const shoulder = Math.exp(-(((Math.sqrt(q2) - 1.05) / 0.26) ** 2)) * gain;
            const side = Math.sign(across) || 1;
            const pressure = shoulder * (13 + 4 * side * this.bank);
            bendX[k] += -sa * side * pressure + ca * pressure * 0.25;
            bendY[k] += ca * side * pressure + sa * pressure * 0.25;
            energy[k] += shoulder * 0.1;
            boost[k] += shoulder * 0.7;
          });
        }
        for (const r of this.tailRipples) {
          const age = this.clock - r.t0, life = age / r.life;
          if (life < 0 || life >= 1) continue;
          const radius = 8 + r.rmax * Math.sqrt(life);
          const gain = Math.pow(1 - life, 1.4) * r.strength;
          this.disturbWater(grid, r.x + r.vx * age, r.y + r.vy * age, radius * 2, radius * 2, (k, dx, dy) => {
            const q2 = (dx * dx + dy * dy) / (radius * radius);
            if (q2 > 4) return;
            const ring = Math.exp(-(((Math.sqrt(q2) - 1) / 0.3) ** 2)) * gain;
            const swirl = Math.exp(-q2 * 1.6) * gain * r.side * 0.5;
            bendX[k] -= dy * swirl; bendY[k] += dx * swirl;
            energy[k] += ring * 0.26; boost[k] += ring * 1.1;
          });
        }
        for (const r of this.surfaceRipples) {
          const age = this.clock - r.t0, life = age / r.life;
          if (life < 0 || life >= 1) continue;
          const radius = 5 + r.size * Math.sqrt(life);
          const gain = r.strength * Math.pow(1 - life, 1.4);
          this.disturbWater(grid, r.x + r.flow.x * age, r.y + r.flow.y * age, radius + 22, radius + 22, (k, dx, dy) => {
            const dist = Math.hypot(dx, dy) || 1;
            if (Math.abs(dist - radius) > 22) return;
            const crest = Math.exp(-(((dist - radius) / 9) ** 2)) * gain;
            bendX[k] += dx / dist * crest * 10; bendY[k] += dy / dist * crest * 10;
            energy[k] += crest * 0.26; boost[k] += crest;
          });
        }
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `500 ${Math.max(4, Math.round(this.ch * 0.78))}px ${MONO}`;
        ctx.fillStyle = `rgb(${pal.water})`;
        const opacity = alpha * (this.dark ? 1 : 1.35);
        for (let r = 1; r < grid.rows; r += 1) {
          for (let c = 1; c < grid.cols; c += 1) {
            const k = r * grid.cols + c;
            const j = grid.sample[k], fx = grid.fx[k], fy = grid.fy[k];
            const a = field[j] + (field[j + 1] - field[j]) * fx;
            const b = field[j + fc] + (field[j + fc + 1] - field[j + fc]) * fx;
            const base = a + (b - a) * fy;
            const x = grid.x[k], y = grid.y[k], grain = grid.grain[k];
            const displaced = boost[k] > 0.001 ? this.waterAt(grid, x + bendX[k], y + bendY[k]) : base;
            // Preserve the unbroken ambient lattice under every disturbance.
            const d = Math.min(1, base + Math.max(0, displaced - base) * 0.75 + energy[k]);
            if (d < 0.06 || grain > 0.18 + d * 0.82) continue;
            const glyph = d > 0.55 ? (grain < 0.6 ? 0 : 1) : d > 0.22 ? (grain < 0.7 ? 2 : 0) : grain < 0.7 ? 3 : 4;
            const inkAlpha = Math.min(0.65, (0.025 + d * 0.25) * (1 + boost[k]) * opacity);
            grid.glyphs[k] = glyph + 1;
            grid.opacity[k] = inkAlpha;
            ctx.globalAlpha = inkAlpha;
            ctx.fillText(WATER_GLYPHS[glyph], x, y);
          }
        }
        ctx.restore();
      }

      drawWake(now, pal, alpha) {
        if (alpha <= 0.01) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = `rgb(${pal.wake})`;
        for (const p of this.trail) {
          const age = this.clock - p.t0;
          const fade = Math.pow(Math.max(0, 1 - age / 8), 1.7);
          const c = Math.cos(p.h);
          const s = Math.sin(p.h);
          for (const side of [-1, 1]) {
            const spread = p.L * 0.075 + age * (3.4 + p.speed * 2.5);
            const x = p.x + p.flow.x * age - s * spread * side;
            const y = p.y + p.flow.y * age + c * spread * side;
            const a = fade * (0.14 + p.speed * 0.13 + p.effort * 0.22) * alpha;
            ctx.globalAlpha = a * (1 + side * p.bank * 0.2);
            this.paintGlyph(ctx, age < 2 ? '~' : age < 5 ? '-' : '.', x, y);
            ctx.globalAlpha = a * 0.3;
            this.paintGlyph(ctx, '.', x - s * side * this.cw * 1.5, y + c * side * this.cw * 1.5);
          }
        }
        for (const r of this.tailRipples) {
          const age = this.clock - r.t0;
          const life = age / r.life;
          if (life < 0 || life >= 1) continue;
          const radius = 3 + r.rmax * Math.sqrt(life);
          const c = Math.cos(r.heading);
          const s = Math.sin(r.heading);
          const a = Math.pow(1 - life, 1.8) * r.strength * 0.56 * alpha;
          // Broken counter-rotating arcs, elongated along the direction of the
          // original stroke. Their centers never follow the moving animal.
          for (let j = 0; j < 21; j += 1) {
            const theta = j / 21 * TWO_PI * 0.8 + r.side * age * 0.65;
            const x = Math.cos(theta) * radius * 0.68;
            const y = Math.sin(theta) * radius;
            ctx.globalAlpha = a * (0.4 + 0.6 * Math.sin(j / 21 * Math.PI));
            this.paintGlyph(ctx, j % 3 ? '~' : '.', r.x + r.vx * age + x * c - y * s, r.y + r.vy * age + x * s + y * c);
          }
        }
        // The bow pressure arc opens downstream, with intensity proportional
        // to speed; it fades with the animal during the existing dive.
        if (this.phase === 'enter' || this.phase === 'cruise') {
          const L = this.baseL * this.poseScale;
          const c = Math.cos(this.orca.heading);
          const s = Math.sin(this.orca.heading);
          const nose = this.bodyPoint(0.985);
          for (const side of [-1, 1]) {
            for (let i = 1; i < 10; i += 1) {
              const u = i / 10;
              const back = L * 0.19 * u * u;
              const across = side * L * (0.018 + u * 0.105);
              ctx.globalAlpha = (1 - u * 0.75) * this.speedNorm * 0.34 * alpha * (1 - this.depth * 0.7);
              this.paintGlyph(ctx, i % 3 ? '-' : '.', nose.x - c * back - s * across, nose.y - s * back + c * across);
            }
          }
        }
        ctx.restore();
      }

      drawOrca(now, pal, alpha) {
        if (!this.orca || alpha <= 0.01) return;
        const cover = this.phase === 'dive' ? this.diveCover : this.phase === 'after' ? 1 : 0;
        const frame = this.projectionFrame();
        // Bound the articulated volume, rather than allocating a depth buffer
        // for the entire viewport. Allow room for the strongest stroke and turn.
        const bx = 0.57, by = VHALF + Math.abs(this.curvature) * 0.019, bz = 0.26;
        const rx = (Math.abs(frame.xx) * bx + Math.abs(frame.xy) * by + Math.abs(frame.xz) * bz) * frame.L;
        const ry = (Math.abs(frame.yx) * bx + Math.abs(frame.yy) * by + Math.abs(frame.yz) * bz) * frame.L;
        const cy = frame.y + frame.depth * CAMERA_LIFT * frame.L;
        const cStart = Math.max(0, Math.floor((frame.x - rx) / this.cw) - 1);
        const rStart = Math.max(0, Math.floor((cy - ry) / this.ch) - 1);
        const cEnd = Math.min(Math.ceil(this.w / this.cw), Math.ceil((frame.x + rx) / this.cw) + 1);
        const rEnd = Math.min(Math.ceil(this.h / this.ch), Math.ceil((cy + ry) / this.ch) + 1);
        const cols = cEnd - cStart + 1, rows = rEnd - rStart + 1;
        if (cols <= 0 || rows <= 0) return;
        const count = cols * rows;
        if (!this.glyphBuffer || this.glyphBuffer.score.length < count) {
          const capacity = Math.ceil(count / 1024) * 1024;
          this.glyphBuffer = { score: new Float32Array(capacity), index: new Int32Array(capacity),
            light: new Float32Array(capacity), depth: new Float32Array(capacity), touched: new Int32Array(capacity), used: 0 };
          this.glyphBuffer.score.fill(-Infinity);
        }
        const buffer = this.glyphBuffer;
        for (let n = 0; n < buffer.used; n += 1) buffer.score[buffer.touched[n]] = -Infinity;
        buffer.used = 0;
        if (!this.poseColumns) this.poseColumns = Array.from({ length: COLS }, () => ({}));
        for (let c = 0; c < COLS; c += 1) this.bodyColumn(c / (COLS - 1), this.poseColumns[c]);
        const pose = {};
        const p = {};
        // Forward projection with a depth buffer onto a fixed SCREEN lattice.
        // Text never rotates or scales: the visible characters are reconstructed
        // as the rounded body, articulated flukes and flippers move through it.
        for (let i = 0; i < SURFACE.length; i += 1) {
          const point = SURFACE[i];
          const column = this.poseColumns[point.column];
          this.bodyPose(point.u, point.v, pose, column, point.finTip);
          this.projectPoint(point.u, point.v, point.z, frame, pose, p);
          const gx = p.x / this.cw - cStart;
          const gy = p.y / this.ch - rStart;
          if (gx < -1 || gx > cols || gy < -1 || gy > rows) continue;
          const c0 = Math.floor(gx);
          const r0 = Math.floor(gy);
          let light = -1;
          for (let dy = 0; dy < 2; dy += 1) {
            const r = r0 + dy;
            if (r < 0 || r >= rows) continue;
            for (let dx = 0; dx < 2; dx += 1) {
              const c = c0 + dx;
              if (c < 0 || c >= cols) continue;
              const distance = (gx - c) ** 2 + (gy - r) ** 2;
              if (distance > 0.95 || point.cov < 0.18 + distance * 0.18) continue;
              const k = r * cols + c;
              const score = p.view - distance * 0.045;
              if (score <= buffer.score[k]) continue;
              if (buffer.score[k] === -Infinity) buffer.touched[buffer.used++] = k;
              buffer.score[k] = score;
              buffer.index[k] = i;
              if (light < 0) {
                // Rotate the fixed light once per frame. Only winning samples
                // need shading; rotation does not change the normal's length.
                const nx = point.nx - column.normal;
                light = clamp((nx * frame.lx + point.ny * frame.ly + point.nz * frame.lz) /
                  Math.sqrt(1 - 2 * point.nx * column.normal + column.normal * column.normal), 0, 1);
              }
              buffer.light[k] = light;
              buffer.depth[k] = p.z;
            }
          }
        }
        const ctx = this.ctx;
        const waterMix = clamp(this.depth * 0.4 + cover * 0.65, 0, 0.85);
        const ink = rgbCss(mixRgb(pal.inkRgb, pal.waterRgb, waterMix));
        const white = rgbCss(mixRgb(pal.patchRgb, pal.waterRgb, waterMix));
        const bodyAlpha = alpha * (1 - smooth(0.62, 1, cover)) * (1 - Math.min(this.depth, 0.8) * 0.28);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = ink;
        for (let n = 0; n < buffer.used; n += 1) {
          const k = buffer.touched[n];
          const point = SURFACE[buffer.index[k]];
          const c = k % cols + cStart;
          const r = ((k / cols) | 0) + rStart;
          const x = c * this.cw;
          const y = r * this.ch;
          const key = hash2(c, r);
          const light = buffer.light[k];
          const z = buffer.depth[k];
          // Moving caustic bands cross the volume in world space. They alter
          // glyph density and illumination; they are not a body-wide blink.
          const field = Math.sin(x * 0.036 + y * 0.019 - this.clock * 1.35) +
            Math.sin(y * 0.047 - x * 0.012 + this.clock * 0.74);
          const caustic = Math.pow(Math.max(0, 1 - Math.abs(field) * 1.8), 3) * (0.5 + light * 0.5);
          const shade = 0.54 + light * 0.61 + caustic * 0.26;
          const submerged = clamp(-z * 5, 0, 0.95);
          // Geometric depth and pitch hide the nose before the tail. A final
          // global dissolve only removes the last submerged traces.
          const visibility = 1 - smooth(0.12, 0.4, -z);
          const tone = clamp(point.tone * (0.65 + light * 0.4) + caustic * 0.1, 0, 1);
          const a = (0.32 + point.tone * 0.66) * shade * bodyAlpha * visibility * (1 - submerged * 0.3);
          if (point.patch > 0.44 && point.tone > 0.55) {
            if (this.dark) {
              ctx.fillStyle = white;
              ctx.globalAlpha = clamp((0.65 + point.patch * 0.3) * shade * bodyAlpha * visibility, 0, 1);
              this.paintGlyph(ctx, PATCH_GLYPHS[Math.floor(key * 4)], x, y);
              ctx.fillStyle = ink;
            }
          } else {
            const density = Math.round(1 + tone * 14 + (light - 0.5) * 2 + caustic * 2 - submerged * 2);
            const idx = clamp(density + (key > 0.8 ? 1 : 0), 1, GLYPHS.length - 1);
            ctx.globalAlpha = clamp(a * (this.dark ? 1 : 1.35), 0, 1);
            this.paintGlyph(ctx, GLYPHS[idx], x, y);
          }
          // Surface grain visibly crosses submerged parts, instead of the
          // animal always being pasted over the water as one opaque layer.
          if (submerged > 0.08 && caustic > 0.25 && key < submerged * 0.6) {
            ctx.fillStyle = `rgb(${pal.water})`;
            ctx.globalAlpha = submerged * caustic * alpha * 0.44;
            this.paintGlyph(ctx, key < 0.2 ? '~' : '-', x, y);
            ctx.fillStyle = ink;
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
          const y = sp.y + sp.vy * age;
          const a =
            Math.pow(1 - age / sp.life, 1.4) *
            0.5 *
            Math.min(1.8, sp.strength || 1) *
            alpha;
          if (a < 0.012) continue;
          ctx.globalAlpha = a;
          this.paintGlyph(ctx, sp.ch, x, y);
        }
        ctx.restore();
      }

      drawDiveRings(now, pal, alpha) {
        if (!this.surfaceRipples.length || alpha <= 0.01) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = this.font;
        ctx.fillStyle = `rgb(${pal.crest})`;
        for (const ripple of this.surfaceRipples) {
          const age = this.clock - ripple.t0;
          const p = age / ripple.life;
          if (p < 0 || p >= 1) continue;
          const radius = 5 + ripple.size * Math.sqrt(p);
          const a = ripple.strength * Math.pow(1 - p, 1.6) * smooth(0, 0.13, age) * alpha * 0.48;
          const count = Math.max(16, Math.round(TWO_PI * radius / (this.cw * 1.6)));
          for (let j = 0; j < count; j += 1) {
            const th = j / count * TWO_PI;
            const key = hash2(j, Math.round(ripple.t0 * 19));
            if (key < 0.16) continue;
            const r = radius * (1 + Math.sin(th * 3 + ripple.heading) * 0.06);
            ctx.globalAlpha = a * (0.65 + key * 0.35);
            this.paintGlyph(ctx, key < 0.6 ? '~' : '.', ripple.x + ripple.flow.x * age + Math.cos(th) * r,
              ripple.y + ripple.flow.y * age + Math.sin(th) * r * CAMERA_PLANE);
          }
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
