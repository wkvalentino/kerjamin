import express from "express";
import path from "path";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

const app = express();
const UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB
const JWT_SECRET = process.env.JWT_SECRET || "kerjamin_default_secret";

app.use(express.json());

// ----------------------------------------------------------------
// Lazy Firebase Admin Initialization (hanya jika dikonfigurasi)
// ----------------------------------------------------------------
let dbInstance: any = null;
let dbInitialized = false;
let firebaseInitError: string | null = null;

async function getDb() {
  if (dbInitialized) return dbInstance;
  dbInitialized = true;

  try {
    let serviceAccount: any = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      serviceAccount = JSON.parse(raw);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
      }
    }

    if (!serviceAccount) {
      const keyPath = path.join(
        process.cwd(),
        "project-vibe-coding-kerjamin-firebase-adminsdk-fbsvc-acda211b65.json"
      );
      if (fs.existsSync(keyPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
      }
    }

    if (serviceAccount) {
      const { getApps, initializeApp, cert } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");

      const firebaseApp =
        getApps().length === 0
          ? initializeApp({ credential: cert(serviceAccount) })
          : getApps()[0];

      const DATABASE_ID =
        process.env.FIREBASE_DATABASE_ID || "ai-studio-57a39df3-2720-4c0c-a5aa-d8e33e5fa656";
      dbInstance = getFirestore(firebaseApp, DATABASE_ID);
      console.log("🔥 Firestore connected! Database:", DATABASE_ID);
    } else {
      firebaseInitError = "FIREBASE_SERVICE_ACCOUNT belum disetel (mode lokal browser aktif).";
    }
  } catch (err: any) {
    firebaseInitError = err.message;
    console.error("❌ Firebase init error:", err.message);
  }

  return dbInstance;
}

// ----------------------------------------------------------------
// Lazy Gemini AI Client
// ----------------------------------------------------------------
function getAiClient() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// ----------------------------------------------------------------
// Auth Middleware (opsional untuk endpoint akun)
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
// API Router
// ----------------------------------------------------------------
const apiRouter = express.Router();

apiRouter.get("/health", async (_req, res) => {
  const db = await getDb();
  res.json({
    status: "ok",
    database: db ? "connected" : "disconnected",
    gemini: Boolean((process.env.GEMINI_API_KEY || "").trim()),
    vercel: Boolean(process.env.VERCEL),
    error: firebaseInitError,
  });
});

