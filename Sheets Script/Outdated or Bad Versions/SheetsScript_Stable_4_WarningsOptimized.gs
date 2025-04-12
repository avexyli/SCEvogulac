
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
  const ratingSheetName = 'Ratings';
  const allRatingsSheetName = 'All Ratings';

  const data = matchSheet.getDataRange().getValues();
  const headers = data.shift();

  const PLAYER_A = headers.indexOf('PlayerA');
  const PLAYER_B = headers.indexOf('PlayerB');
  const RESULT = headers.indexOf('Result');
  const DATE = headers.indexOf('Date');

  const allRows = data.map(row => {
    const a = row[PLAYER_A]?.toString().trim();
    const b = row[PLAYER_B]?.toString().trim();
    const result = parseFloat(row[RESULT]);
    const date = new Date(row[DATE]);
    return { a, b, result, date };
  }).filter(row => row.a && row.b && !isNaN(row.result) && row.date instanceof Date && !isNaN(row.date));

  // Retrieve last processed date for warnings
  let lastProcessedDate = new Date(0);
  if (settingsSheet) {
    const cell = settingsSheet.getRange("B1").getValue();
    if (cell instanceof Date && !isNaN(cell)) lastProcessedDate = cell;
  }

  const newRows = allRows.filter(row => row.date > lastProcessedDate);

  // Update last processed date in Settings
  if (settingsSheet && newRows.length > 0) {
    const newestDate = newRows.reduce((latest, row) => row.date > latest ? row.date : latest, lastProcessedDate);
    settingsSheet.getRange("B1").setValue(newestDate);
  }

  // Warnings logic
  const allNames = Array.from(new Set(newRows.flatMap(m => [m.a, m.b])));
  const warnings = [];

  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      const sim = stringSimilarity(allNames[i], allNames[j]);
      if (sim > 0.85 && sim < 1) {
        warnings.push(`!!! Possible duplicate: "${allNames[i]}" vs "${allNames[j]}" (similarity: ${Math.round(sim * 100)}%)`);
      }
    }
  }

  let warningSheet = sheet.getSheetByName('Warnings');
  if (!warningSheet) warningSheet = sheet.insertSheet('Warnings');
  if (warnings.length > 0) {
    const startRow = warningSheet.getLastRow() + 1;
    warnings.forEach((w, i) => warningSheet.getRange(startRow + i, 1).setValue(w));
  } else if (warningSheet.getLastRow() < 1) {
    warningSheet.getRange(1, 1).setValue('No possible duplicates found.');
  }
}
