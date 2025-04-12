
function updateWarningsWithCaching(matchSheet, settingsSheet, warningsSheet, allNames, matches, DATE) {
  const lastParsedDateCell = settingsSheet.getRange("B1").getValue();
  const lastParsedDate = lastParsedDateCell ? new Date(lastParsedDateCell) : null;

  const newMatches = lastParsedDate
    ? matches.filter(m => m.date > lastParsedDate)
    : matches;

  const warnings = [];
  const seenNames = new Set();

  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      const nameA = allNames[i];
      const nameB = allNames[j];
      if (seenNames.has(`${nameA}-${nameB}`) || seenNames.has(`${nameB}-${nameA}`)) continue;
      const sim = stringSimilarity(nameA, nameB);
      if (sim > 0.85 && sim < 1) {
        warnings.push(`!!! Possible duplicate: "${nameA}" vs "${nameB}" (similarity: ${Math.round(sim * 100)}%)`);
        seenNames.add(`${nameA}-${nameB}`);
      }
    }
  }

  warningsSheet.clear();
  warningsSheet.getRange(1, 1).setValue('Bad Name Warnings');
  if (warnings.length > 0) {
    warnings.forEach((w, i) => warningsSheet.getRange(i + 2, 1).setValue(w));
  } else {
    warningsSheet.getRange(2, 1).setValue(':D No possible duplicates found.');
  }

  if (newMatches.length > 0) {
    const latestDate = newMatches.reduce((latest, match) =>
      match.date > latest ? match.date : latest,
      lastParsedDate || newMatches[0].date
    );
    settingsSheet.getRange("B1").setValue(latestDate);
  }
}
