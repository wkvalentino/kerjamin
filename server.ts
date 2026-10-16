import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import express from "express";
import path from "path";
import multer from "multer";
import * as pdf from "pdf-parse";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = express();
const PORT = 3000;
const UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB

// Initialize Firebase Cloud Firestore (Supports local JSON file and Vercel ENV)
let serviceAccount: any;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error("Gagal mem-parsing FIREBASE_SERVICE_ACCOUNT dari environment variable:", e);
  }
}

if (!serviceAccount) {
  const serviceAccountPath = path.join(process.cwd(), "project-vibe-coding-kerjamin-firebase-adminsdk-fbsvc-acda211b65.json");
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
  }
}

const firebaseApp = getApps().length === 0
  ? initializeApp({
      credential: cert(serviceAccount)
    })
  : getApps()[0];

const DATABASE_ID = process.env.FIREBASE_DATABASE_ID || "ai-studio-57a39df3-2720-4c0c-a5aa-d8e33e5fa656";
const db = getFirestore(firebaseApp, DATABASE_ID);
console.log("🔥 Cloud Firestore connected successfully! Database:", DATABASE_ID);

const JWT_SECRET = process.env.JWT_SECRET || "kerjamin_default_secret";

// Initialize Gemini
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json());

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

// --- AUTH ROUTES (Cloud Firestore) ---
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Cek apakah email sudah terdaftar di Firestore
    const userSnap = await db.collection("users").where("email", "==", email).get();
    if (!userSnap.empty) {
      return res.status(400).json({ error: "Email sudah terdaftar" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { 
      id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
      name, 
      email, 
      password: hashedPassword,
      profile: null
    };

    await db.collection("users").doc(newUser.id).set(newUser);

    const token = jwt.sign({ id: newUser.id, name: newUser.name }, JWT_SECRET);
    res.json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email, profile: newUser.profile } });
  } catch (err: any) {
    console.error("Register Error:", err);
    res.status(500).json({ error: "Gagal mendaftar akun ke database" });
  }
});