// Register (opsional)
apiRouter.post("/register", async (req, res) => {
  const db = await getDb();
  if (!db) return res.status(503).json({ error: firebaseInitError || "Database tidak terhubung." });
  try {
    const { name, email, password } = req.body;
    const userSnap = await db.collection("users").where("email", "==", email).get();
    if (!userSnap.empty) return res.status(400).json({ error: "Email sudah terdaftar" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: `u_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      name,
      email,
      password: hashedPassword,
      profile: null,
    };
    await db.collection("users").doc(newUser.id).set(newUser);
    const token = jwt.sign({ id: newUser.id, name: newUser.name }, JWT_SECRET);
    res.json({
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, profile: newUser.profile },
    });
  } catch (err: any) {
    console.error("Register Error:", err);
    res.status(500).json({ error: "Gagal mendaftar akun ke database" });
  }
});

// Login (opsional)
apiRouter.post("/login", async (req, res) => {
  const db = await getDb();
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
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, profile: user.profile },
    });
  } catch (err: any) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Gagal login ke database" });
  }
});

// Save Profile (opsional)
apiRouter.post("/save-profile", authenticateToken, async (req: any, res) => {
  const db = await getDb();
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
  const db = await getDb();
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
  const db = await getDb();
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
      const is503 =
        error.message?.includes("503") ||
        error.status === 503 ||
        error.response?.status === 503;
      if (is503 && i < retries - 1) {
        console.warn(`Gemini 503. Retrying in ${delay / 1000}s... (${i + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfModule: any = await import("pdf-parse");
    // Support pdf-parse v2 (class PDFParse) and v1 (default function)
    if (typeof pdfModule.PDFParse === "function") {
      const parser = new pdfModule.PDFParse({ data: buffer });
      try {
        const textResult = await parser.getText();
        return textResult?.text || "";
      } finally {
        await parser.destroy?.().catch(() => {});
      }
    }
    const fn = pdfModule.default || pdfModule;
    if (typeof fn === "function") {
      const data = await fn(buffer);
      return data?.text || "";
    }
    return "";
  } catch (err) {
    console.warn("pdf-parse gagal, fallback ke multimodal Gemini PDF:", err);
    return "";
  }
}

apiRouter.post("/analyze-document", upload.single("file"), async (req: any, res) => {
  try {
    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({
        error: "GEMINI_API_KEY belum disetel di Environment Variables server.",
      });
    }

    const db = await getDb();

    // Parse optional guest profile from request body
    let profile: any = null;
    if (req.body?.profile) {
      try {
        profile =
          typeof req.body.profile === "string"
            ? JSON.parse(req.body.profile)
            : req.body.profile;
      } catch {
        profile = null;
      }
    }

    // Optional ownerId (guestId or authenticated user)
    let ownerId = req.body?.guestId ? String(req.body.guestId) : `guest_${Date.now()}`;
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

    let textToAnalyze = req.body?.text || "";
    let pdfFallbackPart: { inlineData: { data: string; mimeType: string } } | null = null;

    if (req.file) {
      const isPdf =
        req.file.mimetype === "application/pdf" ||
        req.file.originalname?.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        const extracted = await extractPdfText(req.file.buffer);
        if (extracted && extracted.trim().length >= 10) {
          textToAnalyze = extracted;
        } else {
          // Fallback: kirim PDF langsung ke Gemini secara multimodal
          pdfFallbackPart = {
            inlineData: {
              data: req.file.buffer.toString("base64"),
              mimeType: "application/pdf",
            },
          };
        }
      } else {
        textToAnalyze = req.file.buffer.toString("utf-8");
      }
    }

    if (!pdfFallbackPart && (!textToAnalyze || textToAnalyze.trim().length < 10)) {
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

    const parts: any[] = [];
    if (pdfFallbackPart) {
      parts.push(pdfFallbackPart);
      parts.push({
        text: textToAnalyze?.trim()
          ? `Catatan tambahan pengguna: ${textToAnalyze}\n\nAnalisis dokumen PDF terlampir.`
          : "Analisis dokumen PDF terlampir secara menyeluruh.",
      });
    } else {
      parts.push({ text: textToAnalyze });
    }

    const response = await callAIWithRetry(ai.models, {
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
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
                skill_kurang: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["skill_sesuai", "skill_kurang"],
            },
            identifikasi_pelanggaran: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  jenis_pelanggaran: { type: Type.STRING },
                  penjelasan: { type: Type.STRING },
                  pasal_dilanggar: { type: Type.STRING },
                },
                required: ["jenis_pelanggaran", "penjelasan", "pasal_dilanggar"],
              },
            },
            rekomendasi: { type: Type.STRING },
          },
          required: [
            "skor_kecocokan",
            "skor_keamanan",
            "indikasi_bahaya",
            "hasil_cocoklogi",
            "identifikasi_pelanggaran",
            "rekomendasi",
          ],
        },
      },
    });

    const rawText = (response.text || "{}")
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const analysisResult = JSON.parse(rawText);

    const historyItem = {
      id: `h_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      userId: ownerId,
      timestamp: new Date().toISOString(),
      jenis_dokumen: req.file ? "File" : "Teks",
      fileName: req.file ? req.file.originalname : "Analisis Teks Terpadu",
      result: analysisResult,
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
      error: error?.message || "Gagal memproses analisis AI.",
    });
  }
});

// Mount API Router
app.use("/api", apiRouter);
// Fallback jika rewrite Vercel mengirim path tanpa prefix /api
if (process.env.VERCEL) {
  app.use("/", apiRouter);
}

// JSON error handler agar error multer/express selalu mengembalikan JSON
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Unhandled Express Error:", err);
  res.status(err?.status || 500).json({
    error: err?.message || "Terjadi kesalahan internal pada server.",
  });
});

export default app;
