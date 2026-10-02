import { assemble, type ProgramImage } from "./asm.ts";

export type CellProgram = {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  hint: string;
  source: string;
  image: ProgramImage;
};

const HEADER = `# ABI سيلون — sc و r0 هو رقم النداء
# 0 خروج (r3)   1 إطار → r3 أزرار   2 مسح (r3 لون)
# 3 مستطيل r3 x r4 y r5 w r6 h r7 لون
# 4 رقم r3 x r4 y r5 قيمة r6 لون
# 5 عشوائي → r3   6 حمل SPE r3 فهرس r4 نسبة   7 نغمة r3
# r31 محجوز للمجمّع
.equ KEY_L 1
.equ KEY_R 2
.equ KEY_U 4
.equ KEY_D 8
.equ KEY_X 16
.equ KEY_START 256
`;

const BREAKOUT = `${HEADER}
.equ COL_BG 0xFF07090D
.equ COL_INK 0xFFE7EEF8
.equ COL_ICE 0xFF5EB0FF
.equ COL_DIM 0xFF243044

.data 0x00100000
ball_x: .word 300
ball_y: .word 300
ball_vx: .word 5
ball_vy: .word -5
pad_x: .word 272
launched: .word 0
score: .word 0
lives: .word 3
over: .word 0
bricks: .space 128

.text 0x00010000
start:
  bl init_bricks
loop:
  bl render
  li r0, 1
  sc
  mr r15, r3
  lw r14, over
  cmpwi r14, 0
  beq playing
  andi. r4, r15, KEY_START
  beq loop
  bl reset_all
  b loop
playing:
  andi. r4, r15, KEY_L
  beq no_left
  lw r5, pad_x
  cmpwi r5, 8
  ble no_left
  addi r5, r5, -12
  sw r5, pad_x
no_left:
  andi. r4, r15, KEY_R
  beq no_right
  lw r5, pad_x
  cmpwi r5, 532
  bge no_right
  addi r5, r5, 12
  sw r5, pad_x
no_right:
  lw r6, launched
  cmpwi r6, 0
  bne do_phys
  lw r5, pad_x
  addi r5, r5, 43
  sw r5, ball_x
  li r5, 310
  sw r5, ball_y
  andi. r4, r15, KEY_X
  beq loop
  li r5, 1
  sw r5, launched
  b loop
do_phys:
  bl physics
  b loop

init_bricks:
  li r20, 0
ib_loop:
  cmpwi r20, 32
  beq ib_done
  slwi r21, r20, 2
  la r22, bricks
  add r22, r22, r21
  li r23, 1
  stw r23, 0(r22)
  addi r20, r20, 1
  b ib_loop
ib_done:
  blr

reset_all:
  mflr r30
  bl init_bricks
  mtlr r30
  li r3, 272
  sw r3, pad_x
  li r3, 0
  sw r3, launched
  sw r3, score
  sw r3, over
  li r3, 3
  sw r3, lives
  li r3, 5
  sw r3, ball_vx
  li r3, -5
  sw r3, ball_vy
  blr

physics:
  li r0, 6
  li r3, 0
  li r4, 86
  sc
  lw r5, ball_x
  lw r6, ball_vx
  add r5, r5, r6
  sw r5, ball_x
  lw r7, ball_y
  lw r8, ball_vy
  add r7, r7, r8
  sw r7, ball_y
  cmpwi r5, 0
  bge no_lx
  li r5, 0
  sw r5, ball_x
  lw r6, ball_vx
  li r9, 0
  sub r6, r9, r6
  sw r6, ball_vx
  li r0, 7
  li r3, 220
  sc
no_lx:
  lw r5, ball_x
  cmpwi r5, 630
  ble no_rx
  li r5, 630
  sw r5, ball_x
  lw r6, ball_vx
  li r9, 0
  sub r6, r9, r6
  sw r6, ball_vx
  li r0, 7
  li r3, 220
  sc
no_rx:
  lw r7, ball_y
  cmpwi r7, 0
  bge no_ty
  li r7, 0
  sw r7, ball_y
  lw r8, ball_vy
  li r9, 0
  sub r8, r9, r8
  sw r8, ball_vy
no_ty:
  lw r7, ball_y
  cmpwi r7, 348
  ble no_by
  lw r4, lives
  addi r4, r4, -1
  sw r4, lives
  li r5, 0
  sw r5, launched
  cmpwi r4, 0
  bne no_by
  li r6, 1
  sw r6, over
  blr
no_by:
  lw r5, ball_x
  lw r7, ball_y
  lw r8, pad_x
  addi r9, r7, 10
  cmpwi r9, 328
  ble no_pad
  cmpwi r7, 342
  bge no_pad
  addi r10, r5, 10
  cmpw r10, r8
  ble no_pad
  addi r11, r8, 96
  cmpw r5, r11
  bge no_pad
  li r12, 316
  sw r12, ball_y
  lw r8, ball_vy
  cmpwi r8, 0
  ble no_pad
  li r9, 0
  sub r8, r9, r8
  sw r8, ball_vy
  li r0, 7
  li r3, 330
  sc
no_pad:
  li r20, 0
br_loop:
  cmpwi r20, 32
  beq br_done
  slwi r21, r20, 2
  la r22, bricks
  add r22, r22, r21
  lwz r23, 0(r22)
  cmpwi r23, 0
  beq br_next
  andi. r24, r20, 7
  srwi r25, r20, 3
  mulli r26, r24, 76
  addi r26, r26, 16
  mulli r27, r25, 22
  addi r27, r27, 36
  lw r5, ball_x
  lw r7, ball_y
  addi r10, r5, 10
  addi r11, r26, 70
  cmpw r10, r26
  ble br_next
  cmpw r5, r11
  bge br_next
  addi r10, r7, 10
  addi r11, r27, 16
  cmpw r10, r27
  ble br_next
  cmpw r7, r11
  bge br_next
  li r23, 0
  stw r23, 0(r22)
  lw r9, score
  addi r9, r9, 1
  sw r9, score
  lw r8, ball_vy
  li r3, 0
  sub r8, r3, r8
  sw r8, ball_vy
  li r0, 7
  li r3, 520
  sc
  li r0, 6
  li r3, 2
  li r4, 100
  sc
  cmpwi r9, 32
  bne br_done
  li r6, 2
  sw r6, over
  b br_done
br_next:
  addi r20, r20, 1
  b br_loop
br_done:
  blr

render:
  li r0, 6
  li r3, 1
  li r4, 64
  sc
  li r0, 2
  li r3, COL_BG
  sc
  li r20, 0
rd_loop:
  cmpwi r20, 32
  beq rd_done
  slwi r21, r20, 2
  la r22, bricks
  add r22, r22, r21
  lwz r23, 0(r22)
  cmpwi r23, 0
  beq rd_next
  andi. r24, r20, 7
  srwi r25, r20, 3
  mulli r26, r24, 76
  addi r26, r26, 16
  mulli r27, r25, 22
  addi r27, r27, 36
  cmpwi r25, 0
  bne row1
  li r7, COL_ICE
  b row_set
row1:
  cmpwi r25, 1
  bne row2
  li r7, 0xFF8AA4C8
  b row_set
row2:
  cmpwi r25, 2
  bne row3
  li r7, 0xFFB7C3D6
  b row_set
row3:
  li r7, COL_INK
row_set:
  li r0, 3
  mr r3, r26
  mr r4, r27
  li r5, 70
  li r6, 16
  sc
rd_next:
  addi r20, r20, 1
  b rd_loop
rd_done:
  lw r3, pad_x
  li r0, 3
  li r4, 328
  li r5, 96
  li r6, 10
  li r7, COL_INK
  sc
  lw r3, ball_x
  lw r4, ball_y
  li r0, 3
  li r5, 10
  li r6, 10
  li r7, COL_ICE
  sc
  li r0, 4
  li r3, 16
  li r4, 10
  lw r5, score
  li r6, COL_INK
  sc
  li r0, 4
  li r3, 560
  li r4, 10
  lw r5, lives
  li r6, COL_ICE
  sc
  blr
`;

