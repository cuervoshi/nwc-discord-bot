const formatter = (minDecimals: number = 2, maxDecimals: number = 2): Intl.NumberFormat => {
  return new Intl.NumberFormat("es-US", {
    // These options are needed to round to whole numbers if that's what you want.
    minimumFractionDigits: minDecimals, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
    maximumFractionDigits: maxDecimals, // (causes 2500.99 to be printed as $2,501)
  });
};

export { formatter };
