const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ageInMonths(birthdate, now) {
  const m = DATE_RE.exec(birthdate ?? '');
  const [by, bm, bd] = m ? m.slice(1).map(Number) : [];
  const parsed = m && new Date(by, bm - 1, bd);
  if (!parsed || parsed.getFullYear() !== by || parsed.getMonth() !== bm - 1 || parsed.getDate() !== bd) {
    throw new RangeError('Enter a valid birthday as YYYY-MM-DD');
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (parsed >= today) throw new RangeError('The birthday must be before today');
  const months = (today.getFullYear() - by) * 12 + (today.getMonth() - (bm - 1));
  return today.getDate() < bd ? months - 1 : months;
}
