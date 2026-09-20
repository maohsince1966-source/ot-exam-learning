/**
 * Utilities for extracting and formatting major category, subcategory,
 * normalizing answers, and evaluating flexible OT national exam scoring rules.
 * 
 * Rules:
 * 1. "2つ選べ" questions:
 *    - If answer is 3 items like [1, 2, 3]: selecting ANY 2 of the 3 is CORRECT.
 *    - If answer is 2 items like [1, 2]: selecting both 1 and 2 is CORRECT.
 * 2. 1-choice questions:
 *    - If answer has 2 items like [1, 2]: selecting EITHER 1 or 2 is CORRECT.
 *    - If answer has 1 item like [1]: selecting 1 is CORRECT.
 */

export interface ParsedCategory {
  major: string;
  sub: string;
  raw: string;
}

export function parseCategory(categoryStr: string): ParsedCategory {
  if (!categoryStr || !categoryStr.trim()) {
    return { major: '未分類', sub: '', raw: categoryStr || '' };
  }

  const trimmed = categoryStr.trim();
  // Match text followed by Japanese full-width or half-width parentheses: 大項目（中項目） or 大項目(中項目)
  const match = trimmed.match(/^([^(（]+)(?:[(（]([^)）]+)[)）])?$/);

  if (match) {
    const major = match[1].trim();
    const sub = (match[2] || '').trim();
    return {
      major: major || '未分類',
      sub,
      raw: trimmed
    };
  }

  return {
    major: trimmed,
    sub: '',
    raw: trimmed
  };
}

/**
 * Checks if question requires choosing 2 answers.
 * Note: A question is only "2つ選べ" if the question text specifies it,
 * or if there are 3+ answers (which in national exam scoring context indicates pick 2 from 3).
 * If the answer has 2 items [1, 2] but question text does NOT mention "2つ選べ",
 * it is a 1-choice question with 2 acceptable answers.
 */
export function isPickTwoQuestion(questionText: string, answer?: number | number[]): boolean {
  if (questionText) {
    // Check for Japanese variations: "2つ選べ", "二つ選べ", "２つ選べ", "2 つ選べ", "２ つ選べ", "2つ選択", etc.
    const regex = /(2つ選べ|二つ選べ|２つ選べ|2\s*つ選べ|２\s*つ選べ|2つ選択|２つ選択|二つ選択)/i;
    if (regex.test(questionText)) {
      return true;
    }
  }

  // If answer explicitly has 3 or more options (e.g. [1, 2, 3]), it's a pick-2 with 3 valid answers
  if (Array.isArray(answer) && answer.length >= 3) {
    return true;
  }

  return false;
}

/**
 * Normalizes answer(s) into a sorted array of numbers [1, 2, ...]
 * Supports:
 * - "1,2" / "1, 2" / "1,2,3"
 * - Full-width "１，２" / "１, ２, ３" / "１・２"
 * - number or number[]
 */
export function normalizeAnswer(answer: number | number[] | string | undefined): number[] {
  if (answer === undefined || answer === null) {
    return [1];
  }

  if (Array.isArray(answer)) {
    const nums = answer.map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 5);
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  }

  if (typeof answer === 'number') {
    return [answer >= 1 && answer <= 5 ? answer : 1];
  }

  if (typeof answer === 'string') {
    // Convert full-width numbers １-５ to 1-5
    const halfWidth = answer.replace(/[１-５]/g, m => 
      String.fromCharCode(m.charCodeAt(0) - 0xFEE0)
    );
    // Matches all digits 1-5
    const matches = halfWidth.match(/[1-5]/g);
    if (matches && matches.length > 0) {
      const nums = matches.map(Number);
      return Array.from(new Set(nums)).sort((a, b) => a - b);
    }
  }

  return [1];
}

export interface AnswerEvaluationResult {
  isCorrect: boolean;
  isPickTwo: boolean;
  userSelected: number[];
  targetAnswers: number[];
  statusText: string;
  detailText: string;
}

/**
 * Evaluates whether user choices are correct based on OT national exam rules:
 * 1. "2つ選べ" question:
 *    - If target has 3 answers (e.g. 1, 2, 3): User must choose exactly 2, and BOTH must be in target.
 *    - If target has 2 answers (e.g. 1, 2): User must choose exactly 2, and they must match target.
 *    - If target has 4+ answers: User must choose 2, and both must be in target.
 * 2. 1-choice question:
 *    - If target has 2 answers (e.g. 1, 2): User chooses 1, and it can be EITHER 1 or 2.
 *    - If target has 1 answer (e.g. 1): User chooses 1, must match target[0].
 *    - If target has 3+ answers (all accepted): User chooses 1, must be in target.
 */
