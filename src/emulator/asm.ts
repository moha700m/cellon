import {
  BI_EQ,
  BI_GT,
  BI_LT,
  BLR,
  BO_FALSE,
  BO_TRUE,
  NOP,
  SC,
  addi,
  addis,
  andiDot,
  bForm,
  bcForm,
  cmpi,
  cmpw,
  fits16,
  lbz,
  lwz,
  mflr,
  mtlr,
  mulli,
  ori,
  rlwinm,
  stb,
  stw,
  xop,
} from "./isa.ts";

export type ListingLine = {
  addr: number;
  end: number;
  text: string;
};

export type Chunk = { addr: number; data: Uint8Array };

export type ProgramImage = {
  entry: number;
  symbols: Map<string, number>;
  chunks: Chunk[];
  listing: ListingLine[];
};

class AsmError extends Error {
  constructor(line: number, message: string) {
    super(`سطر ${line}: ${message}`);
    this.name = "AsmError";
  }
}

type Section = "text" | "data";

type Item =
  | { kind: "bytes"; sec: Section; addr: number; data: number[]; text: string }
  | { kind: "op"; addr: number; size: number; text: string; mnem: string; args: string[] };

const TEMP = 31;

function parseNumber(token: string): number | null {
  if (/^-?\d+$/.test(token)) return Number(token) | 0;
  if (/^0x[0-9a-f]+$/i.test(token)) return Number(token) >>> 0;
  return null;
}

function reg(token: string, line: number): number {
  const m = /^r(\d{1,2})$/.exec(token);
  if (!m) throw new AsmError(line, `سجل غير مفهوم: ${token}`);
  const n = Number(m[1]);
  if (n > 31) throw new AsmError(line, `سجل خارج المدى: ${token}`);
  return n;
}

function relocate(token: string, symbols: Map<string, number>, line: number): number {
  const at = token.indexOf("@");
  const name = at === -1 ? token : token.slice(0, at);
  const mode = at === -1 ? "" : token.slice(at + 1);
  if (!symbols.has(name)) throw new AsmError(line, `رمز غير معرّف: ${name}`);
  const addr = symbols.get(name)! >>> 0;
  if (mode === "" ) return addr;
  if (mode === "ha") return ((addr + 0x8000) >>> 16) & 0xffff;
  if (mode === "l") return addr & 0xffff;
  throw new AsmError(line, `لاحقة غير معروفة: @${mode}`);
}

function resolve(token: string, symbols: Map<string, number>, line: number): number {
  const n = parseNumber(token);
  if (n !== null) return n;
  return relocate(token, symbols, line);
}

function tryResolve(token: string, symbols: Map<string, number>): number | null {
  const n = parseNumber(token);
  if (n !== null) return n;
  const name = token.split("@")[0] ?? token;
  if (!symbols.has(name)) return null;
  try {
    return relocate(token, symbols, 0);
  } catch {
    return null;
  }
}

function liSize(token: string, symbols: Map<string, number>): number {
  const v = tryResolve(token, symbols);
  if (v === null) return 8;
  return fits16(v) ? 4 : 8;
}

