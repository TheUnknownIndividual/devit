// MetaMask's default account picture (Jazzicon), drawn the same way: a Mersenne Twister seeded from the address
// picks a hue-shifted palette and three rotated squares over a background colour. For an EVM address the seed is
// the first 8 hex digits after 0x, exactly as MetaMask does, so the picture matches the one in the wallet.
// Solana, NEAR and plain account ids are hashed to a 32-bit seed instead.

const PALETTE = ["#01888C", "#FC7500", "#034F5D", "#F73F01", "#FC1960", "#C7144C", "#F3C100", "#1598F2", "#2465E1", "#F19E02"];
const SHAPES = 4;
const WOBBLE = 30;

class MT19937 {
  private mt = new Uint32Array(624);
  private i = 625;
  constructor(seed: number) {
    this.mt[0] = seed >>> 0;
    for (this.i = 1; this.i < 624; this.i++) {
      const s = this.mt[this.i - 1] ^ (this.mt[this.i - 1] >>> 30);
      this.mt[this.i] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253 + this.i) >>> 0;
    }
  }
  private int32(): number {
    const mag = [0, 0x9908b0df];
    let y: number;
    if (this.i >= 624) {
      let k = 0;
      for (; k < 624 - 397; k++) {
        y = (this.mt[k] & 0x80000000) | (this.mt[k + 1] & 0x7fffffff);
        this.mt[k] = this.mt[k + 397] ^ (y >>> 1) ^ mag[y & 1];
      }
      for (; k < 623; k++) {
        y = (this.mt[k] & 0x80000000) | (this.mt[k + 1] & 0x7fffffff);
        this.mt[k] = this.mt[k + (397 - 624)] ^ (y >>> 1) ^ mag[y & 1];
      }
      y = (this.mt[623] & 0x80000000) | (this.mt[0] & 0x7fffffff);
      this.mt[623] = this.mt[396] ^ (y >>> 1) ^ mag[y & 1];
      this.i = 0;
    }
    y = this.mt[this.i++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  random(): number { return this.int32() * (1 / 4294967296); }
}

function seedOf(s: string): number {
  if (/^0x[0-9a-f]{8}/i.test(s)) return parseInt(s.slice(2, 10), 16);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rotateHue(hex: string, deg: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[R, G, B].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export interface JazzShape { fill: string; tx: number; ty: number; rot: number }

/** The background and three squares for a seed, on a 100-unit canvas. */
export function jazzicon(seed: string): { bg: string; shapes: JazzShape[] } {
  const rng = new MT19937(seedOf(seed.toLowerCase()));
  const shift = rng.random() * WOBBLE - WOBBLE / 2;
  const colors = PALETTE.map((c) => rotateHue(c, shift));
  const take = () => colors.splice(Math.floor(colors.length * rng.random()), 1)[0];
  const bg = take();
  const D = 100, total = SHAPES - 1;
  const shapes: JazzShape[] = [];
  for (let i = 0; i < total; i++) {
    const first = rng.random();
    const angle = Math.PI * 2 * first;
    const v = (D / total) * rng.random() + (i * D) / total;
    const second = rng.random();
    shapes.push({ tx: Math.cos(angle) * v, ty: Math.sin(angle) * v, rot: first * 360 + second * 180, fill: take() });
  }
  return { bg, shapes };
}

export function Jazzicon({ seed, size }: { seed: string; size: number }) {
  const { bg, shapes } = jazzicon(seed);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: "block", background: bg }}>
      {shapes.map((s, i) => (
        <rect key={i} x="0" y="0" width="100" height="100" fill={s.fill} transform={`translate(${s.tx.toFixed(2)} ${s.ty.toFixed(2)}) rotate(${s.rot.toFixed(1)} 50 50)`} />
      ))}
    </svg>
  );
}
