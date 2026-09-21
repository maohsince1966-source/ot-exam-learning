import { StudentRosterItem, StudentLocalProfile, DeliveredTest } from '../types';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';

const STUDENTS_COLLECTION = 'students';
const LOCAL_STORAGE_KEY_STUDENT_ID = 'ot_student_id';
const LOCAL_STORAGE_KEY_STUDENT_GRADE = 'ot_student_grade';
const LOCAL_STORAGE_KEY_STUDENT_NAME = 'ot_student_name';
export const LOCAL_STORAGE_KEY_ROSTER = 'ot_student_roster_v2';

/**
 * Filter out auto-generated dummy sample entries (e.g. "1年A組 学生01")
 */
export function isDummySampleStudent(s: Partial<StudentRosterItem>): boolean {
  if (!s || !s.studentId) return true;
  if (s.name && /^[1-4]年[A-Z]組 学生\d{2}$/.test(s.name.trim())) {
    return true;
  }
  return false;
}

/**
 * Read student roster directly from browser localStorage
 */
export function getLocalStoredRoster(): StudentRosterItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_ROSTER) || localStorage.getItem('ot_student_roster_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(s => s && s.studentId && !isDummySampleStudent(s));
  } catch (err) {
    console.warn('Failed to read roster from localStorage:', err);
    return [];
  }
}

/**
 * Save student roster directly to browser localStorage
 */
export function saveLocalStoredRoster(list: StudentRosterItem[]): void {
  try {
    const cleanList = list.filter(s => s && s.studentId && !isDummySampleStudent(s));
    localStorage.setItem(LOCAL_STORAGE_KEY_ROSTER, JSON.stringify(cleanList));
  } catch (err) {
    console.error('Failed to save roster to localStorage:', err);
  }
}

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
    const cleanId = String(profile.studentId || '').normalize('NFKC').trim().toUpperCase();
    localStorage.setItem(LOCAL_STORAGE_KEY_STUDENT_ID, cleanId);
    localStorage.setItem(LOCAL_STORAGE_KEY_STUDENT_GRADE, String(profile.grade || 1));
    if (profile.name && profile.name.trim()) {
      localStorage.setItem(LOCAL_STORAGE_KEY_STUDENT_NAME, profile.name.trim());
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_NAME);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('student_profile_updated', { detail: profile }));
    }
  } catch (e) {
    console.error('Failed to save student profile locally:', e);
  }
}

// Aliases for convenience
export const getStudentProfile = getStudentLocalProfile;
export const saveStudentProfile = saveStudentLocalProfile;
export const clearStudentProfile = clearStudentLocalProfile;

/**
 * Clear student local profile
 */
export function clearStudentLocalProfile(): void {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_ID);
    localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_GRADE);
    localStorage.removeItem(LOCAL_STORAGE_KEY_STUDENT_NAME);
  } catch {}
}

/**
 * Fetch student roster (merges localStorage cache + Server API + Cloud Firestore)
 */
export async function fetchStudentRoster(grade?: number): Promise<StudentRosterItem[]> {
  const studentMap = new Map<string, StudentRosterItem>();

  // 1. Instantly populate from local storage cache
  const localList = getLocalStoredRoster();
  localList.forEach(s => {
    if (s && s.studentId && !isDummySampleStudent(s)) {
      studentMap.set(s.studentId.toUpperCase(), s);
    }
  });

  // 2. Fetch from Server API - ALWAYS fetch ALL grades to avoid overwriting localStorage with a single grade!
  let serverReturnedEmpty = false;
  try {
    const res = await fetch('/api/students');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.students)) {
        const realServerStudents = data.students.filter(
          (s: StudentRosterItem) => s && s.studentId && !isDummySampleStudent(s)
        );
        if (realServerStudents.length === 0) {
          serverReturnedEmpty = true;
        } else {
          realServerStudents.forEach((s: StudentRosterItem) => {
            studentMap.set(s.studentId.toUpperCase(), s);
          });
        }
      }
    }
  } catch (err) {
    console.warn('Server API student roster fetch error:', err);
  }

  // 3. If server was empty (e.g. cold start / container restart) but local storage has user's students,
  // automatically re-hydrate the server so both remain in sync!
  if (serverReturnedEmpty && studentMap.size > 0) {
    try {
      fetch('/api/students/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: Array.from(studentMap.values()) })
      }).catch(() => {});
    } catch {}
  }

  // 4. Fetch from Cloud Firestore if available
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDocs(collection(db, STUDENTS_COLLECTION));
      snap.forEach(docSnap => {
        const item = docSnap.data() as StudentRosterItem;
        if (item && item.studentId && !isDummySampleStudent(item)) {
          studentMap.set(item.studentId.toUpperCase(), {
            ...item,
            studentId: item.studentId.toUpperCase()
          });
        }
      });
    } catch (err) {
      // Cloud Firestore might be offline or disabled on this GCP project; fallback safely
      console.warn('Firestore student roster fetch notice:', err);
    }
  }

  const list = Array.from(studentMap.values());
  // Save merged real students across ALL grades back to localStorage to guarantee durability
  saveLocalStoredRoster(list);

  // Filter by grade for the caller if specified
  if (grade !== undefined && grade > 0) {
    return list.filter(s => s.grade === grade);
  }
  return list.sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade;
    return a.studentId.localeCompare(b.studentId);
  });
}