function splitArgs(rest: string): string[] {
  if (!rest.trim()) return [];
  return rest.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Assemble a سيلون program. r31 is the assembler temporary — do not use it. */
export function assemble(source: string): ProgramImage {
  const symbols = new Map<string, number>();
  const items: Item[] = [];
  const raw = source.replace(/\r/g, "").split("\n");

  let sec: Section = "text";
  const cur = {
    text: 0x00010000,
    data: 0x00100000,
  };

  const define = (name: string, addr: number, line: number) => {
    if (!/^[A-Za-z_.][\w.]*$/.test(name)) throw new AsmError(line, `اسم غير صالح: ${name}`);
    if (symbols.has(name)) throw new AsmError(line, `الرمز مكرر: ${name}`);
    symbols.set(name, addr >>> 0);
  };

  raw.forEach((original, idx) => {
    const lineNo = idx + 1;
    let line = original.split("#")[0] ?? "";
    line = line.split("//")[0] ?? "";
    line = line.trim();
    if (!line) return;

    if (line.includes(":")) {
      const colon = line.indexOf(":");
      const name = line.slice(0, colon).trim();
      const rest = line.slice(colon + 1).trim();
      if (name) define(name, cur[sec], lineNo);
      line = rest;
      if (!line) return;
    }

    if (line.startsWith(".")) {
      const [dir, ...restParts] = line.split(/\s+/);
      const arg = restParts.join(" ");
      if (dir === ".text" || dir === ".data") {
        sec = dir === ".text" ? "text" : "data";
        if (arg) {
          const n = parseNumber(arg);
          if (n === null) throw new AsmError(lineNo, `عنوان غير صالح: ${arg}`);
          cur[sec] = n >>> 0;
        }
        return;
      }
      if (dir === ".equ") {
        const [name, value] = arg.split(/[\s,]+/);
        if (!name || !value) throw new AsmError(lineNo, ".equ يحتاج اسمًا وقيمة");
        const n = parseNumber(value);
        if (n === null) throw new AsmError(lineNo, `قيمة .equ غير صالحة: ${value}`);
        define(name, n, lineNo);
        return;
      }
      if (dir === ".word") {
        const n = resolve(arg.trim(), symbols, lineNo) >>> 0;
        const addr = cur[sec];
        items.push({
          kind: "bytes",
          sec,
          addr,
          data: [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255],
          text: original.trim(),
        });
        cur[sec] = addr + 4;
        return;
      }
      if (dir === ".space") {
        const n = parseNumber(arg.trim());
        if (n === null || n < 0) throw new AsmError(lineNo, ".space يحتاج حجمًا");
        const addr = cur[sec];
        items.push({ kind: "bytes", sec, addr, data: Array(n).fill(0), text: original.trim() });
        cur[sec] = addr + n;
        return;
      }
      throw new AsmError(lineNo, `توجيه غير معروف: ${dir}`);
    }

    if (sec !== "text") throw new AsmError(lineNo, "التعليمات تُكتب داخل .text");
    const sp = line.indexOf(" ");
    const mnem = (sp === -1 ? line : line.slice(0, sp)).toLowerCase();
    const args = splitArgs(sp === -1 ? "" : line.slice(sp + 1));
    let size = 4;
    if (mnem === "li") size = liSize(args[1] ?? "0", symbols);
    else if (mnem === "la") size = 8;
    else if (mnem === "lw" || mnem === "sw") size = 12;
    const addr = cur.text;
    items.push({ kind: "op", addr, size, text: original.trim(), mnem, args });
    cur.text = addr + size;
  });

  const listing: ListingLine[] = [];
  const bytes = new Map<number, number>();

  const place = (addr: number, words: number[]) => {
    words.forEach((word, i) => {
      const a = addr + i * 4;
      bytes.set(a, (word >>> 24) & 255);
      bytes.set(a + 1, (word >>> 16) & 255);
      bytes.set(a + 2, (word >>> 8) & 255);
      bytes.set(a + 3, word & 255);
    });
  };

  const emit = (item: Extract<Item, { kind: "op" }>, words: number[]) => {
    if (words.length * 4 !== item.size) {
      throw new Error(`حجم غير متوقع عند ${item.text}: ${words.length * 4} != ${item.size}`);
    }
    place(item.addr, words);
    listing.push({ addr: item.addr, end: item.addr + item.size, text: item.text });
  };

  const hiLo = (value: number) => {
    const v = value >>> 0;
    return [(v >>> 16) & 0xffff, v & 0xffff] as const;
  };

  for (const item of items) {
    if (item.kind === "bytes") {
      item.data.forEach((b, i) => bytes.set(item.addr + i, b & 255));
      continue;
    }
    const { mnem, args, addr } = item;
    const lineNo = 0;
    const need = (n: number) => {
      if (args.length !== n) throw new Error(`${item.text}: العدد المتوقع للوسائط ${n}`);
    };
    const imm = (token: string) => resolve(token, symbols, lineNo);
    const branchDelta = (token: string) => {
      const target = resolve(token, symbols, lineNo) >>> 0;
      return (target - addr) | 0;
    };

    switch (mnem) {
      case "nop":
        emit(item, [NOP]);
        break;
      case "sc":
        emit(item, [SC]);
        break;
      case "blr":
        emit(item, [BLR]);
        break;
      case "li": {
        need(2);
        const rt = reg(args[0]!, lineNo);
        const value = imm(args[1]!);
        if (item.size === 4) emit(item, [addi(rt, 0, value)]);
        else {
          const [hi, lo] = hiLo(value);
          emit(item, [addis(rt, 0, hi), ori(rt, rt, lo)]);
        }
        break;
      }
      case "la": {
        need(2);
        const rt = reg(args[0]!, lineNo);
        const [hi, lo] = hiLo(imm(args[1]!));
        emit(item, [addis(rt, 0, hi), ori(rt, rt, lo)]);
        break;
      }
      case "lw": {
        need(2);
        const rt = reg(args[0]!, lineNo);
        const [hi, lo] = hiLo(imm(args[1]!));
        emit(item, [addis(rt, 0, hi), ori(rt, rt, lo), lwz(rt, 0, rt)]);
        break;
      }
      case "sw": {
        need(2);
        const rs = reg(args[0]!, lineNo);
        const [hi, lo] = hiLo(imm(args[1]!));
        emit(item, [addis(TEMP, 0, hi), ori(TEMP, TEMP, lo), stw(rs, 0, TEMP)]);
        break;
      }
      case "lis":
        need(2);
        emit(item, [addis(reg(args[0]!, lineNo), 0, imm(args[1]!))]);
        break;
      case "addi":
        need(3);
        emit(item, [addi(reg(args[0]!, lineNo), reg(args[1]!, lineNo), imm(args[2]!))]);
        break;
      case "mulli":
        need(3);
        emit(item, [mulli(reg(args[0]!, lineNo), reg(args[1]!, lineNo), imm(args[2]!))]);
        break;
      case "add":
        need(3);
        emit(item, [xop(266, reg(args[0]!, lineNo), reg(args[1]!, lineNo), reg(args[2]!, lineNo))]);
        break;
      case "sub":
        need(3);
        emit(item, [xop(40, reg(args[0]!, lineNo), reg(args[2]!, lineNo), reg(args[1]!, lineNo))]);
        break;
      case "and":
        need(3);
        emit(item, [xop(28, reg(args[1]!, lineNo), reg(args[0]!, lineNo), reg(args[2]!, lineNo), 0)]);
        break;
      case "or":
        need(3);
        emit(item, [xop(444, reg(args[1]!, lineNo), reg(args[0]!, lineNo), reg(args[2]!, lineNo), 0)]);
        break;
      case "mr":
        need(2);
        emit(item, [ori(reg(args[0]!, lineNo), reg(args[1]!, lineNo), 0)]);
        break;
      case "ori":
        need(3);
        emit(item, [ori(reg(args[0]!, lineNo), reg(args[1]!, lineNo), imm(args[2]!))]);
        break;
      case "andi.":
        need(3);
        emit(item, [andiDot(reg(args[0]!, lineNo), reg(args[1]!, lineNo), imm(args[2]!))]);
        break;
      case "lwz":
      case "lbz":
      case "stw":
      case "stb": {
        need(2);
        const mem = /^(-?\d+)\((r\d{1,2})\)$/.exec(args[1]!);
        if (!mem) throw new Error(`${item.text}: الصيغة المتوقعة 0(rN)`);
        const d = Number(mem[1]);
        const ra = reg(mem[2]!, lineNo);
        const rt = reg(args[0]!, lineNo);
        const word =
          mnem === "lwz"
            ? lwz(rt, d, ra)
            : mnem === "lbz"
              ? lbz(rt, d, ra)
              : mnem === "stw"
                ? stw(rt, d, ra)
                : stb(rt, d, ra);
        emit(item, [word]);
        break;
      }
      case "slwi": {
        need(3);
        const n = imm(args[2]!) & 31;
        emit(item, [rlwinm(reg(args[0]!, lineNo), reg(args[1]!, lineNo), n, 0, 31 - n)]);
        break;
      }
      case "srwi": {
        need(3);
        const n = imm(args[2]!) & 31;
        const sh = (32 - n) & 31;
        emit(item, [rlwinm(reg(args[0]!, lineNo), reg(args[1]!, lineNo), sh, n, 31)]);
        break;
      }
      case "cmpwi":
        need(2);
        emit(item, [cmpi(reg(args[0]!, lineNo), imm(args[1]!))]);
        break;
      case "cmpw":
        need(2);
        emit(item, [cmpw(reg(args[0]!, lineNo), reg(args[1]!, lineNo))]);
        break;
      case "mflr":
        need(1);
        emit(item, [mflr(reg(args[0]!, lineNo))]);
        break;
      case "mtlr":
        need(1);
        emit(item, [mtlr(reg(args[0]!, lineNo))]);
        break;
      case "b":
      case "bl":
        need(1);
        emit(item, [bForm(branchDelta(args[0]!), mnem === "bl" ? 1 : 0)]);
        break;
      case "beq":
      case "bne":
      case "blt":
      case "bgt":
      case "ble":
      case "bge": {
        need(1);
        const table: Record<string, [number, number]> = {
          beq: [BO_TRUE, BI_EQ],
          bne: [BO_FALSE, BI_EQ],
          blt: [BO_TRUE, BI_LT],
          bgt: [BO_TRUE, BI_GT],
          ble: [BO_FALSE, BI_GT],
          bge: [BO_FALSE, BI_LT],
        };
        const [bo, bi] = table[mnem]!;
        emit(item, [bcForm(bo, bi, branchDelta(args[0]!))]);
        break;
      }
      default:
        throw new Error(`تعليمة غير مدعومة: ${item.text}`);
    }
  }

  const addrs = [...bytes.keys()];
  if (addrs.length === 0) throw new Error("البرنامج فارغ");
  addrs.sort((a, b) => a - b);
  const chunks: Chunk[] = [];
  let start = addrs[0]!;
  let prev = start - 1;
  let buf: number[] = [];
  const flush = () => {
    if (buf.length) chunks.push({ addr: start, data: Uint8Array.from(buf) });
  };
  for (const a of addrs) {
    if (a !== prev + 1) {
      flush();
      start = a;
      buf = [];
    }
    buf.push(bytes.get(a)!);
    prev = a;
  }
  flush();

  const entry = symbols.get("start") ?? cur.text;
  return { entry: symbols.get("start") ?? items.find((i) => i.kind === "op")?.addr ?? entry, symbols, chunks, listing };
}
