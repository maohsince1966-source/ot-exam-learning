import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Persistence directory
  const DATA_DIR = path.join(process.cwd(), "data");
  const TESTS_FILE = path.join(DATA_DIR, "shared_tests.json");
  const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
  const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
  const STUDENTS_FILE = path.join(DATA_DIR, "students_roster.json");
  const DELETED_TESTS_FILE = path.join(DATA_DIR, "deleted_tests.json");

  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error("Failed to create data dir", e);
    }
  }

  // Load in-memory tests
  let storedTests: Record<string, { code: string; test: any; questions: any[]; createdAt: string }> = {};
  try {
    if (fs.existsSync(TESTS_FILE)) {
      const raw = fs.readFileSync(TESTS_FILE, "utf-8");
      storedTests = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to read tests file", err);
  }

  // Load deleted tests tombstone list
  let storedDeletedTestIds: Set<string> = new Set();
  try {
    if (fs.existsSync(DELETED_TESTS_FILE)) {
      const raw = fs.readFileSync(DELETED_TESTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        storedDeletedTestIds = new Set(parsed);
      }
    }
  } catch (err) {
    console.error("Failed to read deleted tests file", err);
  }

  const saveDeletedTestsToDisk = () => {
    try {
      fs.writeFileSync(DELETED_TESTS_FILE, JSON.stringify(Array.from(storedDeletedTestIds), null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write deleted tests to disk", err);
    }
  };

  // Filter out any legacy sample test
  if (storedTests["XCFTZL"]) {
    delete storedTests["XCFTZL"];
    try {
      fs.writeFileSync(TESTS_FILE, JSON.stringify(storedTests, null, 2), "utf-8");
    } catch {}
  }

  // Sample IDs that should never be included
  const SAMPLE_QUESTION_IDS = new Set([
    "50-PM-021", "61-AM-028", "48-PM-021", "59-PM-001", "46-PM-022",
    "61-PM-001", "49-PM-029", "42-AM-001", "44-AM-041", "49-PM-003"
  ]);

  // Load in-memory questions
  let storedQuestions: any[] = [];
  try {
    if (fs.existsSync(QUESTIONS_FILE)) {
      const raw = fs.readFileSync(QUESTIONS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        storedQuestions = parsed.filter(q => q && q.id && !SAMPLE_QUESTION_IDS.has(q.id));
      }
    }
  } catch (err) {
    console.error("Failed to read questions file", err);
  }

  // Load in-memory submissions
  let storedSubmissions: any[] = [];
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      const raw = fs.readFileSync(SUBMISSIONS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        storedSubmissions = parsed;
      }
    }
  } catch (err) {
    console.error("Failed to read submissions file", err);
  }

  // Load in-memory student roster (1-4 grade management)
  let storedStudents: Array<{ studentId: string; grade: number; name?: string; notes?: string; registeredAt: string }> = [];
  try {
    if (fs.existsSync(STUDENTS_FILE)) {
      const raw = fs.readFileSync(STUDENTS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter out legacy auto-generated dummy sample students
        storedStudents = parsed.filter(s => 
          s && s.studentId && 
          !(s.name && /^[1-4]年[A-Z]組 学生\d{2}$/.test(s.name))
        );
      }
    }
  } catch (err) {
    console.error("Failed to read students file", err);
  }

  // NOTE: Do NOT auto-populate fake students on restart!
  // Roster should only contain user-registered students or explicitly loaded samples.

  const saveStudentsToDisk = () => {
    try {
      fs.writeFileSync(STUDENTS_FILE, JSON.stringify(storedStudents, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write students to disk", err);
    }
  };

  const saveTestsToDisk = () => {
    try {
      fs.writeFileSync(TESTS_FILE, JSON.stringify(storedTests, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write tests to disk", err);
    }
  };

  const saveQuestionsToDisk = () => {
    try {
      fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(storedQuestions, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write questions to disk", err);
    }
  };

  const saveSubmissionsToDisk = () => {
    try {
      fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(storedSubmissions, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write submissions to disk", err);
    }
  };

  // Helper to generate 6-character code (uppercase letters and numbers without ambiguous 0/O, 1/I)
  const generateCode = (): string => {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // API Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Proxy image endpoint to bypass CORS, Referer, and hotlink restrictions
  app.get("/api/proxy-image", async (req, res) => {
    const rawUrl = req.query.url as string;
    if (!rawUrl) {
      return res.status(400).send("url parameter is required");
    }

    try {
      let targetUrl = rawUrl;

      // Extract Google Drive ID if present
      const driveMatch = targetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) || 
                         targetUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/i) ||
                         targetUrl.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);

      if (driveMatch && driveMatch[1]) {
        targetUrl = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
      } else if (targetUrl.includes("dropbox.com")) {
        targetUrl = targetUrl.replace(/[?&]dl=0/, "");
        targetUrl = targetUrl.includes("?") ? `${targetUrl}&raw=1` : `${targetUrl}?raw=1`;
      }

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
      });

      if (!response.ok) {
        // Fallback for Google drive thumbnail endpoint if lh3 fails
        if (driveMatch && driveMatch[1]) {
          const thumbResp = await fetch(`https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1600`, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "image/*"
            }
          });
          if (thumbResp.ok) {
            const thumbCt = thumbResp.headers.get("content-type") || "image/jpeg";
            res.setHeader("Content-Type", thumbCt);
            res.setHeader("Cache-Control", "public, max-age=86400");
            const buf = await thumbResp.arrayBuffer();
            return res.send(Buffer.from(buf));
          }
        }
        return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buffer = await response.arrayBuffer();
      return res.send(Buffer.from(buffer));
    } catch (err: any) {
      return res.status(500).send(`Image proxy error: ${err.message}`);
    }
  });

  // Get list of all registered past questions
  app.get("/api/questions", (req, res) => {
    res.json({ questions: storedQuestions });
  });

  // Save / Update question bank
  app.post("/api/questions", (req, res) => {
    try {
      const { questions, replace } = req.body;
      if (!Array.isArray(questions)) {
        return res.status(400).json({ error: "Invalid payload: questions array required" });
      }

      const cleanedQuestions = questions.filter(q => q && q.id && !SAMPLE_QUESTION_IDS.has(q.id));

      if (replace) {
        storedQuestions = cleanedQuestions;
      } else {
        const qMap = new Map<string, any>(storedQuestions.map(q => [q.id, q]));
        cleanedQuestions.forEach(q => {
          if (q && q.id) {
            qMap.set(q.id, q);
          }
        });
        storedQuestions = Array.from(qMap.values());
      }

      saveQuestionsToDisk();
      return res.json({ success: true, count: storedQuestions.length });
    } catch (err: any) {
      console.error("Error saving questions", err);
      return res.status(500).json({ error: err.message || "Failed to save questions" });
    }
  });

  // Helper to mark a test as permanently deleted and purge from storage
  const markAndPurgeTest = (identifier: string) => {
    if (!identifier) return false;
    const raw = identifier.trim();
    const upper = raw.toUpperCase();
    let foundAny = false;

    // Add to tombstone set
    storedDeletedTestIds.add(raw);
    storedDeletedTestIds.add(upper);

    // Also look for matching keys in storedTests
    const keysToDelete: string[] = [];
    for (const [key, item] of Object.entries(storedTests)) {
      if (!item) continue;
      const testId = item.test?.id;
      const itemCode = item.code;
      if (
        key === raw ||
        key.toUpperCase() === upper ||
        itemCode === raw ||
        itemCode?.toUpperCase() === upper ||
        testId === raw ||
        testId?.toUpperCase() === upper ||
        item.test?.code === raw ||
        item.test?.code?.toUpperCase() === upper
      ) {
        keysToDelete.push(key);
        if (testId) {
          storedDeletedTestIds.add(testId);
          storedDeletedTestIds.add(testId.toUpperCase());
        }
        if (itemCode) {
          storedDeletedTestIds.add(itemCode);
          storedDeletedTestIds.add(itemCode.toUpperCase());
        }
        foundAny = true;
      }
    }

    for (const key of keysToDelete) {
      delete storedTests[key];
    }

    if (keysToDelete.length > 0) {
      saveTestsToDisk();
    }
    saveDeletedTestsToDisk();
    return foundAny;
  };

  // Get list of all delivered tests
  app.get("/api/tests", (req, res) => {
    const list = Object.values(storedTests)
      .filter(item => {
        if (!item || !item.test) return false;
        const testId = item.test.id;
        const code = item.code;
        if (
          storedDeletedTestIds.has(code) ||
          storedDeletedTestIds.has(code.toUpperCase()) ||
          (testId && (storedDeletedTestIds.has(testId) || storedDeletedTestIds.has(testId.toUpperCase())))
        ) {
          return false;
        }
        return true;
      })
      .map(item => ({
        code: item.code,
        test: {
          ...item.test,
          code: item.code,
          questions: item.questions || item.test.questions || []
        },
        questionsCount: item.questions ? item.questions.length : 0,
        createdAt: item.createdAt
      }));
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      tests: list,
      deletedTestIds: Array.from(storedDeletedTestIds)
    });
  });

  // Save / Share a test
  app.post("/api/tests", (req, res) => {
    try {
      const { test, questions } = req.body;
      if (!test || !Array.isArray(questions)) {
        return res.status(400).json({ error: "Invalid payload: test and questions array required" });
      }

      // Check if already stored
      let existingCode = Object.keys(storedTests).find(k => storedTests[k].test.id === test.id);
      let code: string;

      if (existingCode) {
        code = storedTests[existingCode].code;
        storedTests[code] = {
          code,
          test: { ...test, code },
          questions,
          createdAt: storedTests[existingCode].createdAt || new Date().toISOString()
        };
      } else {
        do {
          code = generateCode();
        } while (storedTests[code]);

        storedTests[code] = {
          code,
          test: { ...test, code },
          questions,
          createdAt: test.createdAt || new Date().toISOString()
        };
      }

      // Ensure newly delivered test is not in deleted tombstones
      if (test.id) {
        storedDeletedTestIds.delete(test.id);
        storedDeletedTestIds.delete(test.id.toUpperCase());
      }
      if (code) {
        storedDeletedTestIds.delete(code);
        storedDeletedTestIds.delete(code.toUpperCase());
      }
      saveDeletedTestsToDisk();
      saveTestsToDisk();

      return res.json({
        success: true,
        code,
        id: test.id,
        test: storedTests[code].test,
        questionsCount: questions.length
      });
    } catch (err: any) {
      console.error("Error saving test", err);
      return res.status(500).json({ error: err.message || "Failed to save test" });
    }
  });

  // Client-Server Bidirectional Tests Sync (rehydrates server storage after container restarts)
  app.post("/api/tests/sync", (req, res) => {
    try {
      const payload = req.body;
      const tests = Array.isArray(payload) ? payload : (payload?.tests || []);
      if (!Array.isArray(tests)) {
        return res.status(400).json({ error: "Invalid payload: tests array required" });
      }

      let restoredCount = 0;
      for (const t of tests) {
        if (!t || !t.id) continue;
        const testId = String(t.id).trim();
        const code = t.code ? String(t.code).trim().toUpperCase() : "";

        // Skip if explicitly deleted
        if (
          storedDeletedTestIds.has(testId) ||
          storedDeletedTestIds.has(testId.toUpperCase()) ||
          (code && (storedDeletedTestIds.has(code) || storedDeletedTestIds.has(code.toUpperCase())))
        ) {
          continue;
        }

        // Find existing test by id or code
        let targetCode = code;
        const existingEntry = Object.values(storedTests).find(
          item => item.test?.id === testId || (code && item.code === code)
        );

        if (existingEntry) {
          targetCode = existingEntry.code;
          storedTests[targetCode] = {
            ...existingEntry,
            test: {
              ...existingEntry.test,
              ...t,
              code: targetCode
            },
            questions: (Array.isArray(t.questions) && t.questions.length > 0)
              ? t.questions
              : existingEntry.questions,
            createdAt: existingEntry.createdAt || t.createdAt || new Date().toISOString()
          };
        } else {
          if (!targetCode) {
            do {
              targetCode = generateCode();
            } while (storedTests[targetCode]);
          }
          storedTests[targetCode] = {
            code: targetCode,
            test: { ...t, code: targetCode },
            questions: t.questions || [],
            createdAt: t.createdAt || new Date().toISOString()
          };
          restoredCount++;
        }
      }

      if (restoredCount > 0 || tests.length > 0) {
        saveTestsToDisk();
      }

      const activeList = Object.values(storedTests).map(item => ({
        code: item.code,
        test: {
          ...item.test,
          code: item.code,
          questions: item.questions || item.test?.questions || []
        },
        questionsCount: item.questions ? item.questions.length : 0,
        createdAt: item.createdAt
      }));

      return res.json({
        success: true,
        restoredCount,
        totalTests: activeList.length,
        tests: activeList
      });
    } catch (err: any) {
      console.error("Error syncing tests:", err);
      return res.status(500).json({ error: err.message || "Failed to sync tests" });
    }
  });

  // Get a specific test and its questions by 6-digit code or testId
  app.get("/api/tests/code/:code", (req, res) => {
    const { code } = req.params;
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

    if (storedDeletedTestIds.has(clean) || storedDeletedTestIds.has(code.trim())) {
      return res.status(404).json({ error: "Test has been deleted", deleted: true });
    }

    if (storedTests[clean]) {
      return res.json(storedTests[clean]);
    }
    const found = Object.values(storedTests).find(item => item.code === clean);
    if (found) {
      return res.json(found);
    }
    return res.status(404).json({ error: "Test not found" });
  });

  app.get("/api/tests/:codeOrId", (req, res) => {
    const { codeOrId } = req.params;
    const clean = codeOrId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

    if (storedDeletedTestIds.has(clean) || storedDeletedTestIds.has(codeOrId.trim())) {
      return res.status(404).json({ error: "Test has been deleted", deleted: true });
    }

    // Check by code
    if (storedTests[clean]) {
      return res.json(storedTests[clean]);
    }

    // Check by test.id
    const found = Object.values(storedTests).find(
      item => item.test.id === codeOrId || item.code === clean
    );
    if (found) {
      return res.json(found);
    }

    return res.status(404).json({ error: "Test not found" });
  });

  // Delete a delivered test by code or ID (DELETE method)
  app.delete("/api/tests/:codeOrId", (req, res) => {
    const { codeOrId } = req.params;
    markAndPurgeTest(codeOrId);
    return res.json({
      success: true,
      message: "Test deleted successfully",
      deletedTestIds: Array.from(storedDeletedTestIds)
    });
  });

  // Delete a delivered test by code and/or ID (POST method for extra reliability)
  app.post("/api/tests/delete", (req, res) => {
    const { id, code } = req.body || {};
    if (id) markAndPurgeTest(id);
    if (code) markAndPurgeTest(code);
    return res.json({
      success: true,
      message: "Test deleted successfully",
      deletedTestIds: Array.from(storedDeletedTestIds)
    });
  });

  // SUBMISSIONS API (Reliable backend storage for student quiz results)

  // Submit test results from student
  app.post("/api/submissions", (req, res) => {
    try {
      const submission = req.body;
      if (!submission || !submission.testId) {
        return res.status(400).json({ error: "Invalid submission payload: testId required" });
      }

      const subId = submission.id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newSubmission = {
        ...submission,
        id: subId,
        studentName: (submission.studentName || "受講生").trim(),
        studentId: (submission.studentId || "").trim(),
        submittedAt: submission.submittedAt || new Date().toISOString()
      };

      // Upsert: replace if existing id, else prepend
      const existingIdx = storedSubmissions.findIndex(s => s.id === subId);
      if (existingIdx >= 0) {
        storedSubmissions[existingIdx] = newSubmission;
      } else {
        storedSubmissions.unshift(newSubmission);
      }

      saveSubmissionsToDisk();

      return res.json({
        success: true,
        id: subId,
        submission: newSubmission
      });
    } catch (err: any) {
      console.error("Error saving submission:", err);
      return res.status(500).json({ error: err.message || "Failed to save submission" });
    }
  });

  // Client-Server Bidirectional Submissions Sync (rehydrates server storage from client cache)
  app.post("/api/submissions/sync", (req, res) => {
    try {
      const payload = req.body;
      const list = Array.isArray(payload) ? payload : (payload?.submissions || []);
      if (!Array.isArray(list)) {
        return res.status(400).json({ error: "Invalid payload: submissions array required" });
      }

      let addedCount = 0;
      let updatedCount = 0;

      for (const s of list) {
        if (!s || !s.testId) continue;
        const subId = String(s.id || `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`).trim();
        const existingIdx = storedSubmissions.findIndex(item => item.id === subId);
        
        const record = {
          ...s,
          id: subId,
          testId: String(s.testId).trim(),
          testCode: s.testCode ? String(s.testCode).trim().toUpperCase() : "",
          testTitle: String(s.testTitle || "小テスト").trim(),
          studentName: String(s.studentName || "受講生").trim(),
          studentId: String(s.studentId || "").trim(),
          score: typeof s.score === "number" ? s.score : 0,
          total: typeof s.total === "number" ? s.total : 0,
          scorePercent: typeof s.scorePercent === "number" ? s.scorePercent : 0,
          passed: Boolean(s.passed),
          timeSpentSeconds: Number(s.timeSpentSeconds) || 0,
          categoryStats: s.categoryStats || {},
          userAnswers: s.userAnswers || {},
          submittedAt: s.submittedAt || new Date().toISOString()
        };

        if (existingIdx >= 0) {
          storedSubmissions[existingIdx] = record;
          updatedCount++;
        } else {
          storedSubmissions.unshift(record);
          addedCount++;
        }
      }

      // Sort newest first
      storedSubmissions.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      if (addedCount > 0 || updatedCount > 0) {
        saveSubmissionsToDisk();
      }

      return res.json({
        success: true,
        addedCount,
        updatedCount,
        totalSubmissions: storedSubmissions.length,
        submissions: storedSubmissions
      });
    } catch (err: any) {
      console.error("Error syncing submissions:", err);
      return res.status(500).json({ error: err.message || "Failed to sync submissions" });
    }
  });

  // Diagnostics and recovery stats endpoint
  app.get("/api/system/recovery-stats", (req, res) => {
    res.json({
      testsCount: Object.keys(storedTests).length,
      submissionsCount: storedSubmissions.length,
      studentsCount: storedStudents.length,
      deletedTestsCount: storedDeletedTestIds.size,
      serverTime: new Date().toISOString()
    });
  });

  // Get submissions (optionally filtered by testId)
  app.get("/api/submissions", (req, res) => {
    try {
      const { testId } = req.query;
      let results = storedSubmissions;
      if (testId && typeof testId === "string") {
        results = storedSubmissions.filter(s => s.testId === testId);
      }
      return res.json({
        success: true,
        count: results.length,
        submissions: results
      });
    } catch (err: any) {
      console.error("Error fetching submissions:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch submissions" });
    }
  });

  // Delete a submission
  app.delete("/api/submissions/:id", (req, res) => {
    try {
      const { id } = req.params;
      const initialLen = storedSubmissions.length;
      storedSubmissions = storedSubmissions.filter(s => s.id !== id);
      if (storedSubmissions.length !== initialLen) {
        saveSubmissionsToDisk();
        return res.json({ success: true });
      }
      return res.status(404).json({ error: "Submission not found" });
    } catch (err: any) {
      console.error("Error deleting submission:", err);
      return res.status(500).json({ error: err.message || "Failed to delete submission" });
    }
  });

  // Delete all submissions for a test
  app.delete("/api/submissions/by-test/:testId", (req, res) => {
    try {
      const { testId } = req.params;
      storedSubmissions = storedSubmissions.filter(s => s.testId !== testId);
      saveSubmissionsToDisk();
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting submissions by testId:", err);
      return res.status(500).json({ error: err.message || "Failed to delete submissions" });
    }
  });

  // STUDENT ROSTER API (1-4 Grade student ID management)

  // Get student roster
  app.get("/api/students", (req, res) => {
    try {
      const { grade } = req.query;
      let list = storedStudents;
      if (grade) {
        const gNum = Number(grade);
        if (!isNaN(gNum)) {
          list = storedStudents.filter(s => s.grade === gNum);
        }
      }
      return res.json({
        success: true,
        count: list.length,
        students: list
      });
    } catch (err: any) {
      console.error("Error fetching students:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch students" });
    }
  });

  // Add / Update single student or batch of students
  app.post("/api/students", (req, res) => {
    try {
      const payload = req.body;
      if (!payload) {
        return res.status(400).json({ error: "Student data is required" });
      }

      const itemsToAdd = Array.isArray(payload) ? payload : [payload];
      let addedCount = 0;
      let updatedCount = 0;

      for (const item of itemsToAdd) {
        const cleanId = String(item.studentId || "").trim().toUpperCase();
        if (!cleanId) continue;
        const grade = Number(item.grade) || 1;
        const name = (item.name || "").trim();
        const notes = (item.notes || "").trim();

        const existingIdx = storedStudents.findIndex(s => s.studentId === cleanId);
        if (existingIdx >= 0) {
          storedStudents[existingIdx] = {
            ...storedStudents[existingIdx],
            grade,
            name: name || storedStudents[existingIdx].name,
            notes: notes || storedStudents[existingIdx].notes
          };
          updatedCount++;
        } else {
          storedStudents.push({
            studentId: cleanId,
            grade,
            name: name || `学生 (${cleanId})`,
            notes,
            registeredAt: new Date().toISOString()
          });
          addedCount++;
        }
      }

      // Sort by grade, then studentId
      storedStudents.sort((a, b) => {
        if (a.grade !== b.grade) return a.grade - b.grade;
        return a.studentId.localeCompare(b.studentId);
      });

      saveStudentsToDisk();

      return res.json({
        success: true,
        addedCount,
        updatedCount,
        totalStudents: storedStudents.length
      });
    } catch (err: any) {
      console.error("Error saving students:", err);
      return res.status(500).json({ error: err.message || "Failed to save students" });
    }
  });

  // Delete student by studentId
  app.delete("/api/students/:studentId", (req, res) => {
    try {
      const { studentId } = req.params;
      const cleanId = String(studentId || "").trim().toUpperCase();
      const initialLen = storedStudents.length;
      storedStudents = storedStudents.filter(s => String(s.studentId || "").trim().toUpperCase() !== cleanId);

      if (storedStudents.length !== initialLen) {
        saveStudentsToDisk();
      }
      return res.json({ success: true, deleted: storedStudents.length !== initialLen });
    } catch (err: any) {
      console.error("Error deleting student:", err);
      return res.status(500).json({ error: err.message || "Failed to delete student" });
    }
  });

  // Client-Server Bidirectional Sync (rehydrates server storage after container restarts)
  app.post("/api/students/sync", (req, res) => {
    try {
      const payload = req.body;
      const list = Array.isArray(payload) ? payload : (payload?.students || []);
      
      const map = new Map<string, any>();
      // Put existing real students into map
      for (const s of storedStudents) {
        if (s && s.studentId && !(s.name && /^[1-4]年[A-Z]組 学生\d{2}$/.test(s.name))) {
          map.set(s.studentId.toUpperCase(), s);
        }
      }
      // Add incoming client students
      for (const s of list) {
        if (s && s.studentId) {
          const cleanId = String(s.studentId).trim().toUpperCase();
          if (!cleanId) continue;
          const existing = map.get(cleanId);
          map.set(cleanId, {
            studentId: cleanId,
            grade: Number(s.grade) || existing?.grade || 1,
            name: (s.name || "").trim() || (existing?.name || ""),
            notes: (s.notes || "").trim() || (existing?.notes || "学生端末より自己登録"),
            registeredAt: existing?.registeredAt || s.registeredAt || new Date().toISOString()
          });
        }
      }

      storedStudents = Array.from(map.values());
      storedStudents.sort((a, b) => {
        if (a.grade !== b.grade) return a.grade - b.grade;
        return a.studentId.localeCompare(b.studentId);
      });

      saveStudentsToDisk();

      return res.json({
        success: true,
        count: storedStudents.length,
        students: storedStudents
      });
    } catch (err: any) {
      console.error("Error syncing students:", err);
      return res.status(500).json({ error: err.message || "Failed to sync students" });
    }
  });

  // Load sample roster explicitly (only if teacher explicitly triggers it)
  app.post("/api/students/sample", (req, res) => {
    try {
      const defaultRoster = [
        { studentId: "OT2601", grade: 1, name: "1年A組 学生01", notes: "1年生", registeredAt: new Date().toISOString() },
        { studentId: "OT2602", grade: 1, name: "1年A組 学生02", notes: "1年生", registeredAt: new Date().toISOString() },
        { studentId: "OT2501", grade: 2, name: "2年A組 学生01", notes: "2年生", registeredAt: new Date().toISOString() },
        { studentId: "OT2502", grade: 2, name: "2年A組 学生02", notes: "2年生", registeredAt: new Date().toISOString() },
        { studentId: "OT2401", grade: 3, name: "3年A組 学生01", notes: "3年生", registeredAt: new Date().toISOString() },
        { studentId: "OT2402", grade: 3, name: "3年A組 学生02", notes: "3年生", registeredAt: new Date().toISOString() },
        { studentId: "OT2301", grade: 4, name: "4年A組 学生01", notes: "4年生 (国試受験年)", registeredAt: new Date().toISOString() },
        { studentId: "OT2302", grade: 4, name: "4年A組 学生02", notes: "4年生 (国試受験年)", registeredAt: new Date().toISOString() },
      ];
      storedStudents = defaultRoster;
      saveStudentsToDisk();
      return res.json({ success: true, count: storedStudents.length, students: storedStudents });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Clear all students (explicit reset)
  app.delete("/api/students", (req, res) => {
    try {
      storedStudents = [];
      saveStudentsToDisk();
      return res.json({ success: true, count: 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
