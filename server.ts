import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import express from "express";
import path from "path";
import multer from "multer";
// pdf-parse diimport secara dynamic di dalam route handler (hindari crash serverless)
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = express();
const PORT = 3000;
const UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB

// ----------------------------------------------------------------
// Initialize Firebase Cloud Firestore
// Mendukung dua mode: ENV var (Vercel) atau file JSON lokal
// ----------------------------------------------------------------
let db: any = null;
let firebaseInitError: string | null = null;

try {
  let serviceAccount: any;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    serviceAccount = JSON.parse(raw);
    // Fix: Vercel kadang mengescaped \\n menjadi literal, kita normalisasi
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
  }

  if (!serviceAccount) {
    const keyPath = path.join(process.cwd(), "project-vibe-coding-kerjamin-firebase-adminsdk-fbsvc-acda211b65.json");
    if (fs.existsSync(keyPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    }
  }

  if (serviceAccount) {
    const firebaseApp = getApps().length === 0
      ? initializeApp({ credential: cert(serviceAccount) })
      : getApps()[0];

    const DATABASE_ID = process.env.FIREBASE_DATABASE_ID || "ai-studio-57a39df3-2720-4c0c-a5aa-d8e33e5fa656";
    db = getFirestore(firebaseApp, DATABASE_ID);
    console.log("🔥 Firestore connected! Database:", DATABASE_ID);
  } else {
    firebaseInitError = "FIREBASE_SERVICE_ACCOUNT belum disetel.";
    console.warn("⚠️", firebaseInitError);
  }
} catch (err: any) {
  firebaseInitError = err.message;
  console.error("❌ Firebase init error:", err.message);
}

// ----------------------------------------------------------------
// Initialize Gemini AI
// ----------------------------------------------------------------
let ai: any = null;
try {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: { headers: { "User-Agent": "aistudio-build" } }
  });
} catch (e: any) {
  console.warn("Gemini init warning:", e.message);
}

const JWT_SECRET = process.env.JWT_SECRET || "kerjamin_default_secret";

app.use(express.json());

// ----------------------------------------------------------------
// Auth Middleware
// ----------------------------------------------------------------
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

// ----------------------------------------------------------------
// API Router (semua route /api/*)
// ----------------------------------------------------------------
const apiRouter = express.Router();

// Health check
apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    database: db ? "connected" : "disconnected",
    gemini: !!ai,
    error: firebaseInitError
  });
});

// Register (opsional)
apiRouter.post("/register", async (req, res) => {
  if (!db) return res.status(503).json({ error: firebaseInitError || "Database tidak terhubung." });
  try {
    const { name, email, password } = req.body;
    const userSnap = await db.collection("users").where("email", "==", email).get();
    if (!userSnap.empty) return res.status(400).json({ error: "Email sudah terdaftar" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name, email, password: hashedPassword, profile: null
    };
    await db.collection("users").doc(newUser.id).set(newUser);
    const token = jwt.sign({ id: newUser.id, name: newUser.name }, JWT_SECRET);
    res.json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email, profile: newUser.profile } });
  } catch (err: any) {
    console.error("Register Error:", err);
    res.status(500).json({ error: "Gagal mendaftar akun ke database" });
  }
});

// Login (opsional)
apiRouter.post("/login", async (req, res) => {
  if (!db) return res.status(503).json({ error: firebaseInitError || "Database tidak terhubung." });
  try {
    const { email, password } = req.body;
    const userSnap = await db.collection("users").where("email", "==", email).get();
    if (userSnap.empty) return res.status(400).json({ error: "Email atau password salah" });

    const user = userSnap.docs[0].data();
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Email atau password salah" });
    }
    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, profile: user.profile } });
  } catch (err: any) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Gagal login ke database" });
  }
});

// Save Profile (opsional jika menggunakan akun)
apiRouter.post("/save-profile", authenticateToken, async (req: any, res) => {
  if (!db) return res.json({ message: "Profil disimpan secara lokal", profile: req.body });
  try {
    const userRef = db.collection("users").doc(String(req.user.id));
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Akun tidak ditemukan atau sesi telah berakhir." });
    }
    await userRef.update({ profile: req.body });
    const updatedUser = (await userRef.get()).data();
    res.json({ message: "Profil berhasil disimpan", profile: updatedUser?.profile });
  } catch (err: any) {
    console.error("Save Profile Error:", err);
    res.status(500).json({ error: "Gagal menyimpan profil ke database" });
  }
});

