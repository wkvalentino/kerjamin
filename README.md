<div align="center">
  <img src="public/logo.png" alt="Kerjamin Logo" width="90" height="90" />
  <h1>🛡️ Kerjamin (Kerja Aman & Terjamin)</h1>
  <p><strong>Platform AI Cerdas Pelindung Karier dari Kontrak Jebakan & Loker Palsu</strong></p>

  <p>
    <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss" alt="Tailwind CSS v4" />
    <img src="https://img.shields.io/badge/Express-4.21-lightgrey?logo=express" alt="Express.js" />
    <img src="https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase" alt="Firebase Cloud Firestore" />
    <img src="https://img.shields.io/badge/AI-Google_Gemini-8E75C8?logo=google" alt="Google Gemini AI" />
    <img src="https://img.shields.io/badge/Vercel-Ready-black?logo=vercel" alt="Vercel Ready" />
  </p>
</div>

---

## 📌 Tentang Kerjamin

**Kerjamin** adalah platform web modern yang dirancang untuk melindungi para pencari kerja (khususnya *fresh graduate* dan pekerja muda) dari ancaman penipuan lowongan kerja fiktif serta klausul berbahaya dalam kontrak kerja (PKWT/PKWTT).

Didukung oleh kecerdasan buatan **Google Gemini AI**, Kerjamin membedah dokumen secara otomatis, mengidentifikasi potensi pelanggaran undang-undang ketenagakerjaan, dan mengukur tingkat kecocokan keterampilan kandidat secara instan.

---

## ✨ Fitur Utama

- 🔍 **Bedah Risiko Hukum Kontrak**: Mendeteksi klausul merugikan seperti penahanan ijazah tanpa dasar hukum, denda *resign* sepihak yang tidak wajar, hingga jam kerja eksploitatif yang melanggar regulasi ketenagakerjaan.
- 🎯 **Cocoklogi Karier (Skill Matcher)**: Menganalisis kesenjangan skill (*gaps*) antara profil pencari kerja dan persyaratan loker, memberikan evaluasi apakah posisi tersebut realistis untuk dilamar.
- 📄 **Dukungan Multi-Format**: Analisis teks lowongan langsung via *copy-paste* atau unggah dokumen digital format **PDF / TXT** (hingga 5MB).
- 📊 **Career Performance Insights**: Dashboard analitik terpadu yang merangkum skor rata-rata kecocokan karier, indeks keamanan berkas, dan tren riwayat analisis.
- 📂 **Riwayat Analisis Terpadu**: Akses kembali seluruh dokumen yang pernah dianalisis kapan saja dengan penyimpanan cloud.
- 🔒 **Database Cloud Firestore**: Penyimpanan data pengguna dan riwayat analisis terdesentralisasi, cepat, dan aman menggunakan Google Cloud Firestore.

---

## 🛠️ Tech Stack

| Layer | Teknologi |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Lucide React, Motion (Framer Motion) |
| **Build Tool** | Vite 6 |
| **Backend** | Node.js, Express.js, Multer, PDF-Parse, JWT, Bcrypt.js |
| **Database** | Google Cloud Firestore (via `firebase-admin`) |
| **AI Engine** | Google Gemini Generative AI SDK (`@google/genai`) |
| **Deployment** | Vercel Serverless (`vercel.json` & `api/index.ts`) |

---

## 🚀 Panduan Menjalankan Secara Lokal

### Prasyarat
- [Node.js](https://nodejs.org/) versi 18 atau lebih baru
- Kunci API Google Gemini (dapat diperoleh gratis di [Google AI Studio](https://aistudio.google.com/))
- Proyek Firebase Cloud Firestore

### 1. Kloning Repositori & Pasang Dependensi
```bash
git clone https://github.com/username/kerjamin.git
cd kerjamin
npm install
```

### 2. Konfigurasi Environment Variable
Buat file `.env` atau `.env.local` di direktori utama:
```env
# Google Gemini AI API Key
GEMINI_API_KEY="AIzaSy..."

# JWT Secret untuk sesi login
JWT_SECRET="kerjamin_secret_token_123"

# Database ID Firestore (opsional jika menggunakan (default))
FIREBASE_DATABASE_ID="ai-studio-57a39df3-2720-4c0c-a5aa-d8e33e5fa656"
```

Pastikan file Service Account Key Firebase (`project-vibe-coding-kerjamin-firebase-adminsdk-*.json`) diletakkan di root direktori untuk akses lokal.

### 3. Uji Koneksi Database
Jalankan script verifikasi untuk memastikan Cloud Firestore terhubung:
```bash
npm run test-db
```

### 4. Jalankan Server Development
```bash
npm run dev
```
Buka browser di **[http://localhost:3000](http://localhost:3000)**.

---

## 🌐 Panduan Deploy ke Vercel

Proyek ini telah dikonfigurasi penuh dan siap di-deploy langsung ke **[Vercel](https://vercel.com/)** secara gratis:

1. **Push kode** ke repositori GitHub Anda.
2. Di Vercel Dashboard, klik **Add New** &rarr; **Project**, lalu **Import** repositori ini.
3. Pada bagian **Environment Variables**, tambahkan:
   - `GEMINI_API_KEY` : Kunci API Google Gemini Anda
   - `JWT_SECRET` : String rahasia untuk token JWT
   - `FIREBASE_DATABASE_ID` : `ai-studio-57a39df3-2720-4c0c-a5aa-d8e33e5fa656`
   - `FIREBASE_SERVICE_ACCOUNT` : Salin **seluruh isi** file JSON service account Firebase ke variabel ini.
4. Klik **Deploy**. Aplikasi akan aktif secara online dengan domain Vercel gratis.

---

## 📁 Struktur Proyek

```text
kerjamin/
├── api/
│   └── index.ts          # Serverless entrypoint untuk Vercel
├── public/
│   ├── ai-shield.png     # Ilustrasi hero landing page
│   └── logo.png          # Logo resmi Kerjamin
├── scripts/
│   └── test-db.ts        # Script pengujian koneksi Cloud Firestore
├── src/
│   ├── App.tsx           # Komponen utama UI, routing, state & view
│   ├── index.css         # Styling global Tailwind CSS v4 & animasi
│   └── main.tsx          # React mounting entrypoint
├── server.ts             # Server backend Express & integrasi Gemini + Firestore
├── vercel.json           # Konfigurasi routing serverless Vercel
└── package.json          # Manajemen dependensi dan skrip proyek
```

---

<div align="center">
  <p>Dibuat untuk ekosistem ketenagakerjaan yang lebih adil, transparan, dan aman bagi generasi muda Indonesia. 🇮🇩</p>
</div>
