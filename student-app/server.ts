import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Shared data directory (looks in ./data or ../data for seamless operation standalone or monorepo)
  const resolveDataDir = () => {
    const localDir = path.join(process.cwd(), "data");
    const parentDir = path.join(process.cwd(), "..", "data");
    if (fs.existsSync(parentDir) && fs.existsSync(path.join(parentDir, "questions.json"))) {
      return parentDir;
    }
    return localDir;
  };

  const DATA_DIR = resolveDataDir();
  const TESTS_FILE = path.join(DATA_DIR, "shared_tests.json");
  const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
  const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");

  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error("Failed to create data dir", e);
    }
  }

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "ot-student-portal", timestamp: new Date().toISOString() });
  });

  // GET /api/questions - Fetch public question bank
  app.get("/api/questions", (_req, res) => {
    try {
      if (fs.existsSync(QUESTIONS_FILE)) {
        const raw = fs.readFileSync(QUESTIONS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return res.json({ questions: parsed });
        }
      }
    } catch (err) {
      console.error("Failed to read questions", err);
    }
    return res.json({ questions: [] });
  });

  // GET /api/tests - Fetch active delivered tests
  app.get("/api/tests", (_req, res) => {
    try {
      if (fs.existsSync(TESTS_FILE)) {
        const raw = fs.readFileSync(TESTS_FILE, "utf-8");
        const storedTests = JSON.parse(raw);
        const list = Object.values(storedTests).map((item: any) => ({
          ...item.test,
          code: item.code,
          questions: item.questions || []
        }));
        return res.json({ tests: list });
      }
    } catch (err) {
      console.error("Failed to read tests", err);
    }
    return res.json({ tests: [] });
  });

  // GET /api/tests/:code - Fetch specific test by 6-character code
  app.get("/api/tests/:code", (req, res) => {
    const code = req.params.code.toUpperCase().trim();
    try {
      if (fs.existsSync(TESTS_FILE)) {
        const raw = fs.readFileSync(TESTS_FILE, "utf-8");
        const storedTests = JSON.parse(raw);
        if (storedTests[code]) {
          return res.json(storedTests[code]);
        }
      }
    } catch (err) {
      console.error("Error reading test by code", err);
    }
    return res.status(404).json({ error: "小テストが見つかりませんでした。" });
  });

  // POST /api/results - Submit student test answer sheet
  app.post("/api/results", (req, res) => {
    try {
      const submission = req.body;
      if (!submission || !submission.testId) {
        return res.status(400).json({ error: "Invalid submission data" });
      }

      let submissions: any[] = [];
      if (fs.existsSync(SUBMISSIONS_FILE)) {
        try {
          const raw = fs.readFileSync(SUBMISSIONS_FILE, "utf-8");
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) submissions = parsed;
        } catch {}
      }

      const newSubmission = {
        ...submission,
        id: submission.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        submittedAt: submission.submittedAt || new Date().toISOString()
      };

      submissions.push(newSubmission);

      try {
        fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), "utf-8");
      } catch (err) {
        console.error("Failed to write submission", err);
      }

      return res.json({ success: true, submissionId: newSubmission.id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to save submission" });
    }
  });

  // GET /api/results/student/:studentId - Get past submissions for a student
  app.get("/api/results/student/:studentId", (req, res) => {
    const studentId = req.params.studentId.trim().toUpperCase();
    try {
      if (fs.existsSync(SUBMISSIONS_FILE)) {
        const raw = fs.readFileSync(SUBMISSIONS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const studentSubmissions = parsed.filter(s => (s.studentId || "").toUpperCase() === studentId);
          return res.json({ submissions: studentSubmissions });
        }
      }
    } catch {}
    return res.json({ submissions: [] });
  });

  // Vite middleware in dev or static dist in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Student Portal server running on http://localhost:${PORT}`);
  });
}

startServer();