const SNAKE = `${HEADER}
.equ COL_BG 0xFF07090D
.equ COL_INK 0xFFE7EEF8
.equ COL_ICE 0xFF5EB0FF
.equ COL_DIM 0xFF243044

.data 0x00100000
dir: .word 1
len: .word 4
score: .word 0
tick: .word 0
alive: .word 1
over: .word 0
fx: .word 12
fy: .word 8
head: .word 3
body: .space 1024

.text 0x00010000
start:
  bl place_body
loop:
  bl render
  li r0, 1
  sc
  mr r15, r3
  lw r14, alive
  cmpwi r14, 0
  bne living
  andi. r4, r15, KEY_START
  beq loop
  bl place_body
  li r3, 1
  sw r3, alive
  li r3, 0
  sw r3, over
  sw r3, score
  li r3, 1
  sw r3, dir
  li r3, 4
  sw r3, len
  li r3, 12
  sw r3, fx
  li r3, 8
  sw r3, fy
  b loop
living:
  andi. r4, r15, KEY_L
  beq sk_l
  lw r5, dir
  cmpwi r5, 1
  beq sk_l
  li r6, 0
  sw r6, dir
sk_l:
  andi. r4, r15, KEY_R
  beq sk_r
  lw r5, dir
  cmpwi r5, 0
  beq sk_r
  li r6, 1
  sw r6, dir
sk_r:
  andi. r4, r15, KEY_U
  beq sk_u
  lw r5, dir
  cmpwi r5, 3
  beq sk_u
  li r6, 2
  sw r6, dir
sk_u:
  andi. r4, r15, KEY_D
  beq sk_d
  lw r5, dir
  cmpwi r5, 2
  beq sk_d
  li r6, 3
  sw r6, dir
sk_d:
  lw r16, tick
  addi r16, r16, 1
  sw r16, tick
  andi. r4, r16, 7
  bne loop
  bl advance
  b loop

place_body:
  li r20, 0
  li r21, 8
pb:
  cmpwi r20, 4
  beq pb_done
  slwi r22, r20, 2
  la r23, body
  add r23, r23, r22
  slwi r24, r21, 16
  or r24, r24, r20
  stw r24, 0(r23)
  addi r20, r20, 1
  b pb
pb_done:
  li r3, 3
  sw r3, head
  blr

advance:
  li r0, 6
  li r3, 3
  li r4, 92
  sc
  lw r20, head
  slwi r21, r20, 2
  la r22, body
  add r22, r22, r21
  lwz r23, 0(r22)
  andi. r24, r23, 255
  srwi r25, r23, 16
  lw r26, dir
  cmpwi r26, 0
  bne dir_r
  addi r24, r24, -1
dir_r:
  cmpwi r26, 1
  bne dir_u
  addi r24, r24, 1
dir_u:
  cmpwi r26, 2
  bne dir_d
  addi r25, r25, -1
dir_d:
  cmpwi r26, 3
  bne bounds
  addi r25, r25, 1
bounds:
  cmpwi r24, 0
  blt die
  cmpwi r24, 31
  bgt die
  cmpwi r25, 0
  blt die
  cmpwi r25, 15
  bgt die
  lw r18, fx
  lw r19, fy
  li r17, 0
  cmpw r24, r18
  bne not_eat
  cmpw r25, r19
  bne not_eat
  li r17, 1
not_eat:
  lw r27, len
  li r28, 1
self:
  cmpw r28, r27
  bge self_ok
  cmpwi r17, 0
  bne skip_tail
  addi r29, r27, -1
  cmpw r28, r29
  beq self_next
skip_tail:
  sub r10, r20, r28
  andi. r10, r10, 255
  slwi r11, r10, 2
  la r12, body
  add r12, r12, r11
  lwz r11, 0(r12)
  andi. r12, r11, 255
  cmpw r12, r24
  bne self_next
  srwi r11, r11, 16
  cmpw r11, r25
  beq die
self_next:
  addi r28, r28, 1
  b self
self_ok:
  addi r20, r20, 1
  andi. r20, r20, 255
  sw r20, head
  slwi r21, r20, 2
  la r22, body
  add r22, r22, r21
  slwi r23, r25, 16
  or r23, r23, r24
  stw r23, 0(r22)
  cmpwi r17, 0
  beq no_grow
  lw r3, len
  addi r3, r3, 1
  sw r3, len
  lw r3, score
  addi r3, r3, 1
  sw r3, score
  li r0, 7
  li r3, 440
  sc
  li r0, 5
  sc
  andi. r4, r3, 31
  sw r4, fx
  srwi r5, r3, 8
  andi. r5, r5, 15
  sw r5, fy
no_grow:
  blr
die:
  li r3, 0
  sw r3, alive
  li r3, 1
  sw r3, over
  li r0, 7
  li r3, 110
  sc
  blr

render:
  li r0, 6
  li r3, 4
  li r4, 50
  sc
  li r0, 2
  li r3, COL_BG
  sc
  lw r20, head
  lw r27, len
  li r28, 0
sg:
  cmpw r28, r27
  bge sg_done
  sub r10, r20, r28
  andi. r10, r10, 255
  slwi r11, r10, 2
  la r12, body
  add r12, r12, r11
  lwz r11, 0(r12)
  andi. r3, r11, 255
  srwi r4, r11, 16
  mulli r3, r3, 20
  mulli r4, r4, 20
  addi r4, r4, 28
  li r0, 3
  li r5, 16
  li r6, 16
  cmpwi r28, 0
  bne body_col
  li r7, COL_ICE
  b sg_draw
body_col:
  li r7, COL_INK
sg_draw:
  sc
  addi r28, r28, 1
  b sg
sg_done:
  lw r3, fx
  lw r4, fy
  mulli r3, r3, 20
  addi r3, r3, 4
  mulli r4, r4, 20
  addi r4, r4, 32
  li r0, 3
  li r5, 8
  li r6, 8
  li r7, COL_ICE
  sc
  li r0, 4
  li r3, 16
  li r4, 6
  lw r5, score
  li r6, COL_INK
  sc
  blr
`;