// Get History (mendukung guestId tanpa login maupun userId)
apiRouter.get("/history", async (req: any, res) => {
  if (!db) return res.json([]);
  try {
    let ownerId = req.query.guestId ? String(req.query.guestId) : null;
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        if (decoded?.id) ownerId = decoded.id;
      } catch {
        // Abaikan token tidak valid untuk mode tamu
      }
    }
    if (!ownerId) return res.json([]);

    const snap = await db.collection("history").where("userId", "==", ownerId).get();
    const history = snap.docs.map((doc: any) => doc.data());
    history.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(history);
  } catch (err: any) {
    console.error("Get History Error:", err);
    res.json([]);
  }
});

// Delete History (mendukung guestId tanpa login maupun userId)
apiRouter.delete("/history/:id", async (req: any, res) => {
  if (!db) return res.json({ success: true });
  try {
    let ownerId = req.query.guestId ? String(req.query.guestId) : null;
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        if (decoded?.id) ownerId = decoded.id;
      } catch {
        // Abaikan token tidak valid
      }
    }
    if (!ownerId) return res.status(400).json({ error: "Identitas sesi tidak ditemukan." });

    const historyRef = db.collection("history").doc(req.params.id);
    const historyDoc = await historyRef.get();
    if (!historyDoc.exists || historyDoc.data()?.userId !== ownerId) {
      return res.status(404).json({ error: "Riwayat tidak ditemukan." });
    }
    await historyRef.delete();
    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete History Error:", err);
    res.status(500).json({ error: "Gagal menghapus riwayat dari database" });
  }
});

// ----------------------------------------------------------------
// Analysis Logic
// ----------------------------------------------------------------
const upload = multer({ limits: { fileSize: UPLOAD_LIMIT } });