export function evaluateAnswer(
  userChoices: number[] | number | undefined,
  targetAnswer: number | number[] | string | undefined,
  questionText: string = ''
): AnswerEvaluationResult {
  const targetAnswers = normalizeAnswer(targetAnswer);
  const isPickTwo = isPickTwoQuestion(questionText, targetAnswers);

  let rawUserList: number[] = [];
  if (Array.isArray(userChoices)) {
    rawUserList = userChoices;
  } else if (typeof userChoices === 'number') {
    rawUserList = [userChoices];
  }

  const userSelected = Array.from(new Set(rawUserList))
    .filter(n => !isNaN(n) && n >= 1 && n <= 5)
    .sort((a, b) => a - b);

  if (userSelected.length === 0) {
    return {
      isCorrect: false,
      isPickTwo,
      userSelected,
      targetAnswers,
      statusText: '未解答',
      detailText: isPickTwo ? '選択肢を2つ選択してください' : '選択肢を1つ選択してください'
    };
  }

  if (isPickTwo) {
    // Must select 2 choices
    if (userSelected.length !== 2) {
      return {
        isCorrect: false,
        isPickTwo,
        userSelected,
        targetAnswers,
        statusText: '不正解（選択数不足/超過）',
        detailText: `「2つ選べ」問題です。2つ選択してください（現在${userSelected.length}個選択）`
      };
    }

    if (targetAnswers.length >= 3) {
      // 3 answers provided, any 2 match is correct
      const isCorrect = userSelected.every(choice => targetAnswers.includes(choice));
      return {
        isCorrect,
        isPickTwo,
        userSelected,
        targetAnswers,
        statusText: isCorrect ? '正解 ○' : '不正解 ×',
        detailText: isCorrect
          ? `正解（${targetAnswers.join(', ')} のうち正解の2つ [${userSelected.join(', ')}] を選択）`
          : `不正解（正答は ${targetAnswers.join(', ')} のうちいずれか2つ）`
      };
    } else {
      // Standard pick 2 (target is 2 choices, e.g. [1, 2])
      const isCorrect = targetAnswers.length === 2 &&
        userSelected[0] === targetAnswers[0] &&
        userSelected[1] === targetAnswers[1];

      return {
        isCorrect,
        isPickTwo,
        userSelected,
        targetAnswers,
        statusText: isCorrect ? '正解 ○' : '不正解 ×',
        detailText: isCorrect
          ? `正解（正答: ${targetAnswers.join(', ')}）`
          : `不正解（正答: ${targetAnswers.join(', ')}）`
      };
    }
  } else {
    // 1-choice question
    const chosen = userSelected[0];

    if (targetAnswers.length >= 2) {
      // Multiple valid answers for 1-choice question (either is correct)
      const isCorrect = targetAnswers.includes(chosen);
      return {
        isCorrect,
        isPickTwo,
        userSelected: [chosen],
        targetAnswers,
        statusText: isCorrect ? '正解 ○' : '不正解 ×',
        detailText: isCorrect
          ? `正解（複数正答: ${targetAnswers.join(' または ')} のいずれかを選択）`
          : `不正解（正答: ${targetAnswers.join(' または ')} のどちらか）`
      };
    } else {
      // Standard single answer
      const isCorrect = targetAnswers.length === 1 && targetAnswers[0] === chosen;
      return {
        isCorrect,
        isPickTwo,
        userSelected: [chosen],
        targetAnswers,
        statusText: isCorrect ? '正解 ○' : '不正解 ×',
        detailText: isCorrect
          ? `正解（正答: ${targetAnswers[0]}）`
          : `不正解（正答: ${targetAnswers[0]}）`
      };
    }
  }
}

/**
 * Legacy boolean check function that delegates to evaluateAnswer
 */
export function isAnswerCorrect(
  userChoices: number[] | number | undefined,
  targetAnswer: number | number[] | string | undefined,
  questionText: string = ''
): boolean {
  return evaluateAnswer(userChoices, targetAnswer, questionText).isCorrect;
}

/**
 * Returns a human-friendly label describing the correct answer(s)
 * e.g.
 * - Pick 2 with [1, 2, 3] -> "1, 2, 3（いずれか2つで正解）"
 * - Pick 2 with [1, 2] -> "1, 2"
 * - 1-choice with [1, 2] -> "1 または 2（どちらかで正解）"
 * - 1-choice with [3] -> "3"
 */
export function formatAnswerDisplay(
  targetAnswer: number | number[] | string | undefined,
  questionText: string = ''
): string {
  const target = normalizeAnswer(targetAnswer);
  const isPickTwo = isPickTwoQuestion(questionText, target);

  if (isPickTwo) {
    if (target.length >= 3) {
      return `${target.join(', ')}（※3つのうちいずれか2つで正解）`;
    }
    return `${target.join(', ')}（2つ選択）`;
  } else {
    if (target.length >= 2) {
      return `${target.join(' または ')}（※どちらかで正解）`;
    }
    return String(target[0] || 1);
  }
}
