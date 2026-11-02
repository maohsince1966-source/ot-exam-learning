/**
 * Student Bookmark Service
 * Manages "あとで見直す" (Review Later) question bookmarks in local storage.
 * Synchronizes across tabs and components via custom window events.
 */

export const STORAGE_KEY_BOOKMARKS = 'ot_exam_bookmarked_questions_v1';

/**
 * Retrieve list of bookmarked question IDs
 */
export function getBookmarkedQuestionIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(id => typeof id === 'string' && id.trim().length > 0);
    }
  } catch (err) {
    console.warn('Failed to parse bookmarked question IDs:', err);
  }
  return [];
}

/**
 * Save bookmarked question IDs to localStorage and dispatch event
 */
export function saveBookmarkedQuestionIds(ids: string[]): void {
  try {
    const uniqueIds = Array.from(new Set(ids.filter(id => Boolean(id))));
    localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify(uniqueIds));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('student_bookmarks_updated', { detail: uniqueIds }));
    }
  } catch (err) {
    console.error('Failed to save bookmarked question IDs:', err);
  }
}

/**
 * Check if a specific question is bookmarked
 */
export function isQuestionBookmarked(questionId: string): boolean {
  if (!questionId) return false;
  const current = getBookmarkedQuestionIds();
  return current.includes(questionId);
}

/**
 * Toggle bookmark state for a question.
 * Returns true if now bookmarked, false if unbookmarked.
 */
export function toggleQuestionBookmark(questionId: string): boolean {
  if (!questionId) return false;
  const current = getBookmarkedQuestionIds();
  const index = current.indexOf(questionId);
  let nowBookmarked = false;
  let updated: string[];

  if (index >= 0) {
    updated = current.filter(id => id !== questionId);
    nowBookmarked = false;
  } else {
    updated = [questionId, ...current];
    nowBookmarked = true;
  }

  saveBookmarkedQuestionIds(updated);
  return nowBookmarked;
}

/**
 * Add a question to bookmarks
 */
export function addQuestionBookmark(questionId: string): void {
  if (!questionId) return;
  const current = getBookmarkedQuestionIds();
  if (!current.includes(questionId)) {
    saveBookmarkedQuestionIds([questionId, ...current]);
  }
}

/**
 * Remove a question from bookmarks
 */
export function removeQuestionBookmark(questionId: string): void {
  if (!questionId) return;
  const current = getBookmarkedQuestionIds();
  if (current.includes(questionId)) {
    saveBookmarkedQuestionIds(current.filter(id => id !== questionId));
  }
}

/**
 * Batch remove multiple questions from bookmarks
 */
export function removeBookmarksForQuestions(questionIds: string[]): void {
  if (!questionIds || questionIds.length === 0) return;
  const toRemove = new Set(questionIds);
  const current = getBookmarkedQuestionIds();
  const updated = current.filter(id => !toRemove.has(id));
  saveBookmarkedQuestionIds(updated);
}

/**
 * Clear all bookmarks
 */
export function clearAllQuestionBookmarks(): void {
  saveBookmarkedQuestionIds([]);
}

/**
 * Subscribe to bookmark changes across components and browser tabs
 */
export function subscribeBookmarks(callback: (ids: string[]) => void): () => void {
  const handleCustomEvent = (e: Event) => {
    const custom = e as CustomEvent<string[]>;
    if (custom.detail && Array.isArray(custom.detail)) {
      callback(custom.detail);
    } else {
      callback(getBookmarkedQuestionIds());
    }
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY_BOOKMARKS) {
      callback(getBookmarkedQuestionIds());
    }
  };

  window.addEventListener('student_bookmarks_updated', handleCustomEvent as EventListener);
  window.addEventListener('storage', handleStorageEvent);

  // Initial callback call with current state
  callback(getBookmarkedQuestionIds());

  return () => {
    window.removeEventListener('student_bookmarks_updated', handleCustomEvent as EventListener);
    window.removeEventListener('storage', handleStorageEvent);
  };
}