async function callAIWithRetry(modelRef: any, params: any, retries = 3, initialDelay = 2000) {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      return await modelRef.generateContent(params);
    } catch (error: any) {
      const is503 = error.message?.includes("503") || error.status === 503 || (error.response?.status === 503);
      if (is503 && i < retries - 1) {
        console.warn(`Gemini 503. Retrying in ${delay / 1000}s... (${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
}

apiRouter.post("/analyze-document", upload.single("file"), async (req: any, res) => {
  try {
    if (!process.env.GEMINI_API_KEY || !ai) {
      return res.status(503).json({ error: "Gemini AI tidak tersedia. Pastikan GEMINI_API_KEY disetel." });
    }

    // Parse optional guest profile from request body
    let profile: any = null;
    if (req.body.profile) {
      try {
        profile = typeof req.body.profile === "string" ? JSON.parse(req.body.profile) : req.body.profile;
      } catch {
        profile = null;
      }
    }

    // Optional ownerId (guestId or authenticated user)
    let ownerId = req.body.guestId ? String(req.body.guestId) : `guest_${Date.now()}`;
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        if (decoded?.id) {
          ownerId = decoded.id;
          if (!profile && db) {
            const userDoc = await db.collection("users").doc(String(decoded.id)).get();
            if (userDoc.exists && userDoc.data()?.profile) {
              profile = userDoc.data()?.profile;
            }
          }
        }
      } catch {
        // Tetap izinkan analisis sebagai tamu
      }
    }

    let textToAnalyze = req.body.text || "";

    if (req.file) {
      if (req.file.mimetype === "application/pdf") {
        // Dynamic import: pdf-parse tidak boleh diimport di top-level (crash serverless)
        const pdfModule = await import("pdf-parse");
        const pdfParser = (pdfModule as any).default || pdfModule;
        const data = await pdfParser(req.file.buffer);
        textToAnalyze = data.text;
      } else {
        textToAnalyze = req.file.buffer.toString("utf-8");
      }
    }

    if (!textToAnalyze || textToAnalyze.trim().length < 10) {
      return res.status(400).json({ error: "Konten terlalu pendek (minimal 10 karakter)." });
    }

    const hasProfile = profile && (profile.jobField || profile.hardSkills || profile.summary);
    const profileSection = hasProfile
      ? `PROFIL USER:
- Bidang: ${profile.jobField || "-"}
- Pendidikan: ${profile.education || "-"} (Jurusan: ${profile.major || "-"})
- Pengalaman: ${profile.experienceLevel || "-"}
- Hard Skills: ${profile.hardSkills || "-"}
- Soft Skills: ${profile.softSkills || "-"}
- Ekspektasi Gaji: Rp${profile.expectedSalary || "-"}
- Preferensi Lokasi: ${profile.location || "-"}
- Ringkasan & Sertifikasi: ${profile.summary || "-"}`
      : `PROFIL USER:
- Pengguna belum mengisi profil karier detail (Mode Tamu Langsung).
- Untuk bagian ANALISIS KECOCOKAN, identifikasi keahlian utama yang dibutuhkan oleh lowongan/dokumen pada 'skill_sesuai' (keterampilan umum/standar) dan keahlian spesifik/lanjutan yang perlu disiapkan kandidat pada 'skill_kurang', serta berikan estimasi skor_kecocokan yang objektif berdasarkan kejelasan kualifikasi posisi.`;

    const systemPrompt = `Anda adalah Senior Full-Stack Developer, HR Recruiter, dan Career Coach Profesional dengan keahlian Hukum Ketenagakerjaan Indonesia.
Tugas Anda adalah melakukan MULTITASKING ANALYSIS pada dokumen (Loker/Kontrak) yang diberikan.

${profileSection}

INSTRUKSI ANALISIS:
1. ANALISIS KECOCOKAN: Evaluasi kesesuaian kualifikasi/skill pada dokumen${hasProfile ? " dengan profil user" : " untuk kandidat umum"}. Berikan skor_kecocokan (0-100).
2. ANALISIS KEAMANAN: Identifikasi potensi penipuan (Scam), Loker Palsu, Phishing, atau pasal kontrak kerja jebakan yang melanggar UU Ketenagakerjaan Indonesia (UU No. 13/2003, UU Cipta Kerja No. 6/2023, PP 35/2021).
   - Periksa apakah ada penahanan ijazah, penalti ganti rugi yang tidak wajar, permintaan transfer uang, atau indikasi phishing.
3. Berikan skor_keamanan (0-100). Makin rendah artinya makin berbahaya. 100 = Sangat Aman, 0 = Sangat Berbahaya.
4. Identifikasi pelanggaran secara spesifik (jenis, penjelasan, pasal hukum).

WAJIB mengembalikan respons dalam format JSON murni.`;

    const response = await callAIWithRetry(ai.models, {
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: textToAnalyze }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            skor_kecocokan: { type: Type.INTEGER },
            skor_keamanan: { type: Type.INTEGER },
            indikasi_bahaya: { type: Type.STRING, description: "Tinggi/Sedang/Aman" },
            hasil_cocoklogi: {
              type: Type.OBJECT,
              properties: {
                skill_sesuai: { type: Type.ARRAY, items: { type: Type.STRING } },
                skill_kurang: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["skill_sesuai", "skill_kurang"]
            },
            identifikasi_pelanggaran: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  jenis_pelanggaran: { type: Type.STRING },
                  penjelasan: { type: Type.STRING },
                  pasal_dilanggar: { type: Type.STRING }
                },
                required: ["jenis_pelanggaran", "penjelasan", "pasal_dilanggar"]
              }
            },
            rekomendasi: { type: Type.STRING }
          },
          required: ["skor_kecocokan", "skor_keamanan", "indikasi_bahaya", "hasil_cocoklogi", "identifikasi_pelanggaran", "rekomendasi"]
        }
      }
    });

    const analysisResult = JSON.parse(response.text || "{}");

    const historyItem = {
      id: `h_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: ownerId,
      timestamp: new Date().toISOString(),
      jenis_dokumen: req.file ? "File" : "Teks",
      fileName: req.file ? req.file.originalname : "Analisis Teks Terpadu",
      result: analysisResult
    };

    if (db) {
      try {
        await db.collection("history").doc(historyItem.id).set(historyItem);
      } catch (dbErr) {
        console.warn("Gagal menyimpan riwayat ke Firestore (lanjut tanpa DB):", dbErr);
      }
    }

    res.json({ ...analysisResult, historyItem });
  } catch (error: any) {
    console.error("Analysis Error:", error);
    res.status(500).json({
      error: "Gagal memproses analisis AI.",
      details: error.message
    });
  }
});

// Mount API Router
app.use("/api", apiRouter);

// ----------------------------------------------------------------
// Vite Middleware (dev) & Static Serving (production)
// ----------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import: vite hanya tersedia di dev (devDependency)
    const { createServer: createViteServer } = await import("vite");
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Jalankan server lokal jika bukan di Vercel
if (!process.env.VERCEL) {
  startServer();
}

export default app;
