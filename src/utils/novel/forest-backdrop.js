import {
  compositeBackdropLayer,
  mixGoldWithInk,
  paintRadialGlow,
  prepareBackdropLayer,
} from "../canvas/backdrop.js";

export function createForestLight({
  context,
  layer: canopy,
  layerContext: canopyContext,
  state,
  rgba,
}) {
  let width, height, canopyScale, time, lightTheme;
  const particles = Array.from({ length: 30 }, (_, index) => ({
    x: ((index * 73 + 19) % 101) / 101,
    y: ((index * 43 + 13) % 97) / 97,
    phase: index * 2.399,
    size: 0.8 + (index % 4) * 0.45,
  }));
  function createPalette({ green, gold, ink }, isLight) {
    return {
      green,
      gold: mixGoldWithInk(gold, ink, isLight),
      shadow: ink,
    };
  }

  function paintCanopy() {
    const ctx = canopyContext;
    prepareBackdropLayer(ctx, { width, height, layerScale: canopyScale });
    ctx.save();
    ctx.filter = `blur(${13 * canopyScale}px)`;
    for (let layer = 0; layer < 4; layer++) {
      const x =
        width * (0.08 + layer * 0.18) +
        Math.sin(time * 0.15 + layer) * width * 0.035;
      const glow = ctx.createLinearGradient(x, 0, x + width * 0.3, height);
      glow.addColorStop(0, rgba("gold", 0.19));
      glow.addColorStop(1, rgba("gold", 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + width * 0.065, 0);
      ctx.lineTo(x + width * 0.49, height);
      ctx.lineTo(x + width * 0.22, height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.filter = `blur(${7 * canopyScale}px)`;
    ctx.fillStyle = rgba(
      lightTheme ? "shadow" : "green",
      lightTheme ? 0.055 : 0.075,
    );
    particles.slice(0, 22).forEach((particle, index) => {
      const x =
        particle.x * width + Math.sin(time * 0.13 + particle.phase) * 16;
      const y =
        particle.y * height * 0.8 + Math.cos(time * 0.12 + particle.phase) * 12;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        32 + (index % 4) * 8,
        9 + (index % 3) * 4,
        particle.phase + Math.sin(time * 0.1) * 0.16,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
    ctx.restore();
    compositeBackdropLayer(context, canopy, { width, height });
  }

  function softGlow(x, y, radius, color, opacity) {
    paintRadialGlow(context, rgba, { x, y, radius, color, opacity });
  }

  function paintFireflies() {
    softGlow(width * 0.26, height * 0.44, width * 0.42, "green", 0.09);
    softGlow(width * 0.78, height * 0.13, width * 0.25, "gold", 0.055);
    particles.slice(0, 25).forEach((particle, index) => {
      const x =
        particle.x * width +
        Math.sin(time * (0.16 + (index % 3) * 0.025) + particle.phase) * 20;
      const y =
        particle.y * height + Math.cos(time * 0.11 + particle.phase) * 22;
      const opacity =
        0.15 + (Math.sin(time * 0.55 + particle.phase) + 1) * 0.12;
      const color = index % 3 ? "gold" : "green";
      softGlow(x, y, 10 + particle.size * 2, color, opacity * 0.36);
      context.fillStyle = rgba(color, opacity);
      context.beginPath();
      context.arc(x, y, particle.size, 0, Math.PI * 2);
      context.fill();
    });
  }

  return {
    createPalette,
    paint() {
      ({ width, height, layerScale: canopyScale, time, lightTheme } = state);
      paintCanopy();
      particles.slice(0, 18).forEach((particle) => {
        const x =
          particle.x * width + Math.sin(time * 0.2 + particle.phase) * 12;
        const y = ((((particle.y - time * 0.006) % 1) + 1) % 1) * height;
        context.fillStyle = rgba("gold", 0.23);
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      });
      paintFireflies();
    },
  };
}
