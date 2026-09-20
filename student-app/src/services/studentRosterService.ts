import { StudentLocalProfile, DeliveredTest } from '../types';

const LOCAL_STORAGE_KEY_STUDENT_ID = 'ot_student_id';
const LOCAL_STORAGE_KEY_STUDENT_GRADE = 'ot_student_grade';
const LOCAL_STORAGE_KEY_STUDENT_NAME = 'ot_student_name';

/**
 * Get student local profile stored on the device
 */
export function getStudentLocalProfile(): StudentLocalProfile | null {
  try {
    const studentId = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENT_ID);
    if (!studentId || !studentId.trim()) {
      return null;
    }
    const rawGrade = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENT_GRADE);
    const grade = rawGrade ? Number(rawGrade) : 1;
    const name = localStorage.getItem(LOCAL_STORAGE_KEY_STUDENT_NAME) || undefined;

    return {
      studentId: studentId.trim().toUpperCase(),
      grade: isNaN(grade) || grade < 1 || grade > 4 ? 1 : grade,
      name: name?.trim() || undefined
    };
  } catch {
    return null;
  }
}

/**
 * Save student profile on this device's localStorage
 */
export function saveStudentLocalProfile(profile: StudentLocalProfile): void {
  try {
    const cleanId = profile.studentId.trim().toUpperCase();
    localStorage.setItem(LOCAL_STORAGE_KEY_STUDENT_ID, cleanId);
    localStorage.setItem(LOCAL_STORAGE_KEY_STUDENT_GRADE, String(profile.grade || 1));
    if (profile.name && profile.name.trim()) {
      localStorage.setItem(LOCAL_STORAGE_KEY_STUDENT_NAME, profile.name.trim());
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_NAME);
    }
  } catch (e) {
    console.error('Failed to save student profile locally:', e);
  }
}

export const getStudentProfile = getStudentLocalProfile;
export const saveStudentProfile = saveStudentLocalProfile;

export function clearStudentLocalProfile(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_ID);
    localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_GRADE);
    localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_NAME);
  } catch {}
}
export const clearStudentProfile = clearStudentLocalProfile;

/**
 * Check if a delivered test is targeted to this student
 */
export function isTestEligibleForStudent(
  test: DeliveredTest,
  profile: StudentLocalProfile | null
): { eligible: boolean; reason?: string } {
  if (!test.targetType || test.targetType === 'all') {
    return { eligible: true };
  }

  if (!profile || !profile.studentId) {
    return { 
      eligible: false, 
      reason: '学籍番号を登録すると、該当するテストを受験できます' 
    };
  }

  if (test.targetType === 'grade') {
    const targetGrades = test.targetGrades || [];
    if (targetGrades.length === 0) return { eligible: true };
    if (targetGrades.includes(profile.grade)) {
      return { eligible: true };
    }
    const gradeLabels = targetGrades.map(g => `${g}年生`).join('・');
    return { 
      eligible: false, 
      reason: `この小テストは【${gradeLabels}】対象です（あなたは現在${profile.grade}年生に設定されています）` 
    };
  }

  if (test.targetType === 'individual') {
    const targetIds = (test.targetStudentIds || []).map(id => id.trim().toUpperCase());
    const studentCleanId = profile.studentId.trim().toUpperCase();
    if (targetIds.includes(studentCleanId)) {
      return { eligible: true };
    }
    return { 
      eligible: false, 
      reason: 'この小テストは指定された特定の学生のみ対象です' 
    };
  }

  return { eligible: true };
}
