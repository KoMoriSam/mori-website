export function mixRgb(primary, secondary, weight) {
  const inverse = 1 - weight;
  return primary.map((value, index) =>
    Math.round(value * weight + secondary[index] * inverse),
  );
}

export function mixGoldWithInk(gold, ink, lightTheme) {
  return mixRgb(gold, ink, lightTheme ? 0.55 : 0.7);
}

export function prepareBackdropLayer(layerContext, { width, height, layerScale }) {
  layerContext.setTransform(layerScale, 0, 0, layerScale, 0, 0);
  layerContext.clearRect(0, 0, width, height);
}

export function compositeBackdropLayer(context, layer, { width, height }) {
  context.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, width, height);
}

export function paintEllipticalGlow(
  context,
  rgba,
  {
    x,
    y,
    radiusX,
    radiusY,
    color,
    opacity,
    midStop = 0.5,
    midOpacity = 0.5,
  },
) {
  context.save();
  context.translate(x, y);
  context.scale(radiusX, radiusY);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, rgba(color, opacity));
  gradient.addColorStop(midStop, rgba(color, opacity * midOpacity));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
}

export function paintRadialGlow(
  context,
  rgba,
  { x, y, radius, color, opacity, fillBounds = null },
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, opacity));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  if (fillBounds) {
    context.fillRect(
      fillBounds.x ?? 0,
      fillBounds.y ?? 0,
      fillBounds.width,
      fillBounds.height,
    );
  } else {
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}
