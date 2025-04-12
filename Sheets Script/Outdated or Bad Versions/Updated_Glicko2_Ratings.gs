
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

function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== 'Matches') return;
  const editedColumn = range.getColumn();
  const row = range.getRow();
  if (editedColumn === 5) {
    const scoreText = e.value;
    if (!scoreText || scoreText.trim() === '') return;
    const scoreMatch = /^\s*(\d+)\s*-\s*(\d+)\s*$/i.exec(scoreText);
    if (!scoreMatch) return;
    const scoreA = parseInt(scoreMatch[1], 10);
    const scoreB = parseInt(scoreMatch[2], 10);
    const total = scoreA + scoreB;
    if (total === 0) return;
    const result = scoreA / total;
    const resultCell = sheet.getRange(row, 3);
    resultCell.setValue(Math.round(result * 1000) / 1000);
  }
}
