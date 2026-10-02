import { assemble } from "./asm.ts";
import { KEY_R, KEY_X, Machine } from "./machine.ts";
import { PROGRAMS } from "./programs.ts";

const ARITH = `
.text 0x00010000
start:
  li r3, 20
  li r4, 22
  add r5, r3, r4
  sub r6, r5, r3
  li r7, 0
  sw r5, slot
  lw r8, slot
  bl child
  b halt
child:
  addi r9, r9, 1
  blr
halt:
  li r0, 0
  mr r3, r5
  sc
.data 0x00100000
slot: .word 0
`;

const BRANCH = `
.text 0x00010000
start:
  li r3, 0
  li r4, 0
loop:
  addi r4, r4, 1
  cmpwi r4, 5
  bne loop
  addi r3, r3, 7
  li r0, 0
  sc
`;

export type TestReport = { ok: boolean; lines: string[] };

export function runSelfTest(): TestReport {
  const lines: string[] = [];
  const fail = (m: string) => {
    lines.push(m);
    return { ok: false, lines };
  };
  try {
    const arith = new Machine();
    arith.load(assemble(ARITH));
    for (let i = 0; i < 40 && !arith.halted; i++) arith.step();
    if (!arith.halted || arith.exitCode !== 42) return fail(`حساب: خرج ${arith.exitCode} توقف ${arith.halted} ${arith.fault}`);
    if ((arith.r[6] | 0) !== 22 || (arith.r[8] | 0) !== 42 || (arith.r[9] | 0) !== 1) {
      return fail(`سجلات: r6=${arith.r[6]} r8=${arith.r[8]} r9=${arith.r[9]}`);
    }
    lines.push("جمع وطرح وذاكرة وربط: ٤٢");

    const br = new Machine();
    br.load(assemble(BRANCH));
    for (let i = 0; i < 80 && !br.halted; i++) br.step();
    if ((br.r[3] | 0) !== 7 || (br.r[4] | 0) !== 5) return fail(`تفرع: r3=${br.r[3]} r4=${br.r[4]} ${br.fault}`);
    lines.push("تفرع شرطي: خمس لفات");

    const wall = PROGRAMS[0]!;
    const game = new Machine();
    game.load(wall.image);
    game.runFrame(0);
    if (game.halted) return fail(`جدار توقف: ${game.fault}`);
    if (!game.waiting) return fail("جدار لم يطلب إطارًا");
    const pad0 = game.symbol("pad_x");
    game.runFrame(KEY_R);
    game.runFrame(KEY_R);
    if (game.symbol("pad_x") <= pad0) return fail(`المضرب لم يتحرك ${pad0} → ${game.symbol("pad_x")}`);
    game.runFrame(KEY_X);
    const y0 = game.symbol("ball_y");
    game.runFrame(0);
    if (game.symbol("launched") !== 1) return fail("الكرة لم تنطلق");
    if (game.symbol("ball_y") === y0) return fail("الكرة لم تتحرّك");
    lines.push("جدار النور يُنفَّذ على النواة");

    const snake = new Machine();
    snake.load(PROGRAMS[1]!.image);
    for (let i = 0; i < 12; i++) snake.runFrame(0);
    if (snake.halted) return fail(`ثعبان: ${snake.fault}`);
    if (snake.symbol("alive") !== 1) return fail("الثعبان مات مبكرًا");
    lines.push("ثعبان الخلية حيّ على النواة");

    const orbit = new Machine();
    orbit.load(PROGRAMS[2]!.image);
    orbit.runFrame(0);
    orbit.runFrame(0);
    if (orbit.halted) return fail(`مدار: ${orbit.fault}`);
    if (orbit.symbol("angle") === 0 && orbit.frame > 1) return fail("زاوية المدار لم تتقدم");
    lines.push("مدار يقرأ جدول الجيب");
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  lines.push("مجموعة الأوامر سليمة");
  return { ok: true, lines };
}
