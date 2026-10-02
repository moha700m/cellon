import { useEffect, useRef, useState } from "react";
import {
  Bug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Disc,
  Pause,
  Play,
  Power,
  RotateCcw,
  Square,
  StepForward,
  Triangle,
  X,
} from "lucide-react";
import { assemble } from "@/emulator/asm";
import {
  FB_H,
  FB_W,
  KEY_D,
  KEY_L,
  KEY_O,
  KEY_R,
  KEY_S,
  KEY_START,
  KEY_T,
  KEY_U,
  KEY_X,
  Machine,
} from "@/emulator/machine";
import { PROGRAMS, programById, type CellProgram } from "@/emulator/programs";
import { runSelfTest } from "@/emulator/selftest";

type Screen = "boot" | "shell" | "play" | "arch";

const KEYS: Record<string, number> = {
  ArrowLeft: KEY_L,
  ArrowRight: KEY_R,
  ArrowUp: KEY_U,
  ArrowDown: KEY_D,
  KeyA: KEY_L,
  KeyD: KEY_R,
  KeyW: KEY_U,
  KeyS: KEY_D,
  KeyJ: KEY_X,
  KeyK: KEY_O,
  KeyU: KEY_S,
  KeyI: KEY_T,
  Enter: KEY_START,
  Space: KEY_X,
};

function tone(freq: number) {
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = tone.ctx ?? new Ctx();
    tone.ctx = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = Math.max(40, Math.min(2000, freq));
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    /* الصوت اختياري */
  }
}
tone.ctx = null as AudioContext | null;

function paint(canvas: HTMLCanvasElement | null, machine: Machine, cache: { img: ImageData | null }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (!cache.img) cache.img = ctx.createImageData(FB_W, FB_H);
  cache.img.data.set(machine.fb);
  ctx.putImageData(cache.img, 0, 0);
}

function LiveCanvas({ program }: { program: CellProgram }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const machine = new Machine();
    machine.load(program.image);
    const cache = { img: null as ImageData | null };
    let raf = 0;
    const loop = () => {
      machine.runFrame(0);
      paint(canvas, machine, cache);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [program]);
  return (
    <canvas
      ref={ref}
      width={FB_W}
      height={FB_H}
      className="block aspect-video w-full bg-deep"
      aria-label={`معاينة ${program.title}`}
    />
  );
}

const machineBridge: {
  machine: Machine | null;
  paint: (() => void) | null;
} = { machine: null, paint: null };

function PadButton({
  label,
  bit,
  held,
  children,
}: {
  label: string;
  bit: number;
  held: { current: number };
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-12 items-center justify-center rounded-full border border-line bg-panel text-fg active:bg-ice active:text-bg"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        held.current = (held.current ?? 0) | bit;
      }}
      onPointerUp={() => {
        held.current = (held.current ?? 0) & ~bit;
      }}
      onPointerCancel={() => {
        held.current = (held.current ?? 0) & ~bit;
      }}
    >
      {children}
    </button>
  );
}

function Stage({
  program,
  paused,
  debug,
  held,
  onRev,
}: {
  program: CellProgram;
  paused: boolean;
  debug: boolean;
  held: { current: number };
  onRev: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const rateRef = useRef<HTMLSpanElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const pausedRef = useRef(paused);
  const debugRef = useRef(debug);
  const onRevRef = useRef(onRev);
  const bestMem = useRef(0);
  pausedRef.current = paused;
  debugRef.current = debug;
  onRevRef.current = onRev;

  useEffect(() => {
    bestMem.current = Number(localStorage.getItem(`cellon:${program.id}`) || 0) || 0;
    if (bestRef.current) bestRef.current.textContent = String(bestMem.current);
    const machine = new Machine();
    machine.load(program.image);
    machineBridge.machine = machine;
    const cache = { img: null as ImageData | null };
    machineBridge.paint = () => paint(canvasRef.current, machine, cache);
    let raf = 0;
    let tick = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (pausedRef.current) return;
      const used = machine.runFrame(held.current ?? 0);
      paint(canvasRef.current, machine, cache);
      if (machine.beep) tone(machine.beep);
      const score = machine.symbol("score");
      if (scoreRef.current) scoreRef.current.textContent = String(score);
      if (score > bestMem.current) {
        bestMem.current = score;
        localStorage.setItem(`cellon:${program.id}`, String(score));
        if (bestRef.current) bestRef.current.textContent = String(score);
      }
      if (rateRef.current) rateRef.current.textContent = String(used);
      const over = machine.symbol("over");
      const banner = bannerRef.current;
      if (banner) {
        if (machine.halted) {
          banner.hidden = false;
          banner.textContent = machine.fault || "توقفت النواة";
        } else if (over === 2) {
          banner.hidden = false;
          banner.textContent = "اكتمل الحقل";
        } else if (over === 1) {
          banner.hidden = false;
          banner.textContent = "انتهت المحاولة — ابدأ يعيد";
        } else banner.hidden = true;
      }
      tick++;
      if (debugRef.current && tick % 8 === 0) onRevRef.current();
    };
    paint(canvasRef.current, machine, cache);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      machineBridge.machine = null;
      machineBridge.paint = null;
    };
  }, [held, program]);

  return (
    <>
    <div className="relative overflow-hidden rounded-xl border border-line bg-deep">
      <canvas
        ref={canvasRef}
        width={FB_W}
        height={FB_H}
        className="block aspect-video w-full"
        aria-label={program.title}
      />
      <div className="screen-glass pointer-events-none absolute inset-0" />
      <p
        ref={bannerRef}
        hidden
        className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-panel px-4 py-2 text-sm text-fg"
      />
    </div>
    <div className="flex items-center justify-between font-mono text-xs text-muted">
      <span>
        نتيجة <span ref={scoreRef} className="text-fg">0</span>
      </span>
      <span>
        أفضل <span ref={bestRef} className="text-fg">0</span>
      </span>
      <span>
        تعليمة/إطار <span ref={rateRef}>0</span>
      </span>
    </div>
    </>
  );
}

