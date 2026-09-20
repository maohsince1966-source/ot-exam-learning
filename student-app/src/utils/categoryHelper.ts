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

export function isPickTwoQuestion(questionText: string, answer?: number | number[]): boolean {
  if (questionText) {
    const regex = /(2つ選べ|二つ選べ|２つ選べ|2\s*つ選べ|２\s*つ選べ|2つ選択|２つ選択|二つ選択)/i;
    if (regex.test(questionText)) {
      return true;
    }
  }

  if (Array.isArray(answer) && answer.length >= 3) {
    return true;
  }

  return false;
}

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
    const halfWidth = answer.replace(/[１-５]/g, m => 
      String.fromCharCode(m.charCodeAt(0) - 0xFEE0)
    );
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
    const chosen = userSelected[0];

    if (targetAnswers.length >= 2) {
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

export function isAnswerCorrect(
  userChoices: number[] | number | undefined,
  targetAnswer: number | number[] | string | undefined,
  questionText: string = ''
): boolean {
  return evaluateAnswer(userChoices, targetAnswer, questionText).isCorrect;
}

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