app.post("/api/save-profile", authenticateToken, async (req: any, res) => {
  try {
    console.log("Saving profile to Firestore for user:", req.user.id);
    const userRef = db.collection("users").doc(String(req.user.id));
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.error("User not found in Firestore:", req.user.id);
      return res.status(404).json({ error: "Akun tidak ditemukan atau sesi telah berakhir. Silakan login ulang." });
    }

    await userRef.update({ profile: req.body });
    const updatedUser = (await userRef.get()).data();
    console.log("Profile updated successfully in Firestore for:", updatedUser?.email);
    res.json({ message: "Profil berhasil disimpan ke Cloud Firestore", profile: updatedUser?.profile });
  } catch (err: any) {
    console.error("Save Profile Error:", err);
    res.status(500).json({ error: "Gagal menyimpan profil ke database" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const userSnap = await db.collection("users").where("email", "==", email).get();

    if (userSnap.empty) {
      return res.status(400).json({ error: "Email atau password salah" });
    }

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

// --- HISTORY ROUTE (Cloud Firestore) ---
app.get("/api/history", authenticateToken, async (req: any, res) => {
  try {
    const historySnap = await db.collection("history").where("userId", "==", req.user.id).get();
    const userHistory = historySnap.docs.map(doc => doc.data());
    // Urutkan berdasarkan waktu terbaru
    userHistory.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(userHistory);
  } catch (err: any) {
    console.error("Get History Error:", err);
    res.status(500).json({ error: "Gagal memuat riwayat dari database" });
  }
});

app.delete("/api/history/:id", authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    const historyRef = db.collection("history").doc(id);
    const historyDoc = await historyRef.get();

    if (!historyDoc.exists || historyDoc.data()?.userId !== req.user.id) {
      return res.status(404).json({ error: "Riwayat tidak ditemukan." });
    }

    await historyRef.delete();
    res.json({ success: true });
  } catch (err: any) {
    console.error("Delete History Error:", err);
    res.status(500).json({ error: "Gagal menghapus riwayat dari database" });
  }
});


// --- ANALYSIS LOGIC ---
const upload = multer({ limits: { fileSize: UPLOAD_LIMIT } });

/**
 * Helper to call Gemini AI with retry and exponential backoff
 */
async function callAIWithRetry(modelRef: any, params: any, retries = 3, initialDelay = 2000) {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      return await modelRef.generateContent(params);
    } catch (error: any) {
      const is503 = error.message?.includes("503") || error.status === 503 || (error.response?.status === 503);
      
      if (is503 && i < retries - 1) {
        console.warn(`Gemini 503 detected. Retrying in ${delay / 1000}s... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}

interface AnalysisTaskResult {
  skor_kecocokan: number;
  skor_keamanan: number;
  indikasi_bahaya: string;
  hasil_cocoklogi: {
    skill_sesuai: string[];
    skill_kurang: string[];
  };
  identifikasi_pelanggaran: {
    jenis_pelanggaran: string;
    penjelasan: string;
    pasal_dilanggar: string;
  }[];
  rekomendasi: string;
}

app.post("/api/analyze-document", authenticateToken, upload.single('file'), async (req: any, res) => {
  try {
    const userDoc = await db.collection("users").doc(String(req.user.id)).get();
    if (!userDoc.exists || !userDoc.data()?.profile) {
      return res.status(400).json({ error: "Lengkapi profil Anda terlebih dahulu." });
    }

    const profile = userDoc.data()?.profile;

    let textToAnalyze = req.body.text || "";

    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const pdfParser = (pdf as any).default || pdf;
        const data = await pdfParser(req.file.buffer);
        textToAnalyze = data.text;
      } else { textToAnalyze = req.file.buffer.toString('utf-8'); }
    }

    if (!textToAnalyze || textToAnalyze.trim().length < 10) {
       return res.status(400).json({ error: "Konten terlalu pendek." });
    }

    const systemPrompt = `Anda adalah Senior Full-Stack Developer, HR Recruiter, dan Career Coach Profesional dengan keahlian Hukum Ketenagakerjaan Indonesia.
Tugas Anda adalah melakukan MULTITASKING ANALYSIS pada dokumen (Loker/Kontrak) yang diberikan.

PROFIL USER:
- Bidang: ${profile.jobField}
- Pendidikan: ${profile.education} (Jurusan: ${profile.major})
- Pengalaman: ${profile.experienceLevel}
- Hard Skills: ${profile.hardSkills}
- Soft Skills: ${profile.softSkills}
- Ekspektasi Gaji: Rp${profile.expectedSalary}
- Preferensi Lokasi: ${profile.location}
- Ringkasan & Sertifikasi: ${profile.summary}

INSTRUKSI ANALISIS:
1. ANALISIS KECOCOKAN: Bandingkan profil user dengan kebutuhan di dokumen. Berikan skor_kecocokan (0-100) berdasarkan relevansi skill dan pengalaman.
2. ANALISIS KEAMANAN: Identifikasi potensi penipuan (Scam), Loker Palsu, Phishing, atau pasal kontrak kerja jebakan yang melanggar UU Ketenagakerjaan Indonesia.
   - Periksa apakah ada penahanan ijazah, penalti ganti rugi yang tidak wajar, atau indikasi phishing.
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
    
    // Save to Cloud Firestore
    const historyItem = {
      id: `h_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: req.user.id,
      timestamp: new Date().toISOString(),
      jenis_dokumen: req.file ? "File" : "Teks",
      fileName: req.file ? req.file.originalname : "Analisis Teks Terpadu",
      result: analysisResult
    };
    await db.collection("history").doc(historyItem.id).set(historyItem);
    console.log("Analysis saved to Firestore history for user:", req.user.id);

    res.json(analysisResult);
  } catch (error: any) {
    console.error("Analysis Error Details:", error);
    res.status(500).json({ 
      error: "Gagal memproses analisis AI multitasking.",
      details: error.message 
    });
  }
});

// Vite Middleware & Static Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Jalankan server lokal jika bukan di lingkungan Vercel serverless
if (!process.env.VERCEL) {
  startServer();
}

export default app;
