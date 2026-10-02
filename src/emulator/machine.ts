import type { ProgramImage } from "./asm.ts";

export const MEM_SIZE = 0x01000000;
export const FB_ADDR = 0x00800000;
export const FB_W = 640;
export const FB_H = 360;

export const KEY_L = 1;
export const KEY_R = 2;
export const KEY_U = 4;
export const KEY_D = 8;
export const KEY_X = 16;
export const KEY_O = 32;
export const KEY_S = 64;
export const KEY_T = 128;
export const KEY_START = 256;

export type RsxCmd = {
  op: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
};

const DIGITS: Record<string, string> = {
  "0": "11111100011000110001100011000111111",
  "1": "00100011000010000100001000010001110",
  "2": "11111000010000111111100001000011111",
  "3": "11111000010000111111000010000111111",
  "4": "10001100011000111111000010000100001",
  "5": "11111100001000011111000010000111111",
  "6": "11111100001000011111100011000111111",
  "7": "11111000010001000100010000100001000",
  "8": "11111100011000111111100011000111111",
  "9": "11111100011000111111000010000111111",
  "-": "00000000000000011111000000000000000",
};

function setCR0(cr: number, value: number): number {
  const s = value | 0;
  let nibble = 0x2;
  if (s < 0) nibble = 0x8;
  else if (s > 0) nibble = 0x4;
  return (cr & 0x0fffffff) | (nibble << 28);
}

export class Machine {
  mem = new Uint8Array(MEM_SIZE);
  view = new DataView(this.mem.buffer);
  fb = new Uint8ClampedArray(this.mem.buffer, FB_ADDR, FB_W * FB_H * 4);
  r = new Int32Array(32);
  pc = 0;
  lr = 0;
  cr = 0;
  cycles = 0;
  frame = 0;
  halted = false;
  waiting = false;
  resumePc = 0;
  exitCode = 0;
  fault = "";
  pad = 0;
  spe = [0, 0, 0, 0, 0, 0];
  rsx: RsxCmd[] = [];
  rsxPut = 0;
  rsxGet = 0;
  beep: number | null = null;
  symbols = new Map<string, number>();
  listing: ProgramImage["listing"] = [];
  entry = 0;

  read32(addr: number): number {
    const a = addr >>> 0;
    if (a + 3 >= MEM_SIZE) {
      this.fault = `قراءة خارج الذاكرة @${a.toString(16)}`;
      this.halted = true;
      return 0;
    }
    return this.view.getUint32(a, false);
  }

  write32(addr: number, value: number) {
    const a = addr >>> 0;
    if (a + 3 >= MEM_SIZE) {
      this.fault = `كتابة خارج الذاكرة @${a.toString(16)}`;
      this.halted = true;
      return;
    }
    this.view.setUint32(a, value >>> 0, false);
  }

  load(image: ProgramImage) {
    this.mem.fill(0);
    this.r.fill(0);
    this.pc = image.entry >>> 0;
    this.entry = this.pc;
    this.lr = 0;
    this.cr = 0;
    this.cycles = 0;
    this.frame = 0;
    this.halted = false;
    this.waiting = false;
    this.resumePc = 0;
    this.exitCode = 0;
    this.fault = "";
    this.pad = 0;
    this.spe = [0, 0, 0, 0, 0, 0];
    this.rsx = [];
    this.rsxPut = 0;
    this.rsxGet = 0;
    this.beep = null;
    this.symbols = image.symbols;
    this.listing = image.listing;
    for (const chunk of image.chunks) {
      this.mem.set(chunk.data, chunk.addr);
    }
    this.clear(0xff07090d);
  }

  symbol(name: string): number {
    const addr = this.symbols.get(name);
    if (addr === undefined) return 0;
    return this.read32(addr) | 0;
  }

  clear(color: number) {
    const [r, g, b, a] = argb(color);
    const px = this.fb;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
    this.pushRsx("مسح", 0, 0, FB_W, FB_H, color);
  }

