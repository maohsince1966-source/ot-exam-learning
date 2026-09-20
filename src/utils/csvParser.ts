import { Question } from '../types';
import { parseCategory, normalizeAnswer } from './categoryHelper';
import { normalizeImageUrl } from './imageHelper';

/**
 * Parses CSV or TSV string from Google Spreadsheet into Question objects.
 * 
 * Expected columns (0-indexed):
 * 0: id (A列: "61-AM-001")
 * 1: year (B列: 実施回/年)
 * 2: category (C列: 分野 "身体障害作業療法学（脳卒中）")
 * 3: question (D列: 問題文)
 * 4: choice1 (E列: 選択肢1)
 * 5: choice2 (F列: 選択肢2)
 * 6: choice3 (G列: 選択肢3)
 * 7: choice4 (H列: 選択肢4)
 * 8: choice5 (I列: 選択肢5)
 * 9: answer / anser (J列: 正答 "1" や "1,2", "1,2,3")
 * 10: explanation (K列: 解説)
 * 11: image url (L列: 画像URL)
 */
export function parseSpreadsheetText(text: string): { questions: Question[]; errors: string[] } {
  const errors: string[] = [];
  const questions: Question[] = [];

  const rawRows = parseDelimitedText(text.trim());
  if (rawRows.length === 0) {
    return { questions: [], errors: ['データが見つかりませんでした。内容を確認してください。'] };
  }

  let startIndex = 0;
  // Default column mappings based on standard A-L columns
  let colMap = {
    id: 0,
    year: 1,
    category: 2,
    question: 3,
    choice1: 4,
    choice2: 5,
    choice3: 6,
    choice4: 7,
    choice5: 8,
    answer: 9, // J列 (anser / answer)
    explanation: 10,
    imageUrl: 11
  };

  // Inspect first row for headers (handles "anser", "answer", "正答", "解答", etc.)
  const firstRow = rawRows[0].map(c => (c || '').trim().toLowerCase());
  const hasHeaderKeywords = firstRow.some(col => 
    col === 'id' || col === '実施回' || col === '問題' || col === 'anser' || col === 'answer' || col === '正答' || col === '解答'
  );

  if (hasHeaderKeywords) {
    startIndex = 1;
    firstRow.forEach((col, idx) => {
      if (col === 'id' || col === '問題id' || col === 'no') colMap.id = idx;
      else if (col === 'year' || col === '実施回' || col === '年度' || col === '年') colMap.year = idx;
      else if (col === 'category' || col === '分野' || col === '領域') colMap.category = idx;
      else if (col === 'question' || col === '問題' || col === '問題文') colMap.question = idx;
      else if (col === 'choice1' || col === '選択肢1' || col === '1') colMap.choice1 = idx;
      else if (col === 'choice2' || col === '選択肢2' || col === '2') colMap.choice2 = idx;
      else if (col === 'choice3' || col === '選択肢3' || col === '3') colMap.choice3 = idx;
      else if (col === 'choice4' || col === '選択肢4' || col === '4') colMap.choice4 = idx;
      else if (col === 'choice5' || col === '選択肢5' || col === '5') colMap.choice5 = idx;
      else if (col === 'answer' || col === 'anser' || col === '正解' || col === '正答' || col === '解答') colMap.answer = idx;
      else if (col === 'explanation' || col === '解説' || col === '解釈') colMap.explanation = idx;
      else if (col.includes('image') || col.includes('画像') || col.includes('図')) colMap.imageUrl = idx;
    });
  }

  for (let i = startIndex; i < rawRows.length; i++) {
    const row = rawRows[i];
    // Skip empty lines
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) {
      continue;
    }

    const rowNum = i + 1;
    if (row.length < 10) {
      errors.push(`行 ${rowNum}: 列数が不足しています（最低10列: id〜answer が必要です。検出列数: ${row.length}）`);
      continue;
    }

    const id = row[colMap.id]?.trim() || `OT-${rowNum}`;
    const year = row[colMap.year]?.trim() || '2026';
    const category = row[colMap.category]?.trim() || '一般';
    const questionText = row[colMap.question]?.trim();
    const c1 = row[colMap.choice1]?.trim() || '';
    const c2 = row[colMap.choice2]?.trim() || '';
    const c3 = row[colMap.choice3]?.trim() || '';
    const c4 = row[colMap.choice4]?.trim() || '';
    const c5 = row[colMap.choice5]?.trim() || '';
    // J列 (anser / answer)
    const rawAnswer = row[colMap.answer]?.trim() || '1';
    const explanation = row[colMap.explanation]?.trim() || '';
    const imageUrl = row[colMap.imageUrl]?.trim() || '';

    if (!questionText) {
      errors.push(`行 ${rowNum}: 問題文が空です。スキップしました。`);
      continue;
    }

    // Handles comma separated: "1,2", "1, 2", "1,2,3", "１，２" etc.
    const normalizedAnswers = normalizeAnswer(rawAnswer);
    const parsedCat = parseCategory(category);

    questions.push({
      id,
      year,
      category,
      majorCategory: parsedCat.major,
      subCategory: parsedCat.sub,
      question: questionText,
      choices: [c1, c2, c3, c4, c5],
      answer: normalizedAnswers.length > 1
        ? normalizedAnswers
        : (normalizedAnswers[0] !== undefined ? normalizedAnswers[0] : 1),
      explanation,
      imageUrl: imageUrl ? normalizeImageUrl(imageUrl) : ''
    });
  }

  return { questions, errors };
}

/**
 * Parses either Tab-separated or Comma-separated text while respecting quotes
 */
function parseDelimitedText(text: string): string[][] {
  // Determine if mostly TSV or CSV
  const firstLine = text.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Push last field & row if exists
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Exports question list to Google Spreadsheet CSV format
 */
export function exportToCSV(questions: Question[]): string {
  const header = ['id', 'year', 'category', 'question', 'choice1', 'choice2', 'choice3', 'choice4', 'choice5', 'answer', 'explanation', 'image url'];
  
  const rows = questions.map(q => {
    let answerStr = '';
    if (Array.isArray(q.answer)) {
      answerStr = q.answer.join(',');
    } else {
      answerStr = String(q.answer);
    }

    return [
      q.id,
      String(q.year),
      q.category,
      q.question,
      q.choices[0],
      q.choices[1],
      q.choices[2],
      q.choices[3],
      q.choices[4],
      answerStr,
      q.explanation,
      q.imageUrl || ''
    ];
  });

  const all = [header, ...rows];
  return all.map(row => 
    row.map(val => {
      const escaped = (val || '').replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(',')
  ).join('\r\n');
}
