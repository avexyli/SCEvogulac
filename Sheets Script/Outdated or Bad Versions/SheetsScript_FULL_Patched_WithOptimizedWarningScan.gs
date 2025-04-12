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
  const ratingSheetName = 'Ratings';
  const allRatingsSheetName = 'All Ratings';

  const data = matchSheet.getDataRange().getValues();
  const headers = data.shift();

  const PLAYER_A = headers.indexOf('PlayerA');
  const PLAYER_B = headers.indexOf('PlayerB');
  const RESULT = headers.indexOf('Result');
  const DATE = headers.indexOf('Date');

  const matches = data.map(row => {
    const a = row[PLAYER_A]?.toString().trim();
    const b = row[PLAYER_B]?.toString().trim();
    const result = parseFloat(row[RESULT]);
    return {
      a,
      b,
      result: isNaN(result) ? null : result,
      date: new Date(row[DATE])
    };
  }).filter(row => row.a && row.b && row.result !== null && row.date)
    .sort((x, y) => x.date - y.date);

  const allNames = Array.from(new Set(matches.flatMap(m => [m.a, m.b])));
  const playerInfoMap = new Map(
    infoSheet.getRange(2, 1, infoSheet.getLastRow() - 1, 2).getValues().map(([name, race]) => [name?.trim(), race])
  );

  const warnings = [];
  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      const sim = stringSimilarity(allNames[i], allNames[j]);
      if (sim > 0.85 && sim < 1) {
        warnings.push(`!!! Possible duplicate: "${allNames[i]}" vs "${allNames[j]}" (similarity: ${Math.round(sim * 100)}%)`);
      }
    }
  }
  if (warnings.length > 0) warnings.forEach(w => Logger.log(w));


  const settingsSheet = sheet.getSheetByName('Settings') || sheet.insertSheet('Settings');
  const lastWarningCheckCell = settingsSheet.getRange('B1');
  const lastWarningCheck = new Date(lastWarningCheckCell.getValue());
  const currentTime = new Date();

  const newWarnings = [];
  const seenPairs = new Set();

  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      const pairKey = [allNames[i], allNames[j]].sort().join('|');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const sim = stringSimilarity(allNames[i], allNames[j]);
      if (sim > 0.85 && sim < 1) {
        newWarnings.push(`!!! Possible duplicate: "${allNames[i]}" vs "${allNames[j]}" (similarity: ${Math.round(sim * 100)}%)`);
      }
    }
  }

  let warningSheet = sheet.getSheetByName('Warnings');
  if (!warningSheet) {
    warningSheet = sheet.insertSheet('Warnings');
  } else {
    warningSheet.clear();
  }

  warningSheet.getRange(1, 1).setValue('Bad Name Warnings');
  if (newWarnings.length > 0) {
    newWarnings.forEach((w, i) => warningSheet.getRange(i + 2, 1).setValue(w));
  } else {
    warningSheet.getRange(2, 1).setValue(':D No possible duplicates found.');
  }

  lastWarningCheckCell.setValue(currentTime);
  ratingSheet.getRange(1, 1, 1, 7).setValues([
    ['Name', 'Race', 'Rating', 'RD', 'Volatility', 'Rank', 'InactiveRisk']
  ]);
  ratingSheet.getRange(2, 1, recentList.length, 7).setValues(recentList);

  allRatingSheet.getRange(1, 1, 1, 7).setValues([
    ['Name', 'Race', 'Rating', 'RD', 'Volatility', 'Rank', 'InactiveRisk']
  ]);
  allRatingSheet.getRange(2, 1, playerList.length, 7).setValues(playerList);

  syncPlayerRaces();

  const existingInfo = infoSheet.getRange(2, 1, Math.max(infoSheet.getLastRow() - 1, 0), 1).getValues().flat().map(n => n.trim());
  const missing = allNames.filter(name => !existingInfo.includes(name));
  const toKeep = allNames;

  if (missing.length > 0) {
    const startRow = infoSheet.getLastRow() + 1;
    infoSheet.getRange(startRow, 1, missing.length, 1).setValues(missing.map(n => [n]));

    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList([
        "BW Terran / SC2 Terran",
        "BW Zerg / SC2 Zerg",
        "BW Protoss / SC2 Protoss",
        "BW Random / SC2 Random",
        "BW Terran / SC2 Random",
        "BW Zerg / SC2 Random",
        "BW Protoss / SC2 Random",
        "BW Random / SC2 Terran",
        "BW Random / SC2 Zerg",
        "BW Random / SC2 Protoss",
        "Random",
        "Unknown"
      ], true)
      .setAllowInvalid(false)
      .build();

    infoSheet.getRange(startRow, 2, missing.length, 1).setDataValidation(rule);
  }

  const allInfo = infoSheet.getRange(2, 1, Math.max(infoSheet.getLastRow() - 1, 0), 2).getValues();
  const filtered = allInfo.filter(([name]) => toKeep.includes(name?.trim()));
  infoSheet.getRange(2, 1, infoSheet.getLastRow() - 1, 2).clearContent();
  if (filtered.length > 0) {
    infoSheet.getRange(2, 1, filtered.length, 2).setValues(filtered);
  }
}

function syncPlayerRaces() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const ratingSheet = sheet.getSheetByName('Ratings');
  const infoSheet = sheet.getSheetByName('PlayerInfo');

  const ratingsData = ratingSheet.getRange(2, 1, ratingSheet.getLastRow() - 1, 2).getValues();
  const playerInfoData = infoSheet.getRange(2, 1, infoSheet.getLastRow() - 1, 2).getValues();

  const playerRaceMap = new Map(playerInfoData.map(([name, race]) => [name?.trim(), race]));

  ratingsData.forEach(([name, currentRace], i) => {
    const newRace = playerRaceMap.get(name?.trim());
    if (newRace && newRace !== currentRace) {
      ratingSheet.getRange(i + 2, 2).setValue(newRace);
    }
  });
}


function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== 'Matches') return;

  const editedColumn = range.getColumn();
  const row = range.getRow();

  // Column E is for score format like "2-1"
  if (editedColumn === 5) {
    const scoreText = e.value;
    if (!scoreText || scoreText.trim() === '') return;

    const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(scoreText);
    if (!match) return;

    const winsA = parseInt(match[1], 10);
    const winsB = parseInt(match[2], 10);
    const total = winsA + winsB;
    if (total === 0) return;

    const result = winsA / total;
    sheet.getRange(row, 3).setValue(Math.round(result * 1000) / 1000);  // Column C
  }
}
