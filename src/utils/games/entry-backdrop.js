import {
  compositeBackdropLayer,
  mixGoldWithInk,
  mixRgb,
  paintEllipticalGlow,
  prepareBackdropLayer,
} from "../canvas/backdrop.js";

function createPalette({ info, gold, ink }, lightTheme) {
  return {
    cool: mixRgb(info, ink, lightTheme ? 0.7 : 0.85),
    gold: mixGoldWithInk(gold, ink, lightTheme),
    ink,
  };
}

export function createMoonMist({ context, layer, layerContext, state, rgba }) {
  return {
    createPalette,
    paint() {
      const { width, height, time } = state;
      prepareBackdropLayer(layerContext, state);
      paintEllipticalGlow(layerContext, rgba, {
        x: width * 0.87,
        y: height * 0.04,
        radiusX: width * 0.62,
        radiusY: height * 0.58,
        color: "cool",
        opacity: 0.21,
      });
      for (let index = 0; index < 7; index++) {
        const x = width * (0.2 + index * 0.15) + Math.sin(time * 0.1 + index) * width * 0.1;
        const y = height * (0.4 + (index % 3) * 0.17);
        paintEllipticalGlow(layerContext, rgba, {
          x,
          y,
          radiusX: width * 0.38,
          radiusY: height * 0.13,
          color: "cool",
          opacity: 0.045,
        });
      }
      const beam = layerContext.createLinearGradient(width * 0.9, 0, width * 0.3, height);
      beam.addColorStop(0, rgba("cool", 0.12));
      beam.addColorStop(1, rgba("cool", 0));
      layerContext.fillStyle = beam;
      layerContext.beginPath();
      layerContext.moveTo(width * 0.8, 0);
      layerContext.lineTo(width * 0.98, 0);
      layerContext.lineTo(width * 0.55, height);
      layerContext.lineTo(width * 0.02, height);
      layerContext.closePath();
      layerContext.fill();
      compositeBackdropLayer(context, layer, state);
    },
  };
}

export function createFurnaceDust({ context, layer, layerContext, state, rgba }) {
  const particles = Array.from({ length: 44 }, (_, index) => ({
    x: ((index * 61) % 101) / 101,
    y: index * 0.163,
    phase: index,
    color: index % 6 === 0 ? "gold" : "ink",
    size: 0.6 + (index % 3) * 0.4,
  }));
  return {
    createPalette,
    paint() {
      const { width, height, time } = state;
      prepareBackdropLayer(layerContext, state);
      paintEllipticalGlow(layerContext, rgba, {
        x: width * 0.92,
        y: height * 0.82,
        radiusX: width * 0.47,
        radiusY: height * 0.48,
        color: "gold",
        opacity: 0.23,
      });
      for (let index = 0; index < 6; index++) {
        const progress = (time * 0.017 + index * 0.18) % 1;
        const x = width * (0.65 + Math.sin(index + time * 0.08) * 0.19);
        paintEllipticalGlow(layerContext, rgba, {
          x,
          y: height * (1 - progress),
          radiusX: width * (0.16 + progress * 0.14),
          radiusY: height * 0.18,
          color: "ink",
          opacity: 0.05 * (1 - progress),
        });
      }
      compositeBackdropLayer(context, layer, state);
      for (const particle of particles) {
        const x = width * particle.x + Math.sin(time * 0.25 + particle.phase) * 8;
        const y = (((particle.y - time * 0.009) % 1.2 + 1.2) % 1.2 - 0.1) * height;
        context.fillStyle = rgba(particle.color, 0.12);
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
    },
  };
}
