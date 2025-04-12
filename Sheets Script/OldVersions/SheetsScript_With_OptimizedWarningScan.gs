// SheetsScript_With_OptimizedWarningScan.gs

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Glicko2')
    .addItem('Update Ratings', 'updateRatings')
    .addToUi();
}

function stringSimilarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

function editDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function updateRatings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const matchSheet = sheet.getSheetByName('Matches');
  const infoSheet = sheet.getSheetByName('PlayerInfo');
  const settingsSheet = sheet.getSheetByName('Settings');
  const warningSheet = sheet.getSheetByName('Warnings') || sheet.insertSheet('Warnings');
  const ratingSheet = sheet.getSheetByName('Ratings') || sheet.insertSheet('Ratings');
  const allRatingSheet = sheet.getSheetByName('All Ratings') || sheet.insertSheet('All Ratings');

  const headers = matchSheet.getDataRange().getValues().shift();
  const PLAYER_A = headers.indexOf('PlayerA');
  const PLAYER_B = headers.indexOf('PlayerB');
  const RESULT = headers.indexOf('Result');
  const DATE = headers.indexOf('Date');

  const data = matchSheet.getDataRange().getValues().slice(1);

  // Get last processed date
  let lastProcessedDate = new Date(0);
  if (settingsSheet) {
    const raw = settingsSheet.getRange("B1").getValue();
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      lastProcessedDate = raw;
    }
  }

  const matches = [];
  const namesSet = new Set();
  let newestDateSeen = lastProcessedDate;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const a = row[PLAYER_A]?.toString().trim();
    const b = row[PLAYER_B]?.toString().trim();
    const result = parseFloat(row[RESULT]);
    const date = new Date(row[DATE]);

    if (!a || !b || isNaN(result) || isNaN(date.getTime())) continue;
    if (date <= lastProcessedDate) continue;

    matches.push({ a, b, result, date });
    namesSet.add(a);
    namesSet.add(b);
    if (date > newestDateSeen) newestDateSeen = date;
  }

  const allNames = Array.from(namesSet);
  const playerInfoMap = new Map(
    infoSheet.getRange(2, 1, infoSheet.getLastRow() - 1, 2).getValues().map(([name, race]) => [name?.trim(), race])
  );

  // Generate warnings from names only if new matches were parsed
  const warnings = [];
  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      const sim = stringSimilarity(allNames[i], allNames[j]);
      if (sim > 0.85 && sim < 1) {
        warnings.push(`!!! Possible duplicate: "${allNames[i]}" vs "${allNames[j]}" (similarity: ${Math.round(sim * 100)}%)`);
      }
    }
  }

  warningSheet.clear();
  warningSheet.getRange(1, 1).setValue('Bad Name Warnings');
  if (warnings.length > 0) {
    warnings.forEach((w, i) => warningSheet.getRange(i + 2, 1).setValue(w));
  } else {
    warningSheet.getRange(2, 1).setValue(':D No possible duplicates found.');
  }

  // Update Settings sheet with latest match date
  if (settingsSheet) {
    settingsSheet.getRange("B1").setValue(newestDateSeen);
  }

  // Ratings logic skipped here for brevity — assumed unmodified.
}