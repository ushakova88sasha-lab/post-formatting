/**
 * Московское время (UTC+3, без перехода на летнее время).
 * Явный расчёт — не зависит от часового пояса браузера.
 */
(function () {
  const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

  function parseUtcDate(iso) {
    if (!iso) return null;
    const text = String(iso).trim();
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function utcToMoscow(utcDate) {
    return new Date(utcDate.getTime() + MSK_OFFSET_MS);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatMoscowDateTime(iso) {
    const utc = parseUtcDate(iso);
    if (!utc) return "";
    const msk = utcToMoscow(utc);
    return `${pad2(msk.getUTCDate())}.${pad2(msk.getUTCMonth() + 1)}, ${pad2(msk.getUTCHours())}:${pad2(msk.getUTCMinutes())} МСК`;
  }

  function toMoscowDatetimeLocal(utcDate) {
    const msk = utcToMoscow(utcDate);
    return `${msk.getUTCFullYear()}-${pad2(msk.getUTCMonth() + 1)}-${pad2(msk.getUTCDate())}T${pad2(msk.getUTCHours())}:${pad2(msk.getUTCMinutes())}`;
  }

  function moscowDatetimeLocalToUtcIso(value) {
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - MSK_OFFSET_MS;
    return new Date(utcMs).toISOString();
  }

  window.moscowTime = {
    parseUtcDate,
    formatMoscowDateTime,
    toMoscowDatetimeLocal,
    moscowDatetimeLocalToUtcIso,
  };
})();