function orbitSource(): string {
  const samples: number[] = [];
  for (let i = 0; i < 64; i++) {
    samples.push(Math.round(Math.sin((i / 64) * Math.PI * 2) * 120));
  }
  return `${HEADER}
.equ COL_BG 0xFF07090D
.equ COL_INK 0xFFE7EEF8
.equ COL_ICE 0xFF5EB0FF

.data 0x00100000
angle: .word 0
score: .word 0
over: .word 0
sintab:
${samples.map((n) => `  .word ${n}`).join("\n")}

.text 0x00010000
start:
loop:
  bl render
  li r0, 1
  sc
  lw r3, angle
  addi r3, r3, 1
  andi. r3, r3, 63
  sw r3, angle
  lw r4, score
  addi r4, r4, 1
  sw r4, score
  li r0, 6
  li r3, 5
  li r4, 77
  sc
  b loop

render:
  li r0, 2
  li r3, COL_BG
  sc
  li r20, 0
body:
  cmpwi r20, 3
  beq done
  lw r21, angle
  mulli r22, r20, 21
  add r21, r21, r22
  andi. r21, r21, 63
  slwi r23, r21, 2
  la r24, sintab
  add r24, r24, r23
  lwz r25, 0(r24)
  li r7, 320
  add r3, r7, r25
  addi r3, r3, -14
  addi r26, r21, 16
  andi. r26, r26, 63
  slwi r27, r26, 2
  la r28, sintab
  add r28, r28, r27
  lwz r29, 0(r28)
  li r8, 180
  add r4, r8, r29
  addi r4, r4, -14
  li r0, 3
  li r5, 32
  li r6, 32
  cmpwi r20, 0
  bne c1
  li r7, COL_ICE
  b draw
c1:
  cmpwi r20, 1
  bne c2
  li r7, COL_INK
  b draw
c2:
  li r7, 0xFF8AA4C8
draw:
  sc
  addi r20, r20, 1
  b body
done:
  li r0, 4
  li r3, 16
  li r4, 16
  lw r5, angle
  li r6, COL_INK
  sc
  blr
`;
}

