export function parseMovieListText(text) {
  const entries = [];
  const errors = [];
  const skippedHeaders = [];
  String(text || "").split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    if (!entries.length && /^(?:titolo\s*[,;|\t]?\s*)?(?:voto|rating|valutazione|score)$/i.test(line)) {
      skippedHeaders.push(index + 1);
      return;
    }
    // A bare integer may be part of the title (Toy Story 3). Integer votes
    // require a separator; legacy decimal votes separated by spaces still work.
    const explicit = line.match(/^(.+?)[;|\t]\s*(-?\d+(?:[,.]\d+)?)$/);
    const match = explicit ?? line.match(/^(.+?)\s+(\d+[,.]\d+)$/);
    if (!match) {
      entries.push({ title: line, rating: null });
      return;
    }
    const rating = Number(match[2].replace(",", "."));
    if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
      errors.push(`Riga ${index + 1}: il voto deve essere tra 0 e 10.`);
      return;
    }
    entries.push({ title: match[1].trim(), rating });
  });
  return { entries, errors, skippedHeaders };
}
