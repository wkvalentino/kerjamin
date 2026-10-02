import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

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

const app = express();
const PORT = 3000;
const UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB

// Simple in-persistent "database" for Prototype
const USERS_FILE = path.join(process.cwd(), "users.json");
const HISTORY_FILE = path.join(process.cwd(), "history.json");

let users: any[] = [];
let analysisHistory: any[] = [];

// Load data on startup
try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  }
  if (fs.existsSync(HISTORY_FILE)) {
    analysisHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  }
} catch (e) {
  console.error("Error loading data files:", e);
}

const saveUsers = () => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
const saveHistory = () => fs.writeFileSync(HISTORY_FILE, JSON.stringify(analysisHistory, null, 2));

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

// --- AUTH ROUTES ---
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "Email sudah terdaftar" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { 
    id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
    name, 
    email, 
    password: hashedPassword,
    profile: null // Akan diisi di form profil setelah login pertama
  };
  users.push(newUser);
  saveUsers();

  const token = jwt.sign({ id: newUser.id, name: newUser.name }, JWT_SECRET);
  res.json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email, profile: newUser.profile } });
});

app.post("/api/save-profile", authenticateToken, (req: any, res) => {
  console.log("Saving profile for user:", req.user.id);
  const userIndex = users.findIndex(u => String(u.id) === String(req.user.id));
  
  if (userIndex === -1) {
    console.error("User not found in memory database:", req.user.id);
    return res.status(404).json({ error: "Akun tidak ditemukan atau sesi telah berakhir. Silakan login ulang." });
  }

  users[userIndex].profile = req.body;
  saveUsers();
  console.log("Profile updated successfully for:", users[userIndex].email);
  res.json({ message: "Profil berhasil disimpan", profile: users[userIndex].profile });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: "Email atau password salah" });
  }

  const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, profile: user.profile } });
});

// --- HISTORY ROUTE ---
app.get("/api/history", authenticateToken, (req: any, res) => {
  const userHistory = analysisHistory.filter(h => h.userId === req.user.id);
  res.json(userHistory);
});

app.delete("/api/history/:id", authenticateToken, (req: any, res) => {
  const { id } = req.params;
  const index = analysisHistory.findIndex(h => h.id === id && h.userId === req.user.id);
  if (index === -1) return res.status(404).json({ error: "Riwayat tidak ditemukan." });
  analysisHistory.splice(index, 1);
  saveHistory();
  res.json({ success: true });
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
    const userAccount = users.find(u => u.id === req.user.id);
    if (!userAccount || !userAccount.profile) {
      return res.status(400).json({ error: "Lengkapi profil Anda terlebih dahulu." });
    }

    const { profile } = userAccount;

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
    
    // Save to history
    analysisHistory.push({
      id: `h_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: req.user.id,
      timestamp: new Date().toISOString(),
      jenis_dokumen: req.file ? "File" : "Teks",
      fileName: req.file ? req.file.originalname : "Analisis Teks Terpadu",
      result: analysisResult
    });
    saveHistory();

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

startServer();