/**
 * Add or update students in the teacher's roster (localStorage + Server API + Cloud Firestore)
 */
export async function saveStudentsToRoster(
  students: StudentRosterItem | StudentRosterItem[]
): Promise<{ success: boolean; totalStudents?: number; error?: string }> {
  const items = Array.isArray(students) ? students : [students];
  const validItems = items.filter(s => s && String(s.studentId || '').trim().length > 0);

  if (validItems.length === 0) {
    return { success: false, error: '有効な学籍番号が入力されていません' };
  }

  // 1. Immediately persist to localStorage (Synchronous, infallible client storage)
  const currentLocal = getLocalStoredRoster();
  const studentMap = new Map<string, StudentRosterItem>();
  currentLocal.forEach(s => studentMap.set(s.studentId.toUpperCase(), s));

  validItems.forEach(item => {
    const cleanId = item.studentId.trim().toUpperCase();
    const existing = studentMap.get(cleanId);
    studentMap.set(cleanId, {
      studentId: cleanId,
      grade: item.grade || existing?.grade || 1,
      name: item.name !== undefined ? (item.name?.trim() || '') : (existing?.name || ''),
      notes: item.notes !== undefined ? (item.notes?.trim() || '') : (existing?.notes || ''),
      registeredAt: existing?.registeredAt || item.registeredAt || new Date().toISOString()
    });
  });

  const updatedList = Array.from(studentMap.values());
  saveLocalStoredRoster(updatedList);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('student_roster_updated', { detail: updatedList }));
  }

  // 2. Sync to Server API (with timeout so UI never hangs)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    // Send both batch and direct updates to guarantee persistence across endpoints
    await Promise.allSettled([
      fetch('/api/students/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: updatedList }),
        signal: controller.signal
      }),
      fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validItems),
        signal: controller.signal
      })
    ]).finally(() => {
      clearTimeout(timeoutId);
    });
  } catch (err: any) {
    console.warn('Server API student save notice:', err?.message);
  }

  // 3. Save to Cloud Firestore in background (NON-BLOCKING: do NOT await so UI is instantaneous)
  if (isFirebaseConfigured && db) {
    try {
      // Fire-and-forget in background without blocking return
      Promise.resolve().then(async () => {
        try {
          const promises = validItems.map(item => {
            const cleanId = item.studentId.trim().toUpperCase();
            const docRef = doc(db, STUDENTS_COLLECTION, cleanId);
            return setDoc(docRef, {
              studentId: cleanId,
              grade: item.grade || 1,
              name: item.name || '',
              notes: item.notes || '',
              registeredAt: item.registeredAt || new Date().toISOString()
            }, { merge: true });
          });
          await Promise.all(promises);
        } catch (err) {
          // Cloud Firestore may have rules or connection limits, silently ignore
        }
      });
    } catch (err: any) {
      console.warn('Firestore background save notice:', err?.message);
    }
  }

  return { success: true, totalStudents: updatedList.length };
}

/**
 * Delete a student from the teacher's roster (localStorage + Server API + Cloud Firestore)
 */
