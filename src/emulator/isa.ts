/** PowerPC user-mode encodings used by سيلون (32-bit, big-endian). */

export function fits16(v: number): boolean {
  const s = v | 0;
  return s >= -32768 && s <= 32767;
}

export function addi(rt: number, ra: number, simm: number): number {
  return ((14 << 26) | (rt << 21) | (ra << 16) | (simm & 0xffff)) >>> 0;
}

export function addis(rt: number, ra: number, simm: number): number {
  return ((15 << 26) | (rt << 21) | (ra << 16) | (simm & 0xffff)) >>> 0;
}

export function ori(ra: number, rs: number, uimm: number): number {
  return ((24 << 26) | (rs << 21) | (ra << 16) | (uimm & 0xffff)) >>> 0;
}

export function andiDot(ra: number, rs: number, uimm: number): number {
  return ((28 << 26) | (rs << 21) | (ra << 16) | (uimm & 0xffff)) >>> 0;
}

export function lwz(rt: number, d: number, ra: number): number {
  return ((32 << 26) | (rt << 21) | (ra << 16) | (d & 0xffff)) >>> 0;
}

export function lbz(rt: number, d: number, ra: number): number {
  return ((34 << 26) | (rt << 21) | (ra << 16) | (d & 0xffff)) >>> 0;
}

export function stw(rs: number, d: number, ra: number): number {
  return ((36 << 26) | (rs << 21) | (ra << 16) | (d & 0xffff)) >>> 0;
}

export function stb(rs: number, d: number, ra: number): number {
  return ((38 << 26) | (rs << 21) | (ra << 16) | (d & 0xffff)) >>> 0;
}

export function mulli(rt: number, ra: number, simm: number): number {
  return ((7 << 26) | (rt << 21) | (ra << 16) | (simm & 0xffff)) >>> 0;
}

export function xop(xo: number, rt: number, ra: number, rb: number, rc = 0): number {
  return ((31 << 26) | (rt << 21) | (ra << 16) | (rb << 11) | (xo << 1) | rc) >>> 0;
}

export function rlwinm(ra: number, rs: number, sh: number, mb: number, me: number): number {
  return (
    ((21 << 26) | (rs << 21) | (ra << 16) | ((sh & 31) << 11) | (mb << 6) | (me << 1)) >>>
    0
  );
}

export function cmpi(ra: number, simm: number): number {
  return ((11 << 26) | (ra << 16) | (simm & 0xffff)) >>> 0;
}

export function cmpw(ra: number, rb: number): number {
  return ((31 << 26) | (ra << 16) | (rb << 11)) >>> 0;
}

export function bForm(delta: number, lk: number): number {
  const li = (delta >> 2) & 0xffffff;
  return ((18 << 26) | (li << 2) | lk) >>> 0;
}

export function bcForm(bo: number, bi: number, delta: number): number {
  const bd = (delta >> 2) & 0x3fff;
  return ((16 << 26) | (bo << 21) | (bi << 16) | (bd << 2)) >>> 0;
}

/** mflr RT — SPR 8, XO 339. */
export function mflr(rt: number): number {
  return ((31 << 26) | (rt << 21) | (8 << 16) | (339 << 1)) >>> 0;
}

/** mtlr RS — SPR 8, XO 467. */
export function mtlr(rs: number): number {
  return ((31 << 26) | (rs << 21) | (8 << 16) | (467 << 1)) >>> 0;
}

export const SC = 0x44000002;
export const BLR = 0x4e800020;
export const NOP = 0x60000000;

export const BO_TRUE = 12;
export const BO_FALSE = 4;
export const BI_LT = 0;
export const BI_GT = 1;
export const BI_EQ = 2;