function Debugger({ rev }: { rev: number }) {
  void rev;
  const machine = machineBridge.machine;
  if (!machine) return <p className="text-sm text-muted">النواة لم تُقلع بعد.</p>;
  const pc = machine.pc >>> 0;
  const lineIndex = machine.listing.findIndex((line) => pc >= line.addr && pc < line.end);
  const slice = machine.listing.slice(Math.max(0, lineIndex - 6), Math.max(0, lineIndex) + 10);
  return (
    <div className="space-y-4" dir="ltr">
      <div className="grid grid-cols-2 gap-2 font-mono text-xs text-muted sm:grid-cols-4">
        <span>PC {hex(pc)}</span>
        <span>LR {hex(machine.lr)}</span>
        <span>CR {hex(machine.cr)}</span>
        <span>frame {machine.frame}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs sm:grid-cols-4">
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className="text-muted">
            r{i} <span className="text-fg">{hex(machine.r[i] ?? 0)}</span>
          </span>
        ))}
      </div>
      <ol className="max-h-52 space-y-1 overflow-auto rounded-lg border border-line bg-deep p-3 font-mono text-xs">
        {slice.map((line) => {
          const on = pc >= line.addr && pc < line.end;
          return (
            <li key={line.addr} className={on ? "text-ice" : "text-muted"}>
              {hex(line.addr)} {line.text}
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-6 gap-2">
        {machine.spe.map((load, i) => (
          <div key={i} className="space-y-1">
            <div className="text-xs text-muted">S{i}</div>
            <div className="h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-ice" style={{ width: `${load}%` }} />
            </div>
          </div>
        ))}
      </div>
      <ul className="space-y-1 font-mono text-xs text-muted">
        {machine.rsx.length === 0 ? <li>طابور RSX فارغ</li> : null}
        {machine.rsx.map((cmd, i) => (
          <li key={`${cmd.op}-${i}`}>
            {cmd.op} {cmd.x},{cmd.y} {cmd.w}×{cmd.h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function hex(value: number) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function CellonApp() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [programId, setProgramId] = useState(PROGRAMS[0]!.id);
  const [custom, setCustom] = useState<CellProgram | null>(null);
  const [debug, setDebug] = useState(false);
  const [paused, setPaused] = useState(false);
  const [session, setSession] = useState(0);
  const [isa, setIsa] = useState("يفحص مجموعة الأوامر");
  const [isaOk, setIsaOk] = useState(true);
  const [asmError, setAsmError] = useState("");
  const [disc, setDisc] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});
  const held = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rev, setRev] = useState(0);

  const program = custom ?? programById(programId);

  useEffect(() => {
    const report = runSelfTest();
    setIsaOk(report.ok);
    setIsa(report.lines[report.lines.length - 1] ?? "");
    const timer = window.setTimeout(() => setScreen((now) => (now === "boot" ? "shell" : now)), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const item of PROGRAMS) {
      next[item.id] = Number(localStorage.getItem(`cellon:${item.id}`) || 0) || 0;
    }
    if (custom) next[custom.id] = Number(localStorage.getItem(`cellon:${custom.id}`) || 0) || 0;
    setScores(next);
  }, [screen, custom]);

  useEffect(() => {
    if (screen !== "play") return;
    const down = (event: KeyboardEvent) => {
      const bit = KEYS[event.code];
      if (!bit) return;
      event.preventDefault();
      held.current |= bit;
    };
    const up = (event: KeyboardEvent) => {
      const bit = KEYS[event.code];
      if (!bit) return;
      held.current &= ~bit;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      held.current = 0;
    };
  }, [screen]);

  function openPlay(next: CellProgram, user = false) {
    if (user) setCustom(next);
    else setCustom(null);
    setProgramId(next.id);
    setPaused(false);
    setDebug(false);
    setScreen("play");
    held.current = 0;
  }

  function onFile(file: File) {
    void file.text().then((source) => {
      try {
        const image = assemble(source);
        setAsmError("");
        openPlay(
          {
            id: `user-${file.name}`,
            title: file.name,
            kicker: "برنامجك",
            summary: "جُمّع الآن ويُنفَّذ على نواة سيلون.",
            hint: "حسب أزرار برنامجك",
            source,
            image,
          },
          true,
        );
      } catch (error) {
        setAsmError(error instanceof Error ? error.message : "تعذّر التجميع");
      }
    });
  }

  function stepMachine(count: number) {
    const machine = machineBridge.machine;
    if (!machine) return;
    machine.pad = held.current;
    for (let i = 0; i < count && !machine.halted; i++) machine.step();
    machineBridge.paint?.();
    setRev((value) => value + 1);
  }

  function frameOnce() {
    const machine = machineBridge.machine;
    if (!machine) return;
    machine.runFrame(held.current);
    machineBridge.paint?.();
    setRev((value) => value + 1);
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-bg text-fg">
      <div className="horizon-glow pointer-events-none absolute inset-x-0 bottom-0 h-64" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <button type="button" className="flex items-center gap-2 text-lg font-semibold" onClick={() => setScreen("shell")}>
            <span className="size-2.5 rounded-full bg-ice" aria-hidden />
            سيلون
          </button>
          <p className="font-mono text-xs text-muted">PPE · ٦ SPE · RSX</p>
        </header>

        {screen === "boot" ? (
          <main className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
            <div className="flex items-end gap-2" aria-hidden>
              <span className="core-light size-8 rounded-md bg-ice" style={{ animation: "core-in 0.4s ease both" }} />
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className="core-light size-4 rounded-sm bg-ice"
                  style={{ animation: "core-in 0.4s ease both", animationDelay: `${180 + i * 120}ms` }}
                />
              ))}
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold">سيلون</h1>
              <p className="text-muted">محاكي نواة الخلية</p>
            </div>
            <p className={isaOk ? "text-sm text-ice" : "text-sm text-fg"}>{isa}</p>
            <button type="button" className="text-sm text-muted" onClick={() => setScreen("shell")}>
              تخطي الإقلاع
            </button>
          </main>
        ) : null}

        {screen === "shell" ? (
          <main className="mt-6 flex flex-1 flex-col gap-6">
            <section className="overflow-hidden rounded-xl border border-line bg-panel">
              <LiveCanvas program={program} />
              <div className="space-y-3 p-4">
                <p className="text-xs text-ice">{program.kicker}</p>
                <h1 className="text-3xl font-semibold">{program.title}</h1>
                <p className="max-w-xl text-sm leading-relaxed text-muted">{program.summary}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-ice px-5 font-medium text-bg"
                    onClick={() => openPlay(program)}
                  >
                    <Play className="size-4" />
                    تشغيل على النواة
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-4 text-sm"
                    onClick={() => setScreen("arch")}
                  >
                    المعمارية
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-4 text-sm"
                    onClick={() => setDisc(true)}
                  >
                    <Disc className="size-4" />
                    إدراج قرص
                  </button>
                </div>
              </div>
            </section>

            <ul className="grid gap-2">
              {PROGRAMS.map((item) => {
                const on = item.id === program.id && !custom;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCustom(null);
                        setProgramId(item.id);
                      }}
                      className={
                        on
                          ? "flex w-full items-center justify-between gap-3 rounded-xl border border-ice bg-deep px-4 py-3 text-start"
                          : "flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-start"
                      }
                    >
                      <span>
                        <span className="block font-medium">{item.title}</span>
                        <span className="block text-sm text-muted">{item.hint}</span>
                      </span>
                      <span className="font-mono text-xs text-muted">{scores[item.id] ?? 0}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {asmError ? <p className="text-sm text-fg">{asmError}</p> : null}
          </main>
        ) : null}

        {screen === "play" ? (
          <main className="mt-4 flex flex-1 flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <button type="button" className="h-11 px-1 text-sm text-muted" onClick={() => setScreen("shell")}>
                رجوع
              </button>
              <h1 className="truncate text-lg font-semibold">{program.title}</h1>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={paused ? "متابعة" : "إيقاف"}
                  className="flex size-11 items-center justify-center rounded-full border border-line"
                  onClick={() => setPaused((value) => !value)}
                >
                  {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                </button>
                <button
                  type="button"
                  aria-label="المنقّح"
                  className={
                    debug
                      ? "flex size-11 items-center justify-center rounded-full bg-ice text-bg"
                      : "flex size-11 items-center justify-center rounded-full border border-line"
                  }
                  onClick={() => {
                    setDebug((value) => !value);
                    setPaused(true);
                    setRev((value) => value + 1);
                  }}
                >
                  <Bug className="size-4" />
                </button>
              </div>
            </div>
            <p className="text-sm text-muted">{program.hint}</p>
            <Stage
              key={`${program.id}-${session}`}
              program={program}
              paused={paused || debug}
              debug={debug}
              held={held}
              onRev={() => setRev((value) => value + 1)}
            />
            {debug ? (
              <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
                <div className="flex flex-wrap gap-2" dir="rtl">
                  <button type="button" className="h-11 rounded-full border border-line px-4 text-sm" onClick={() => stepMachine(1)}>
                    <span className="inline-flex items-center gap-1">
                      <StepForward className="size-4" /> خطوة
                    </span>
                  </button>
                  <button type="button" className="h-11 rounded-full border border-line px-4 text-sm" onClick={() => stepMachine(100)}>
                    مئة
                  </button>
                  <button type="button" className="h-11 rounded-full border border-line px-4 text-sm" onClick={frameOnce}>
                    إطار واحد
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-full bg-ice px-4 text-sm text-bg"
                    onClick={() => {
                      setDebug(false);
                      setPaused(false);
                    }}
                  >
                    متابعة
                  </button>
                  <button
                    type="button"
                    className="flex size-11 items-center justify-center rounded-full border border-line"
                    aria-label="إعادة"
                    onClick={() => setSession((value) => value + 1)}
                  >
                    <RotateCcw className="size-4" />
                  </button>
                </div>
                <Debugger rev={rev} />
              </section>
            ) : null}
            <div className="mt-auto flex touch-none items-end justify-between gap-4 pb-2" dir="ltr">
              <div className="grid grid-cols-3 gap-2">
                <span />
                <PadButton label="أعلى" bit={KEY_U} held={held}>
                  <ChevronUp className="size-5" />
                </PadButton>
                <span />
                <PadButton label="يسار" bit={KEY_L} held={held}>
                  <ChevronLeft className="size-5" />
                </PadButton>
                <span />
                <PadButton label="يمين" bit={KEY_R} held={held}>
                  <ChevronRight className="size-5" />
                </PadButton>
                <span />
                <PadButton label="أسفل" bit={KEY_D} held={held}>
                  <ChevronDown className="size-5" />
                </PadButton>
                <span />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span />
                <PadButton label="مثلث" bit={KEY_T} held={held}>
                  <Triangle className="size-4" />
                </PadButton>
                <span />
                <PadButton label="مربع" bit={KEY_S} held={held}>
                  <Square className="size-4" />
                </PadButton>
                <PadButton label="ابدأ" bit={KEY_START} held={held}>
                  <Power className="size-4" />
                </PadButton>
                <PadButton label="دائرة" bit={KEY_O} held={held}>
                  <Circle className="size-4" />
                </PadButton>
                <span />
                <PadButton label="إكس" bit={KEY_X} held={held}>
                  <X className="size-4" />
                </PadButton>
                <span />
              </div>
            </div>
            <p className="text-center text-xs text-muted">الأسهم أو WASD، وJ للإطلاق، وEnter يعيد المحاولة</p>
          </main>
        ) : null}

        {screen === "arch" ? <Arch onBack={() => setScreen("shell")} isa={isa} isaOk={isaOk} /> : null}
      </div>

      {disc ? (
        <div className="veil fixed inset-0 z-20 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-line bg-panel p-5">
            <h2 className="text-xl font-semibold">درج القرص فارغ</h2>
            <p className="text-sm leading-relaxed text-muted">
              سيلون لا يحتوي فيرموير سوني، ولا يفك أقراص المتاجر. تلك الأقراص مشفّرة، ونظام البلايستيشن ٣
              (هايبرفايزر، LV2، ومعالج RSX) مشروع ضخم مستقل — مرجعه المفتوح RPCS3، ولم ننسخ شفرته.
            </p>
            <p className="text-sm leading-relaxed text-muted">
              ما يُقلع هنا برنامج منزلي بصيغة سيلون: نص تجميع PowerPC فيه وسم start. الأزرار تعود في r3 بعد نداء الإطار.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-12 rounded-full bg-ice px-5 text-sm font-medium text-bg"
                onClick={() => fileRef.current?.click()}
              >
                تحميل برنامج
              </button>
              <button type="button" className="h-12 rounded-full border border-line px-4 text-sm" onClick={() => setDisc(false)}>
                إغلاق
              </button>
            </div>
            {asmError ? <p className="text-sm">{asmError}</p> : null}
          </div>
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept=".cell,.asm,.s,.txt"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setDisc(false);
          onFile(file);
        }}
      />
    </div>
  );
}

function Arch({ onBack, isa, isaOk }: { onBack: () => void; isa: string; isaOk: boolean }) {
  return (
    <main className="mt-6 flex flex-1 flex-col gap-6 pb-8">
      <button type="button" className="w-fit text-sm text-muted" onClick={onBack}>
        رجوع
      </button>
      <div className="space-y-2">
        <p className="text-xs text-ice">خريطة معلنة، نواة أصلية</p>
        <h1 className="text-3xl font-semibold">معمارية الخلية</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          البلايستيشن ٣ بُني على معالج Cell من IBM: نواة PowerPC قائدة، ومعالجات مساعدة لا ترى الذاكرة الرئيسية إلا عبر DMA.
          سيلون يعيد بناء شريحة تعليمية من هذه الفكرة وينفّذ تعليماتها فعلًا.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-medium">PPE</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            PowerPC ٦٤ بت عند ٣.٢ غيغاهرتز، خيطان، وكاش L2 بحجم ٥١٢ كيلوبايت. سيلون يفسّر شريحة ٣٢ بت من نمط المستخدم بترتيب بايت كبير.
          </p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-medium">SPE × ٦</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            من ثمانية معالجات مساعدة: واحد معطّل صناعيًا وواحد للنظام. لكل واحد مخزن محلي ٢٥٦ كيلوبايت. المؤشرات هنا حمل يحدّثه البرنامج.
          </p>
        </article>
        <article className="rounded-xl border border-line bg-panel p-4">
          <h2 className="font-medium">RSX</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            معالج رسوم مشتق من NVIDIA G70 وذاكرة GDDR3 بسعة ٢٥٦ ميغابايت، إلى جانب XDR بسعة ٢٥٦. نداء الرسم عندنا يُنزَّل إلى طابور أوامر صغير.
          </p>
        </article>
      </div>
      <section className="space-y-3 rounded-xl border border-line bg-deep p-4">
        <h2 className="font-medium">ما هو مكتمل داخل سيلون</h2>
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          <li>مجمّع ومفسّر: حساب، ذاكرة، إزاحة، مقارنة، تفرع، ربط، ونداء نظام.</li>
          <li>ذاكرة ١٦ ميغابايت، وإطار ٦٤٠×٣٦٠ يكتبه الضيف عبر النواة.</li>
          <li>ثلاثة برامج منزلية منطقها كله تعليمات، لا سكربت اللعبة.</li>
          <li>منقّح: عدّاد البرنامج، السجلات، التتبع، ومؤشرات SPE وطابور RSX.</li>
          <li>تحميل نص تجميع خاص بك.</li>
        </ul>
        <p className={isaOk ? "text-sm text-ice" : "text-sm text-fg"}>{isa}</p>
      </section>
      <section className="space-y-2 text-sm leading-relaxed text-muted">
        <h2 className="font-medium text-fg">ما الذي لا يُقلع</h2>
        <p>
          قرص تجاري، حفظ النظام، أو أي فيرموير مملوك. محاكاة التجزئة الكاملة — عزل SPE، تظليل RSX، ومكتبة النظام — هي عمل سنوات، وبيتُها المفتوح مشروع RPCS3. سيلون مستقل عنه.
        </p>
        <p>
          المصادر العلنية التي وُصف العتاد منها: دليل IBM لبرمجة Cell Broadband Engine، وتحليل Rodrigo Copetti لمعمارية البلايستيشن ٣. الوصف هنا مختصر وأصلي، وليس نقلًا لتلك النصوص.
        </p>
        <p>
          المستودع:{" "}
          <a className="text-ice" href="https://github.com/moha700m/cellon">
            github.com/moha700m/cellon
          </a>
        </p>
      </section>
    </main>
  );
}