export async function deleteStudentFromRoster(studentId: string): Promise<boolean> {
  const cleanId = studentId.trim().toUpperCase();

  // 1. Immediately remove from localStorage
  const currentLocal = getLocalStoredRoster();
  const filtered = currentLocal.filter(s => s.studentId.toUpperCase() !== cleanId);
  saveLocalStoredRoster(filtered);

  // 2. Delete from Server API
  try {
    await fetch(`/api/students/${encodeURIComponent(cleanId)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.warn('Server API student deletion error:', err);
  }

  // 3. Delete from Cloud Firestore
  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, STUDENTS_COLLECTION, cleanId));
    } catch (err) {
      console.warn('Firestore student deletion notice:', err);
    }
  }

  return true;
}

/**
 * Clear all students in the teacher's roster
 */
export async function clearAllStudentsRoster(): Promise<boolean> {
  saveLocalStoredRoster([]);
  try {
    await fetch('/api/students', { method: 'DELETE' });
  } catch {}
  return true;
}

/**
 * Load sample demo roster (explicit trigger only)
 */
export async function loadSampleRoster(): Promise<StudentRosterItem[]> {
  try {
    const res = await fetch('/api/students/sample', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.students)) {
        saveLocalStoredRoster(data.students);
        return data.students;
      }
    }
  } catch {}
  return [];
}

/**
 * Real-time subscription to student roster
 */
export function subscribeStudentRoster(
  callback: (students: StudentRosterItem[]) => void
): () => void {
  let isCancelled = false;
  const studentMap = new Map<string, StudentRosterItem>();

  const notify = () => {
    const list = Array.from(studentMap.values());
    list.sort((a, b) => {
      if (a.grade !== b.grade) return a.grade - b.grade;
      return a.studentId.localeCompare(b.studentId);
    });
    callback(list);
  };

  // Immediate notification from localStorage (0ms instantaneous rendering)
  const localList = getLocalStoredRoster();
  localList.forEach(s => studentMap.set(s.studentId.toUpperCase(), s));
  notify();

  // Network fetch & sync
  fetchStudentRoster().then(list => {
    if (isCancelled) return;
    list.forEach(s => studentMap.set(s.studentId.toUpperCase(), s));
    notify();
  }).catch(() => {});

  // Firestore real-time listener
  let unsubscribeFirestore = () => {};
  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, STUDENTS_COLLECTION);
      unsubscribeFirestore = onSnapshot(
        colRef,
        snapshot => {
          if (isCancelled) return;
          snapshot.docChanges().forEach(change => {
            const docId = change.doc.id.toUpperCase();
            if (change.type === 'removed') {
              studentMap.delete(docId);
            } else {
              const data = change.doc.data() as StudentRosterItem;
              if (data && data.studentId && !isDummySampleStudent(data)) {
                studentMap.set(data.studentId.toUpperCase(), {
                  ...data,
                  studentId: data.studentId.toUpperCase()
                });
              }
            }
          });
          notify();
        },
        err => {
          console.warn('Firestore roster subscription notice:', err?.message);
        }
      );
    } catch (err) {
      console.warn('Failed to subscribe to student roster:', err);
    }
  }

  // Real-time periodic synchronization from server (every 3 seconds)
  // Ensures students registering from external devices/smartphones reflect on teacher screen
  const pollInterval = setInterval(() => {
    if (isCancelled) return;
    fetchStudentRoster().then(list => {
      if (isCancelled) return;
      let hasChanges = false;
      list.forEach(s => {
        const key = s.studentId.toUpperCase();
        const existing = studentMap.get(key);
        if (!existing || existing.grade !== s.grade || existing.name !== s.name || existing.notes !== s.notes) {
          studentMap.set(key, s);
          hasChanges = true;
        }
      });
      if (hasChanges) {
        notify();
      }
    }).catch(() => {});
  }, 3000);

  // Cross-tab and local dispatch listener
  const handleRosterEvent = () => {
    if (isCancelled) return;
    const local = getLocalStoredRoster();
    local.forEach(s => studentMap.set(s.studentId.toUpperCase(), s));
    notify();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('student_roster_updated', handleRosterEvent);
    window.addEventListener('storage', handleRosterEvent);
  }

  return () => {
    isCancelled = true;
    clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('student_roster_updated', handleRosterEvent);
      window.removeEventListener('storage', handleRosterEvent);
    }
    unsubscribeFirestore();
  };
}

/**
 * Check if a delivered test is targeted to a specific student
 */
export function isTestEligibleForStudent(
  test: DeliveredTest,
  profile: StudentLocalProfile | null
): { eligible: boolean; reason?: string } {
  // If no targeting specified, or targetType is 'all', delivered to everyone
  if (!test.targetType || test.targetType === 'all') {
    return { eligible: true };
  }

  // If student hasn't registered yet, inform they need to register their ID/Grade
  if (!profile || !profile.studentId) {
    return { 
      eligible: false, 
      reason: '学籍番号を登録すると、該当するテストを受験できます' 
    };
  }

  // Grade-targeted test
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

  // Individual-targeted test (by studentId)
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
