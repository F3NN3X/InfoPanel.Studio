// The memory bomb (tests/e2e/pack-script.spec.ts): each frame grows the heap until the runtime's 8 MB limit stops it.
const keep = [];
fx.onFrame(() => {
  for (;;) keep.push("x".repeat(1 << 20) + keep.length);
});