  fillRect(x: number, y: number, w: number, h: number, color: number, track = true) {
    const [r, g, b, a] = argb(color);
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(FB_W, (x | 0) + (w | 0));
    const y1 = Math.min(FB_H, (y | 0) + (h | 0));
    const px = this.fb;
    for (let yy = y0; yy < y1; yy++) {
      let i = (yy * FB_W + x0) * 4;
      for (let xx = x0; xx < x1; xx++) {
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
        px[i + 3] = a;
        i += 4;
      }
    }
    if (track) this.pushRsx("مستطيل", x | 0, y | 0, w | 0, h | 0, color);
  }

  drawNumber(x: number, y: number, value: number, color: number) {
    const text = String(value | 0);
    let cx = x | 0;
    for (const ch of text) {
      const glyph = DIGITS[ch];
      if (!glyph) {
        cx += 14;
        continue;
      }
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row * 5 + col] === "1") {
            this.fillRect(cx + col * 2, (y | 0) + row * 2, 2, 2, color, false);
          }
        }
      }
      cx += 14;
    }
    this.pushRsx("رقم", x | 0, y | 0, text.length * 14, 14, color);
  }

  pushRsx(op: string, x: number, y: number, w: number, h: number, color: number) {
    this.rsx.push({ op, x, y, w, h, color });
    if (this.rsx.length > 6) this.rsx.shift();
    this.rsxPut++;
    this.rsxGet = this.rsxPut;
  }

  private syscall() {
    const n = this.r[0] | 0;
    const next = (this.pc + 4) >>> 0;
    switch (n) {
      case 0:
        this.exitCode = this.r[3] | 0;
        this.halted = true;
        this.pc = next;
        return;
      case 1:
        this.waiting = true;
        this.resumePc = next;
        return;
      case 2:
        this.clear(this.r[3] | 0);
        break;
      case 3:
        this.fillRect(this.r[3] | 0, this.r[4] | 0, this.r[5] | 0, this.r[6] | 0, this.r[7] | 0);
        break;
      case 4:
        this.drawNumber(this.r[3] | 0, this.r[4] | 0, this.r[5] | 0, this.r[6] | 0);
        break;
      case 5:
        this.r[3] = (Math.random() * 0x7fffffff) | 0;
        break;
      case 6: {
        const i = this.r[3] | 0;
        if (i >= 0 && i < 6) this.spe[i] = Math.max(0, Math.min(100, this.r[4] | 0));
        break;
      }
      case 7:
        this.beep = this.r[3] | 0;
        break;
      default:
        this.fault = `نداء نظام غير معروف: ${n}`;
        this.halted = true;
        return;
    }
    this.pc = next;
  }

  step() {
    if (this.halted) return;
    if (this.waiting) {
      this.waiting = false;
      this.r[3] = this.pad | 0;
      this.pc = this.resumePc >>> 0;
    }
    const pc = this.pc >>> 0;
    const word = this.read32(pc);
    if (this.halted) return;
    const op = word >>> 26;
    let next = (pc + 4) >>> 0;

    const rt = (word >>> 21) & 31;
    const ra = (word >>> 16) & 31;
    const rb = (word >>> 11) & 31;
    const simm = (word << 16) >> 16;

    const ea = (base: number, d: number) => {
      const disp = (d << 16) >> 16;
      return (base === 0 ? disp : (this.r[base]! + disp)) >>> 0;
    };

    switch (op) {
      case 14:
        this.r[rt] = ((ra === 0 ? 0 : this.r[ra]!) + simm) | 0;
        break;
      case 15:
        this.r[rt] = ((ra === 0 ? 0 : this.r[ra]!) + (simm << 16)) | 0;
        break;
      case 7:
        this.r[rt] = Math.imul(this.r[ra]!, simm);
        break;
      case 24:
        this.r[ra] = (this.r[rt]! | (word & 0xffff)) | 0;
        break;
      case 28:
        this.r[ra] = (this.r[rt]! & (word & 0xffff)) | 0;
        this.cr = setCR0(this.cr, this.r[ra]!);
        break;
      case 11: {
        const a = this.r[ra]!;
        this.cr = setCR0(this.cr, a === simm ? 0 : a < simm ? -1 : 1);
        break;
      }
      case 32:
        this.r[rt] = this.read32(ea(ra, word)) | 0;
        break;
      case 34:
        this.r[rt] = this.mem[ea(ra, word)] ?? 0;
        break;
      case 36:
        this.write32(ea(ra, word), this.r[rt]!);
        break;
      case 38:
        this.mem[ea(ra, word)] = this.r[rt]! & 255;
        break;
      case 21: {
        const sh = (word >>> 11) & 31;
        const mb = (word >>> 6) & 31;
        const me = (word >>> 1) & 31;
        const rotated = rotl(this.r[rt]! >>> 0, sh);
        const mask = bitmask(mb, me);
        this.r[ra] = (rotated & mask) | 0;
        break;
      }
      case 18: {
        let li = (word >>> 2) & 0xffffff;
        if (li & 0x800000) li -= 0x1000000;
        if (word & 1) this.lr = next;
        next = (pc + (li << 2)) >>> 0;
        break;
      }
      case 16: {
        const bo = (word >>> 21) & 31;
        const bi = (word >>> 16) & 31;
        let bd = (word >>> 2) & 0x3fff;
        if (bd & 0x2000) bd -= 0x4000;
        const bit = (this.cr >>> (31 - bi)) & 1;
        const take = (bo & 16) !== 0 || (bo === 12 ? bit === 1 : bit === 0);
        if (word & 1) this.lr = next;
        if (take) next = (pc + (bd << 2)) >>> 0;
        break;
      }
      case 17:
        this.cycles++;
        this.syscall();
        return;
      case 19: {
        const xo = (word >>> 1) & 0x3ff;
        if (xo === 16) {
          const target = this.lr >>> 0;
          if (word & 1) this.lr = next;
          next = target;
        } else {
          this.fault = `XO 19/${xo} غير مدعوم`;
          this.halted = true;
          return;
        }
        break;
      }
      case 31: {
        const xo = (word >>> 1) & 0x3ff;
        if (xo === 266) this.r[rt] = (this.r[ra]! + this.r[rb]!) | 0;
        else if (xo === 40) this.r[rt] = (this.r[rb]! - this.r[ra]!) | 0;
        else if (xo === 235) this.r[rt] = Math.imul(this.r[ra]!, this.r[rb]!);
        else if (xo === 28) {
          this.r[ra] = (this.r[rt]! & this.r[rb]!) | 0;
        } else if (xo === 444) {
          this.r[ra] = (this.r[rt]! | this.r[rb]!) | 0;
        } else if (xo === 0) {
          const a = this.r[ra]!;
          const b = this.r[rb]!;
          this.cr = setCR0(this.cr, a === b ? 0 : a < b ? -1 : 1);
        } else if (xo === 339) {
          this.r[rt] = this.lr | 0;
        } else if (xo === 467) {
          this.lr = this.r[rt]! >>> 0;
        } else {
          this.fault = `XO 31/${xo} غير مدعوم @${pc.toString(16)}`;
          this.halted = true;
          return;
        }
        break;
      }
      default:
        this.fault = `تعليمة غير معروفة ${op} @${pc.toString(16)} (${word.toString(16)})`;
        this.halted = true;
        return;
    }
    this.pc = next;
    this.cycles++;
  }

  runFrame(pad: number, budget = 250000) {
    this.pad = pad | 0;
    this.beep = null;
    this.spe = this.spe.map((v) => Math.max(0, v - 18));
    if (this.waiting) {
      this.waiting = false;
      this.r[3] = this.pad | 0;
      this.pc = this.resumePc >>> 0;
    }
    let n = 0;
    while (n < budget && !this.halted && !this.waiting) {
      this.step();
      n++;
    }
    this.frame++;
    return n;
  }
}

function argb(color: number): [number, number, number, number] {
  const c = color >>> 0;
  return [(c >>> 16) & 255, (c >>> 8) & 255, c & 255, (c >>> 24) & 255 || 255];
}

function rotl(value: number, sh: number): number {
  const v = value >>> 0;
  const s = sh & 31;
  if (s === 0) return v;
  return ((v << s) | (v >>> (32 - s))) >>> 0;
}

function bitmask(mb: number, me: number): number {
  let mask = 0;
  for (let i = 0; i < 32; i++) {
    const on = mb <= me ? i >= mb && i <= me : i >= mb || i <= me;
    if (on) mask |= 1 << (31 - i);
  }
  return mask >>> 0;
}