function build(id: string, title: string, kicker: string, summary: string, hint: string, source: string): CellProgram {
  return { id, title, kicker, summary, hint, source, image: assemble(source) };
}

export const PROGRAMS: CellProgram[] = [
  build(
    "breakout",
    "جدار النور",
    "برنامج منزلي",
    "منطق المضرب والكرة والطوب مكتوب بتعليمات PowerPC، لا بجافاسكربت اللعبة.",
    "يسار ويمين، ✕ يطلق، ابدأ يعيد",
    BREAKOUT,
  ),
  build(
    "snake",
    "ثعبان الخلية",
    "برنامج منزلي",
    "الجسم حلقة في ذاكرة الضيف. المعالج يفحص الجدار والذات كل ثماني إطارات.",
    "الأسهم للاتجاه، ابدأ بعد الخسارة",
    SNAKE,
  ),
  build(
    "orbit",
    "مدار",
    "عرض بصري",
    "جدول جيب في قسم البيانات. النواة تقرأ العينة وتحرّك ثلاثة أجسام.",
    "يعمل وحده. المنقّح يكشف الحلقة.",
    orbitSource(),
  ),
];

export function programById(id: string): CellProgram {
  return PROGRAMS.find((p) => p.id === id) ?? PROGRAMS[0]!;
}
