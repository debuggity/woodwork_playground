export type MeasurementUnitSystem = 'default' | 'metric';

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;
const SQM_PER_SQFT = 0.09290304;

const trimTrailingZeros = (value: string) =>
  value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

export const isMetricUnitSystem = (unitSystem: MeasurementUnitSystem) => unitSystem === 'metric';

export const getLengthUnitLabel = (
  unitSystem: MeasurementUnitSystem,
  style: 'short' | 'long' = 'short'
) => {
  if (unitSystem === 'metric') {
    return style === 'short' ? 'cm' : 'centimeters';
  }
  return style === 'short' ? 'in' : 'inches';
};

export const toDisplayLength = (valueInches: number, unitSystem: MeasurementUnitSystem) =>
  unitSystem === 'metric' ? valueInches * CM_PER_INCH : valueInches;

export const fromDisplayLength = (value: number, unitSystem: MeasurementUnitSystem) =>
  unitSystem === 'metric' ? value / CM_PER_INCH : value;

export const formatLength = (
  valueInches: number,
  unitSystem: MeasurementUnitSystem,
  digits = 2
) => trimTrailingZeros(toDisplayLength(valueInches, unitSystem).toFixed(digits));

export const formatLengthWithUnit = (
  valueInches: number,
  unitSystem: MeasurementUnitSystem,
  digits = 2
) => `${formatLength(valueInches, unitSystem, digits)} ${getLengthUnitLabel(unitSystem)}`;

export const formatLengthInputValue = (
  valueInches: number,
  unitSystem: MeasurementUnitSystem,
  digits = 3
) => trimTrailingZeros(toDisplayLength(valueInches, unitSystem).toFixed(digits));

export const parseLengthInput = (value: string, unitSystem: MeasurementUnitSystem) => {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  return fromDisplayLength(parsed, unitSystem);
};

export const formatLengthStep = (
  stepInches: number,
  unitSystem: MeasurementUnitSystem,
  digits = 4
) => trimTrailingZeros(toDisplayLength(stepInches, unitSystem).toFixed(digits));

export const formatArea = (valueSqFt: number, unitSystem: MeasurementUnitSystem, digits = 2) => {
  if (unitSystem === 'metric') {
    return `${trimTrailingZeros((valueSqFt * SQM_PER_SQFT).toFixed(digits))} m^2`;
  }
  return `${valueSqFt.toFixed(digits)} ft^2`;
};

export const formatWeight = (valueLb: number, unitSystem: MeasurementUnitSystem, digits = 1) => {
  if (unitSystem === 'metric') {
    return `${trimTrailingZeros((valueLb * KG_PER_LB).toFixed(digits))} kg`;
  }
  return `${valueLb.toFixed(digits)} lb`;
};

export const formatDimensionTriple = (
  dimensionsInches: [number, number, number],
  unitSystem: MeasurementUnitSystem,
  digits = 1
) => `${dimensionsInches.map((value) => formatLength(value, unitSystem, digits)).join(' x ')} ${getLengthUnitLabel(unitSystem)}`;
