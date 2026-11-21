export function createDefaultConversionOptions() {
  return {
    preserveCurrentReducedForms: true,
    preserveRepaya: true,
    preserveYansaya: true,
    preserveRakaransaya: true,
    preserveCurrentConjuncts: true,
    unifiedConjuncts: { common: false, rare: false },
    useTouchingConjuncts: false,
    removePaliHalForms: false,
    compactDaForms: false,
  };
}

export function buildConjunctOptions(options) {
  const reducedForms = options.preserveCurrentReducedForms
    ? {
        preserveRepaya: true,
        preserveYansaya: true,
        preserveRakaransaya: true,
      }
    : {
        preserveRepaya: options.preserveRepaya,
        preserveYansaya: options.preserveYansaya,
        preserveRakaransaya: options.preserveRakaransaya,
      };

  if (options.preserveCurrentConjuncts) {
    return {
      ...reducedForms,
      normalizeReducedForms: !options.preserveCurrentReducedForms,
      removePaliHalForms: options.removePaliHalForms,
      preserveConjuncts: true,
      normalizeConjuncts: false,
    };
  }

  return {
    ...reducedForms,
    normalizeReducedForms: !options.preserveCurrentReducedForms,
    preserveConjuncts: false,
    touchingConjuncts: options.useTouchingConjuncts,
    removePaliHalForms: options.removePaliHalForms,
    conjunctForms: Object.fromEntries(
      Object.entries(options.unifiedConjuncts).map(([category, joined]) => [
        category,
        joined ? "normalize" : "decompose",
      ]),
    ),
  };
}

export function buildUnicodeToFmOptions(options) {
  return {
    ...buildConjunctOptions(options),
    compactDaForms: options.compactDaForms,
  };
}
