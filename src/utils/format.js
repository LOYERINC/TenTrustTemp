export function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG')}`;
}

export function toTitleCase(value = '') {
  return String(value).trim().toLocaleLowerCase('en').replace(/(^|[\s'-])([\p{L}])/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('en')}`);
}
