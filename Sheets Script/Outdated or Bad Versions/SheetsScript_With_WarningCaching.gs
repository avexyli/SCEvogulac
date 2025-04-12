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

  // Settings sheet tracking for last warnings parse
  const settingsSheet = sheet.getSheetByName('Settings');
  if (!settingsSheet) throw new Error('Settings sheet is missing.');
  const lastParsedWarningDateStr = settingsSheet.getRange('B1').getValue();
  const lastParsedWarningDate = new Date(lastParsedWarningDateStr || 0);

  const playerInfoMap = new Map(
    infoSheet.getRange(2, 1, infoSheet.getLastRow() - 1, 2).getValues().map(([name, race]) => [name?.trim(), race])
  );

  
  const newWarnings = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (match.date <= lastParsedWarningDate) continue;
    for (let j = i + 1; j < matches.length; j++) {
      const other = matches[j];
      if (other.date <= lastParsedWarningDate) continue;
      const sim = stringSimilarity(match.a, other.a);
      if (sim > 0.85 && sim < 1) {
        newWarnings.push(`!!! Possible duplicate: "${match.a}" vs "${other.a}" (similarity: ${Math.round(sim * 100)}%)`);
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

  // Update last parsed warning date
  settingsSheet.getRange('B1').setValue(new Date());

  for (let i = 0; i < allNames.length; i++) {
    for (let j = i + 1; j < allNames.length; j++) {
      const sim = stringSimilarity(allNames[i], allNames[j]);
      if (sim > 0.85 && sim < 1) {
        warnings.push(`!!! Possible duplicate: "${allNames[i]}" vs "${allNames[j]}" (similarity: ${Math.round(sim * 100)}%)`);
      }
    }
  }
  if (warnings.length > 0) warnings.forEach(w => Logger.log(w));

  let warningSheet = sheet.getSheetByName('Warnings');
  if (!warningSheet) {
    warningSheet = sheet.insertSheet('Warnings');
  } else {
    warningSheet.clear();
  }
  warningSheet.getRange(1, 1).setValue('Bad Name Warnings');
  if (warnings.length > 0) {
    warnings.forEach((w, i) => warningSheet.getRange(i + 2, 1).setValue(w));
  } else {
    warningSheet.getRange(2, 1).setValue(':D No possible duplicates found.');
  }

let debugSheet = sheet.getSheetByName('Warnings');
if (!debugSheet) debugSheet = sheet.insertSheet('Warnings');
else debugSheet.clear();

debugSheet.getRange(1, 1, 1, 5).setValues([['PlayerA', 'PlayerB', 'Result', 'Date String', 'Parsed Date Valid?']]);

matches.forEach((m, i) => {
  debugSheet.getRange(i + 2, 1, 1, 5).setValues([[
    m.a,
    m.b,
    m.result,
    matchSheet.getRange(i + 2, DATE + 1).getValue(),
    isNaN(m.date.getTime()) ? '❌ Invalid Date' : '✅ OK'
  ]]);
});


  let ratingSheet = sheet.getSheetByName(ratingSheetName);
  if (!ratingSheet) {
    ratingSheet = sheet.insertSheet(ratingSheetName);
  } else {
    ratingSheet.clear();
  }

  let allRatingSheet = sheet.getSheetByName(allRatingsSheetName);
  if (!allRatingSheet) {
    allRatingSheet = sheet.insertSheet(allRatingsSheetName);
  } else {
    allRatingSheet.clear();
  }

  class Glicko2Player {
    constructor(rating = 1500, rd = 350, vol = 0.06) {
      this.rating = rating;
      this.rd = rd;
      this.vol = vol;
    }
    getRating() { return this.rating; }
    getRd() { return this.rd; }
    getVol() { return this.vol; }
  }

  class Glicko2 {
    constructor() {
      this.tau = 0.5;
      this.rating = 1500;
      this.rd = 350;
      this.vol = 0.06;
      this.q = Math.log(10) / 400;
    }

    makePlayer() {
      return new Glicko2Player();
    }

    g(rd) {
      return 1 / Math.sqrt(1 + (3 * this.q ** 2 * rd ** 2) / (Math.PI ** 2));
    }

    E(r, ri, rdi) {
      return 1 / (1 + Math.pow(10, (-this.g(rdi) * (r - ri)) / 400));
    }

    updateRatings(matches) {
      const updates = new Map();
      for (const [p1, p2, score] of matches) {
        if (!updates.has(p1)) updates.set(p1, []);
        if (!updates.has(p2)) updates.set(p2, []);
        updates.get(p1).push([p2, score]);
        updates.get(p2).push([p1, 1 - score]);
      }
      for (const [player, games] of updates.entries()) {
        const mu = (player.rating - 1500) / 173.7178;
        const phi = player.rd / 173.7178;
        const sigma = player.vol;

        let vInv = 0;
        let deltaSum = 0;

        for (const [opponent, score] of games) {
          const mu_j = (opponent.rating - 1500) / 173.7178;
          const phi_j = opponent.rd / 173.7178;
          const g = 1 / Math.sqrt(1 + 3 * this.q ** 2 * phi_j ** 2 / Math.PI ** 2);
          const E = 1 / (1 + Math.exp(-g * (mu - mu_j)));
          vInv += g ** 2 * E * (1 - E);
          deltaSum += g * (score - E);
        }

        const v = 1 / vInv;
        const delta = v * deltaSum;

        const a = Math.log(sigma ** 2);
        let A = a;
        let B = (delta ** 2 > phi ** 2 + v) ? Math.log(delta ** 2 - phi ** 2 - v) : a - 1;

        const f = x => {
          const ex = Math.exp(x);
          return (ex * (delta ** 2 - phi ** 2 - v - ex)) / (2 * (phi ** 2 + v + ex) ** 2) - (x - a) / (this.tau ** 2);
        };

        let fA = f(A);
        let fB = f(B);

        while (Math.abs(B - A) > 1e-6) {
          const C = A + (A - B) * fA / (fB - fA);
          const fC = f(C);
          if (fC * fB < 0) {
            A = B;
            fA = fB;
          } else {
            fA = fA / 2;
          }
          B = C;
          fB = fC;
        }

        const newSigma = Math.exp(A / 2);
        const phiStar = Math.sqrt(phi ** 2 + newSigma ** 2);
        const phiPrime = 1 / Math.sqrt(1 / (phiStar ** 2) + 1 / v);
        const muPrime = mu + phiPrime ** 2 * deltaSum;

        player.rating = 173.7178 * muPrime + 1500;
        player.rd = 173.7178 * phiPrime;
        player.vol = newSigma;
      }
    }
  }

  const glicko2 = new Glicko2();
  const ratingMap = new Map();
  const latestMatchMap = new Map();

  allNames.forEach(name => {
    ratingMap.set(name, glicko2.makePlayer());
  });

  for (const m of matches) {
    if (!latestMatchMap.has(m.a) || latestMatchMap.get(m.a) < m.date) latestMatchMap.set(m.a, m.date);
    if (!latestMatchMap.has(m.b) || latestMatchMap.get(m.b) < m.date) latestMatchMap.set(m.b, m.date);
  }

  const ratingMatches = matches
    .filter(m => ratingMap.has(m.a) && ratingMap.has(m.b))
    .map(m => [ratingMap.get(m.a), ratingMap.get(m.b), m.result]);

  glicko2.updateRatings(ratingMatches);

  const today = new Date();
  const last30Days = new Date();
  last30Days.setDate(today.getDate() - 30);
  const recentPlayers = new Set(matches.filter(m => m.date >= last30Days).flatMap(m => [m.a, m.b]));

  let playerList = Array.from(ratingMap.entries()).map(([name, player]) => {
    const rating = Math.round(player.getRating());
    const race = playerInfoMap.get(name) || '?';
    let rank = '';
    if (rating >= 2600) rank = 'S';
    else if (rating >= 2300) rank = 'A';
    else if (rating >= 2000) rank = 'B';
    else if (rating >= 1700) rank = 'C';
    else if (rating >= 1400) rank = 'D';
    else if (rating >= 1100) rank = 'E';
    else if (rating >= 801) rank = 'F';
    else rank = 'F-';

    const lastMatch = latestMatchMap.get(name);
    const daysSince = lastMatch ? Math.floor((today - lastMatch) / (1000 * 60 * 60 * 24)) : Infinity;
    let inactivityFlag = 0;
    if (daysSince > 28) inactivityFlag = 2;
    else if (daysSince > 21) inactivityFlag = 1;

    return [
      name,
      race,
      rating,
      Math.round(player.getRd()),
      Math.floor(player.getVol() * 1000) / 1000,
      rank,
      inactivityFlag
    ];
  });

  playerList.sort((a, b) => b[2] - a[2]);

  const recentList = playerList.filter(row => recentPlayers.has(row[0]));

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
