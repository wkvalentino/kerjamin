import React, { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Upload,
  FileText,
  ArrowRight,
  Loader2,
  Briefcase,
  History,
  X,
  Home,
  User,
  Sparkles,
  Zap,
  Lock,
  ChevronRight,
  AlertCircle,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";


// --- Types ---
interface Violation {
  jenis_pelanggaran: string;
  penjelasan: string;
  pasal_dilanggar: string;
}

interface AnalysisResult {
  skor_kecocokan: number;
  skor_keamanan: number;
  indikasi_bahaya: string;
  hasil_cocoklogi: {
    skill_sesuai: string[];
    skill_kurang: string[];
  };
  identifikasi_pelanggaran: Violation[];
  rekomendasi: string;
}

interface HistoryItem {
  id: string;
  timestamp: string;
  jenis_dokumen: string;
  fileName: string;
  result: AnalysisResult;
}

interface UserProfile {
  jobField: string;
  experienceLevel: string;
  education: string;
  major: string;
  hardSkills: string;
  softSkills: string;
  expectedSalary: string;
  location: string;
  summary: string;
}

const ViolationCard = ({ p }: { p: Violation }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-[32px] bg-white border border-red-100 p-6 sm:p-8 shadow-sm transition-all hover:shadow-md group flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
            <AlertTriangle size={24} />
          </div>
          <div>
            <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-600 mb-2">
              Indikasi Bahaya: Tinggi
            </span>
            <h4 className="text-xl font-black text-slate-900 leading-tight">{p.jenis_pelanggaran}</h4>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors bg-slate-50 hover:bg-slate-100 px-4 py-2 rounded-full w-fit shrink-0"
        >
          {expanded ? "Tutup Detail" : "Buka Detail"} <ChevronRight size={16} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-4 space-y-4">
              <div className="rounded-2xl bg-slate-50 p-6 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Deskripsi Pelanggaran</p>
                <p className="text-slate-700 font-medium leading-relaxed">{p.penjelasan}</p>
              </div>
              <div className="rounded-2xl bg-red-50/50 p-6 border border-red-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2">Pasal Terkait (Regulasi)</p>
                <p className="text-red-700 font-bold">{p.pasal_dilanggar}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [guestId, setGuestId] = useState<string>("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<"landing" | "dashboard" | "result" | "history">("landing");
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const prevViewRef = useRef(view);

  // Initialize guest session, profile, and local history without login
  useEffect(() => {
    let savedGuestId = localStorage.getItem("kerjamin_guest_id");
    if (!savedGuestId) {
      savedGuestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem("kerjamin_guest_id", savedGuestId);
    }
    setGuestId(savedGuestId);

    try {
      const savedProfile = localStorage.getItem("kerjamin_guest_profile");
      if (savedProfile) {
        setProfile(JSON.parse(savedProfile));
      }
    } catch {
      // ignore invalid JSON
    }

    try {
      const savedHistory = localStorage.getItem("kerjamin_history");
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch {
      // ignore invalid JSON
    }

    fetchHistory(savedGuestId);
  }, []);

  // Reset input text, uploaded file, and transient alerts when navigating away
  useEffect(() => {
    if (prevViewRef.current === "result" && view !== "result") {
      setResult(null);
    }
    if (prevViewRef.current !== view && view !== "result") {
      setInputText("");
      setFile(null);
      setError(null);
      setSuccess(null);
    }
    prevViewRef.current = view;
    window.scrollTo(0, 0);
  }, [view]);

  const fetchHistory = async (activeGuestId: string) => {
    if (!activeGuestId) return;
    try {
      const response = await fetch(`/api/history?guestId=${encodeURIComponent(activeGuestId)}`);
      const ct = response.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await response.json() : [];
      if (response.ok && Array.isArray(data) && data.length > 0) {
        setHistory(prev => {
          const map = new Map<string, HistoryItem>();
          [...data, ...prev].forEach((item: HistoryItem) => {
            if (item?.id) map.set(item.id, item);
          });
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          localStorage.setItem("kerjamin_history", JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.error("Gagal sinkronisasi riwayat:", err);
    }
  };

  const handleDeleteHistory = async (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      localStorage.setItem("kerjamin_history", JSON.stringify(updated));
      return updated;
    });
    if (!guestId) return;
    try {
      await fetch(`/api/history/${id}?guestId=${encodeURIComponent(guestId)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Gagal menghapus riwayat server:", err);
    }
  };

  const handleSaveProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const profileData: UserProfile = {
      jobField: String(formData.get("jobField") || ""),
      experienceLevel: String(formData.get("experienceLevel") || "Fresh Graduate"),
      education: String(formData.get("education") || "S1"),
      major: String(formData.get("major") || ""),
      hardSkills: String(formData.get("hardSkills") || ""),
      softSkills: String(formData.get("softSkills") || ""),
      expectedSalary: String(formData.get("expectedSalary") || ""),
      location: String(formData.get("location") || ""),
      summary: String(formData.get("summary") || ""),
    };

    setProfile(profileData);
    localStorage.setItem("kerjamin_guest_profile", JSON.stringify(profileData));
    setSuccess("Profil karier berhasil disimpan!");

    setTimeout(() => {
      setShowProfileForm(false);
      setSuccess(null);
      setView("dashboard");
    }, 900);
  };

  const handleClearProfile = () => {
    localStorage.removeItem("kerjamin_guest_profile");
    setProfile(null);
    setShowProfileForm(false);
  };

  const handleAnalyze = async () => {
    if (!inputText && !file) {
      setError("Silakan tempel teks atau upload file terlebih dahulu.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    if (file) formData.append("file", file);
    formData.append("text", inputText);
    if (guestId) formData.append("guestId", guestId);
    if (profile) formData.append("profile", JSON.stringify(profile));

    try {
      const response = await fetch("/api/analyze-document", {
        method: "POST",
        body: formData,
      });

      const ct = response.headers.get("content-type") || "";
      const data = ct.includes("application/json")
        ? await response.json()
        : { error: `Server error (${response.status}): Cek env vars di server` };
      if (!response.ok) throw new Error(data.error || "Gagal menganalisis");

      const { historyItem, ...analysisOnly } = data;
      setResult(analysisOnly);

      const newHistoryItem: HistoryItem = historyItem || {
        id: `h_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date().toISOString(),
        jenis_dokumen: file ? "File" : "Teks",
        fileName: file ? file.name : "Analisis Teks Terpadu",
        result: analysisOnly,
      };

      setHistory(prev => {
        const updated = [newHistoryItem, ...prev.filter(h => h.id !== newHistoryItem.id)];
        localStorage.setItem("kerjamin_history", JSON.stringify(updated));
        return updated;
      });

      setInputText("");
      setFile(null);
      setView("result");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] font-sans text-slate-900 selection:bg-orange-100 italic-selection">
      {/* Header */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">
          <div
            className="flex cursor-pointer items-center gap-3"
            onClick={() => setView("landing")}
          >
            <img src="/logo.png" alt="Kerjamin Logo" className="h-9 w-9 sm:h-10 sm:w-10 object-contain drop-shadow-sm" />
            <span className="text-xl sm:text-2xl font-black tracking-tighter text-slate-900 uppercase">Kerjamin</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                onClick={() => setView("landing")}
                className={`hidden sm:flex items-center gap-2 text-sm font-black transition-all ${view === "landing" ? "text-orange-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                Beranda
              </button>
              <button
                onClick={() => setView("dashboard")}
                className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black transition-all ${view === "dashboard" ? "text-orange-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                <Home size={16} /> Analisis
              </button>
              <button
                onClick={() => { fetchHistory(guestId); setView("history"); }}
                className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black transition-all ${view === "history" ? "text-orange-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                <History size={16} /> Riwayat
              </button>
              <button
                onClick={() => setShowProfileForm(true)}
                className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black transition-all ${showProfileForm ? "text-orange-500" : "text-slate-400 hover:text-slate-600"}`}
              >
                <User size={16} /> <span className="hidden sm:inline">Profil</span>
              </button>
            </div>

            {view === "landing" && (
              <button
                onClick={() => setView("dashboard")}
                className="rounded-lg bg-orange-500 px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white transition-all hover:bg-orange-600 hover:shadow-lg hover:shadow-orange-200 active:scale-95 whitespace-nowrap"
              >
                Coba Gratis
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-12 pb-28 md:pb-12">
        {/* Profiling / Edit Form Overlay */}
        <AnimatePresence>
          {showProfileForm && (
            <div key="profile-modal" className="fixed inset-0 z-[250] flex items-center justify-center p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowProfileForm(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-3xl bg-white rounded-[32px] sm:rounded-[48px] p-6 sm:p-12 border border-slate-100 shadow-2xl overflow-y-auto max-h-[90vh]"
              >
                <button
                  onClick={() => setShowProfileForm(false)}
                  className="absolute right-6 top-6 sm:right-10 sm:top-10 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X size={28} />
                </button>

                <div className="mb-10 text-center">
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                    {profile ? "Edit Profil Karier" : "Profil Karier (Opsional)"}
                  </h2>
                  <p className="text-slate-400 mt-2">Data ini disimpan di browser Anda sebagai acuan AI untuk analisis kecocokan skill (Cocoklogi).</p>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-8">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bidang Pekerjaan</label>
                      <input name="jobField" required defaultValue={profile?.jobField} placeholder="Contoh: Digital Marketer, Fullstack Dev" className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tingkat Pengalaman</label>
                      <select name="experienceLevel" required defaultValue={profile?.experienceLevel || "Fresh Graduate"} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all">
                        <option value="Fresh Graduate">Fresh Graduate</option>
                        <option value="Junior">Junior (1-3 Tahun)</option>
                        <option value="Senior">Senior (5+ Tahun)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pendidikan Terakhir</label>
                      <select name="education" required defaultValue={profile?.education || "S1"} className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all">
                        <option value="SMA/SMK">SMA / SMK</option>
                        <option value="D3">D3 (Diploma)</option>
                        <option value="S1">S1 (Sarjana)</option>
                        <option value="S2/S3">S2 / S3 (Pascasarjana)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jurusan / Program Studi</label>
                      <input name="major" required defaultValue={profile?.major} placeholder="Contoh: Sistem Informasi, Akuntansi" className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all" />
                    </div>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gaji yang Diharapkan (IDR)</label>
                      <input name="expectedSalary" required type="text" defaultValue={profile?.expectedSalary} placeholder="Contoh: 8000000" className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preferensi Lokasi Kerja</label>
                      <input name="location" required defaultValue={profile?.location} placeholder="Contoh: Jakarta, Remote, WFA" className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Keahlian Utama (Hard Skills)</label>
                    <input name="hardSkills" required defaultValue={profile?.hardSkills} placeholder="Contoh: React, SQL, Adobe Illustrator" className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Soft Skills / Alat Kerja</label>
                    <input name="softSkills" required defaultValue={profile?.softSkills} placeholder="Contoh: Komunikasi, Jira, Figma, Agile" className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ringkasan Karier & Sertifikasi</label>
                    <textarea name="summary" required rows={4} defaultValue={profile?.summary} placeholder="Jelaskan singkat pencapaian, sertifikasi, atau latar belakang pendidikan Anda..." className="w-full rounded-3xl border border-slate-100 bg-slate-50 px-6 py-4 focus:bg-white focus:outline-none transition-all" />
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm font-bold flex items-center gap-2"
                    >
                      <AlertCircle size={18} /> {error}
                    </motion.div>
                  )}

                  {success && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm font-bold flex items-center gap-2"
                    >
                      <CheckCircle2 size={18} /> {success}
                    </motion.div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      type="submit"
                      disabled={loading || !!success}
                      className="flex-1 rounded-full bg-orange-500 py-5 text-lg sm:text-xl font-black text-white hover:bg-orange-600 transition-all shadow-xl shadow-orange-200 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="animate-spin mx-auto" /> : (success ? "Tersimpan!" : (profile ? "Perbarui Profil" : "Simpan Profil"))}
                    </button>
                    {profile && (
                      <button
                        type="button"
                        onClick={handleClearProfile}
                        className="rounded-full border border-slate-200 px-8 py-5 text-sm font-black text-slate-500 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
                      >
                        Reset Profil
                      </button>
                    )}
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Landing Page */}
          {view === "landing" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-0 w-full"
            >
              <div className="relative py-20 flex items-center justify-center min-h-[calc(100vh-5rem)] px-4 md:px-8 overflow-hidden">
                {/* Animated Background Blobs */}
                <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      rotate: [0, 90, 0],
                      opacity: [0.3, 0.5, 0.3],
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute left-1/4 top-1/4 h-[400px] w-[400px] bg-orange-400/20 blur-[100px] rounded-full"
                  />
                  <motion.div
                    animate={{
                      scale: [1, 1.5, 1],
                      rotate: [0, -90, 0],
                      opacity: [0.2, 0.4, 0.2],
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    className="absolute right-1/4 bottom-1/4 h-[500px] w-[500px] bg-indigo-500/10 blur-[120px] rounded-full"
                  />
                </div>

                <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                  {/* Left Column: Text */}
                  <div className="flex flex-col items-center text-center lg:items-start lg:text-left z-10">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5 }}
                      className="mb-8 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-bold text-orange-600 tracking-widest uppercase shadow-sm"
                    >
                      <ShieldCheck size={16} /> AI-Powered Career Guardian
                    </motion.div>

                    <motion.h1
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.7, delay: 0.1 }}
                      className="mb-6 text-4xl font-[900] tracking-tighter text-slate-900 sm:text-5xl md:text-7xl xl:text-8xl leading-[1.05]"
                    >
                      Karier Aman, <br />
                      <span className="text-orange-500 italic relative inline-block">
                        Masa Depan
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 1, delay: 0.8, ease: "circOut" }}
                          className="absolute -bottom-2 left-0 h-3 bg-orange-200/60 -z-10 rounded-full"
                        />
                      </span> <br />
                      Terjamin.
                    </motion.h1>

                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.7, delay: 0.3 }}
                      className="mb-10 max-w-lg text-lg font-medium text-slate-500 leading-relaxed"
                    >
                      Analisis cerdas menggunakan AI untuk mendeteksi lowongan palsu, membedah risiko legal kontrak kerja, dan mencocokkan skill Anda secara instan.
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.7, delay: 0.5 }}
                      className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
                    >
                      <button
                        onClick={() => setView("dashboard")}
                        className="group relative w-full sm:w-auto overflow-hidden rounded-full bg-slate-900 px-10 py-5 text-lg font-black text-white transition-all hover:bg-black hover:shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] active:scale-95 flex items-center justify-center gap-3"
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          Bongkar Loker <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </span>
                        <div className="absolute inset-0 -z-0 bg-gradient-to-r from-orange-500 to-amber-500 opacity-0 transition-opacity group-hover:opacity-20" />
                      </button>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
                        <CheckCircle2 size={16} className="text-emerald-500" /> Langsung Coba Tanpa Login
                      </div>
                    </motion.div>
                  </div>

                  {/* Right Column: 3D Illustration & Floating Elements */}
                  <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 1, delay: 0.2, type: "spring" }}
                    className="relative hidden lg:flex items-center justify-center"
                  >
                    {/* Central Image with float animation */}
                    <motion.div
                      animate={{ y: [-15, 15, -15] }}
                      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                      className="relative z-10 w-full max-w-[500px]"
                    >
                      <img
                        src="/ai-shield.png"
                        alt="AI Contract Analysis"
                        className="w-full h-auto drop-shadow-2xl object-contain"
                      />
                    </motion.div>

                    {/* Floating Badges */}
                    <motion.div
                      animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                      className="absolute -top-10 -left-10 z-20 flex items-center gap-3 rounded-2xl bg-white/90 backdrop-blur-md p-4 shadow-xl border border-slate-100"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                        <ShieldCheck size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Security</p>
                        <p className="text-lg font-black text-slate-900">99.9% Aman</p>
                      </div>
                    </motion.div>

                    <motion.div
                      animate={{ y: [0, 25, 0], x: [0, -15, 0] }}
                      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                      className="absolute bottom-10 -right-5 z-20 flex items-center gap-3 rounded-2xl bg-white/90 backdrop-blur-md p-4 shadow-xl border border-slate-100"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                        <Zap size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cocoklogi</p>
                        <p className="text-lg font-black text-slate-900">Real-time Match</p>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              </div>

              {/* Marquee Ticker - tepat di bawah section utama */}
              <MarqueeTicker />

              <CaraKerjaSection />
            </motion.div>
          )}



          {/* Dashboard Utama */}
          {view === "dashboard" && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              {/* Career Profile Quick Status Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-[32px] border border-orange-100 bg-orange-50/60 px-6 py-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm">
                    <User size={20} />
                  </div>
                  <div>
                    {profile ? (
                      <>
                        <p className="text-sm font-black text-slate-900">
                          Profil Aktif: {profile.jobField} ({profile.experienceLevel})
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          Skill: {profile.hardSkills}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-black text-slate-900">
                          Mode Tamu Aktif — Langsung Analisis Tanpa Login
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          Lengkapi Profil Karier (opsional) jika ingin skor Cocoklogi disesuaikan dengan skill Anda.
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProfileForm(true)}
                  className="shrink-0 rounded-full bg-white border border-orange-200 px-5 py-2.5 text-xs font-black text-orange-600 hover:bg-orange-500 hover:text-white transition-all shadow-sm"
                >
                  {profile ? "Edit Profil Karier" : "Atur Profil Karier"}
                </button>
              </div>

              {/* Career Performance Insights Widget */}
              <section className="grid gap-6 md:grid-cols-4">
                <div className="md:col-span-2 rounded-[40px] bg-slate-900 p-8 text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 h-40 w-40 bg-orange-500/10 blur-[80px] rounded-full group-hover:bg-orange-500/20 transition-all duration-700" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-8 w-8 rounded-lg bg-orange-500 flex items-center justify-center">
                        <Sparkles size={16} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Skor Karier Personal</span>
                    </div>
                    <div className="flex items-baseline gap-4 mb-2">
                      <span className="text-6xl font-black tracking-tighter">
                        {history.length > 0
                          ? Math.round(history.reduce((acc, h) => acc + h.result.skor_kecocokan, 0) / history.length)
                          : 0}%
                      </span>
                      <span className="text-emerald-400 text-sm font-bold flex items-center gap-1">
                        Rata-rata Kecocokan <Zap size={14} fill="currentColor" />
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-sm">
                      Berdasarkan {history.length} analisis terakhir, profil Anda memiliki kecocokan yang {history.length === 0 ? "masih perlu diuji" : "solid di pasar tenaga kerja saat ini"}.
                    </p>
                  </div>
                </div>

                <div className="rounded-[40px] bg-white border border-slate-100 p-8 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center mb-4">
                      <Briefcase size={20} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Analisis</p>
                    <p className="text-3xl font-black text-slate-900">{history.length}</p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-50">
                    <p className="text-[10px] font-bold text-slate-400">Trend 7 Hari Terakhir</p>
                    <div className="flex gap-1 mt-2 items-end h-8">
                      {[40, 70, 50, 90, 60, 80, 100].map((h, i) => (
                        <div key={i} className="flex-1 bg-slate-100 rounded-t-sm transition-all hover:bg-orange-200" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[40px] bg-white border border-slate-100 p-8 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="h-10 w-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mb-4">
                      <Lock size={20} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Keamanan Karier</p>
                    <p className="text-3xl font-black text-slate-900">
                      {history.length > 0
                        ? Math.round(history.reduce((acc, h) => acc + h.result.skor_keamanan, 0) / history.length)
                        : 100}%
                    </p>
                  </div>
                  <div className="mt-4">
                    <span className="text-[10px] font-black px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full uppercase tracking-tighter">Terverifikasi Aman</span>
                  </div>
                </div>
              </section>

              <div className="max-w-5xl mx-auto space-y-10">
                <header className="space-y-4 text-center">
                  <h2 className="text-4xl sm:text-5xl font-black tracking-tighter">Analisis Mandiri</h2>
                  <p className="text-slate-400 text-lg">AI Senior akan membongkar kecocokan karir dan keamanan dokumen Anda.</p>
                </header>

                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <span className="text-xs font-bold text-slate-400">Ingin langsung coba?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setInputText("LOWONGAN KERJA STAFF ADMINISTRASI & DATA ENTRY\nPT Sukses Makmur Sentosa\nGaji Pokok Rp 12.000.000/bulan (Tanpa Pengalaman).\nSyarat: Lulusan SMA/S1 semua jurusan, wajib mengikuti training karantina di Bali dan mentransfer biaya tiket + seragam sebesar Rp 2.500.000 terlebih dahulu ke rekening pribadi HRD (BCA a.n. Budi Santoso). Setelah transfer, ijazah asli wajib dititipkan selama 2 tahun.");
                      }}
                      className="rounded-full bg-slate-100 hover:bg-orange-100 hover:text-orange-700 px-4 py-1.5 text-xs font-bold text-slate-600 transition-colors"
                    >
                      Contoh Loker Mencurigakan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setInputText("PERJANJIAN KERJA WAKTU TERTENTU (PKWT)\nPasal 4: Karyawan wajib menyerahkan ijazah asli S1/SMA untuk ditahan perusahaan selama masa kontrak 2 tahun.\nPasal 7: Apabila karyawan mengundurkan diri sebelum kontrak berakhir, karyawan wajib membayar denda penalti sebesar Rp 50.000.000 secara tunai dalam waktu 3 hari.\nPasal 9: Jam kerja berlaku 12 jam per hari (Senin-Sabtu) tanpa perhitungan uang lembur.");
                      }}
                      className="rounded-full bg-slate-100 hover:bg-orange-100 hover:text-orange-700 px-4 py-1.5 text-xs font-bold text-slate-600 transition-colors"
                    >
                      Contoh Kontrak Kerja Jebakan
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                    {/* Kolom Teks */}
                    <div className="relative rounded-[40px] border border-slate-100 bg-white shadow-xl transition-all focus-within:ring-[16px] focus-within:ring-orange-500/5 flex flex-col h-[350px]">
                      <textarea
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Tempelkan isi lowongan atau isi kontrak di sini..."
                        className="w-full h-full resize-none rounded-[40px] bg-transparent p-8 text-lg focus:outline-none"
                      />
                    </div>

                    {/* Kolom Upload */}
                    <label className="flex flex-col cursor-pointer items-center justify-center gap-4 rounded-[40px] border-2 border-dashed border-slate-200 bg-white p-8 transition-all hover:border-orange-400 group shadow-sm hover:shadow-xl h-[350px]">
                      <input type="file" accept=".pdf,.txt" className="hidden" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} />
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-slate-50 text-slate-400 group-hover:bg-orange-500 group-hover:text-white transition-all">
                        <Upload size={32} />
                      </div>
                      <div className="text-center w-full overflow-hidden min-w-0">
                        <p className="font-black text-slate-700 truncate text-lg px-4">{file ? file.name : "Unggah Dokumen PDF/TXT"}</p>
                        <p className="text-xs text-slate-400 font-bold tracking-widest uppercase mt-2">Atau seret file ke sini (Maks 5MB)</p>
                      </div>
                    </label>
                  </div>

                  <button
                    onClick={handleAnalyze}
                    disabled={loading || (!inputText && !file)}
                    className="w-full rounded-[40px] bg-slate-900 px-12 py-6 text-xl md:text-2xl font-black text-white hover:bg-black transition-all shadow-2xl disabled:opacity-50 active:scale-95 flex items-center justify-center gap-4"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <><Zap className="text-orange-500" /> Analisis Teks / Dokumen</>}
                  </button>
                  {error && <p className="text-red-500 font-bold text-center mt-4">⚠️ {error}</p>}
                </div>
              </div>
            </motion.div>
          )}

          {/* History View */}
          {view === "history" && (
            <motion.div
              key="history-page"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-10"
            >
              <header className="flex items-center justify-between">
                <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight">Riwayat Analisis</h2>
                  <p className="text-slate-400 font-medium">Lihat kembali hasil bedah kontrak dan loker Anda sebelumnya.</p>
                </div>
                <div className="rounded-full bg-orange-100 px-6 py-2 text-orange-600 text-sm font-black">
                  Total: {history.length} Analisis
                </div>
              </header>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {history.length > 0 ? history.map((item) => (
                  <motion.div
                    key={item.id}
                    whileHover={{ y: -5 }}
                    layout
                    className="group flex flex-col justify-between rounded-[40px] border border-slate-100 bg-white p-8 shadow-sm transition-all hover:shadow-2xl"
                  >
                    <div>
                      <div className="mb-6 flex items-center justify-between">
                        <span className="rounded-xl bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {item.jenis_dokumen}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">
                            {new Date(item.timestamp).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                          <button
                            onClick={() => handleDeleteHistory(item.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-xl bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                            title="Hapus riwayat"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <h3 className="mb-4 text-xl font-bold text-slate-900 line-clamp-2 leading-tight group-hover:text-orange-500 transition-colors">
                        {item.fileName}
                      </h3>
                      <div className="flex gap-4">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black uppercase text-slate-300">Kecocokan</span>
                          <span className="text-lg font-black text-slate-700">{item.result.skor_kecocokan}%</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black uppercase text-slate-300">Keamanan</span>
                          <span className={`text-lg font-black ${item.result.skor_keamanan < 50 ? "text-red-500" : "text-emerald-500"}`}>
                            {item.result.skor_keamanan}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => { setResult(item.result); setView("result"); }}
                      className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-black text-white hover:bg-black transition-all"
                    >
                      Buka Detail <ChevronRight size={16} />
                    </button>
                  </motion.div>
                )) : (
                  <div className="col-span-full py-20 text-center">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 text-slate-300">
                      <History size={40} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-900">Belum Ada Riwayat</h3>
                    <p className="text-slate-400">Mulailah dengan menganalisis loker atau kontrak pertama Anda.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Results View */}
          {view === "result" && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`space-y-12 min-h-screen -mx-6 px-6 py-12 rounded-[64px] transition-colors duration-1000 ${result.skor_keamanan < 50 ? "bg-red-50" : "bg-white"}`}
            >
              <header className="flex flex-col md:flex-row items-center justify-between gap-12 border-b border-slate-100 pb-12">
                <div className="space-y-6 text-center md:text-left">
                  <div className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest ${result.skor_keamanan < 50 ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
                    Indikasi Bahaya: {result.indikasi_bahaya}
                  </div>
                  <h2 className="text-5xl md:text-6xl font-[900] tracking-tighter leading-[0.9] max-w-2xl">
                    Hasil Bedah Tuntas <br /> <span className="text-orange-500">Oleh Kerjamin AI.</span>
                  </h2>
                </div>

                <div className="flex gap-8">
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative h-40 w-40">
                      <svg className="h-full w-full -rotate-90">
                        <circle cx="80" cy="80" r="70" fill="transparent" stroke="#E2E8F0" strokeWidth="12" />
                        <circle cx="80" cy="80" r="70" fill="transparent" stroke="#F97316" strokeWidth="12" strokeDasharray={2 * Math.PI * 70} strokeDashoffset={2 * Math.PI * 70 * (1 - result.skor_kecocokan / 100)} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-black">{result.skor_kecocokan}%</span>
                        <span className="text-[10px] font-black uppercase text-slate-400">Cocok</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative h-40 w-40">
                      <svg className="h-full w-full -rotate-90">
                        <circle cx="80" cy="80" r="70" fill="transparent" stroke="#E2E8F0" strokeWidth="12" />
                        <circle cx="80" cy="80" r="70" fill="transparent" stroke={result.skor_keamanan < 50 ? "#EF4444" : "#10B981"} strokeWidth="12" strokeDasharray={2 * Math.PI * 70} strokeDashoffset={2 * Math.PI * 70 * (1 - result.skor_keamanan / 100)} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-black">{result.skor_keamanan}%</span>
                        <span className="text-[10px] font-black uppercase text-slate-400">Aman</span>
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-8">
                  {/* Cocoklogi */}
                  <div className="rounded-[40px] bg-slate-900 p-10 text-white shadow-2xl">
                    <h3 className="text-2xl font-black mb-8 flex items-center gap-4">
                      <Zap className="text-orange-400" /> Analisis Kecocokan Karier
                    </h3>
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Skill yang Sesuai</p>
                        <div className="flex flex-wrap gap-2">
                          {result.hasil_cocoklogi.skill_sesuai.map((s, i) => <span key={`s-ok-${i}-${s}`} className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold border border-emerald-500/30">{s}</span>)}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Kesenjangan Skill (Gaps)</p>
                        <div className="flex flex-wrap gap-2">
                          {result.hasil_cocoklogi.skill_kurang.map((s, i) => <span key={`s-gap-${i}-${s}`} className="bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm font-bold border border-red-500/30">{s}</span>)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pelanggaran */}
                  <div className="space-y-6">
                    <h3 className="text-2xl font-black flex items-center gap-4 uppercase tracking-widest text-slate-900 border-l-4 border-orange-500 pl-4">
                      Temuan Risiko Hukum
                    </h3>
                    {result.identifikasi_pelanggaran.length > 0 ? result.identifikasi_pelanggaran.map((p, i) => (
                      <ViolationCard key={`p-${i}-${p.jenis_pelanggaran}`} p={p} />
                    )) : (
                      <div className="rounded-[32px] bg-emerald-50 border border-emerald-100 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                          <CheckCircle2 size={24} />
                        </div>
                        <div>
                          <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-2">
                            Status Legal: Aman
                          </span>
                          <h4 className="text-xl font-black text-slate-900 leading-tight">Tidak Ditemukan Pelanggaran</h4>
                          <p className="text-emerald-700/80 font-medium mt-1">Dokumen ini telah dianalisis dan terlihat sesuai dengan regulasi standar ketenagakerjaan.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-8">
                  {/* Rekomendasi */}
                  <div className="rounded-[40px] bg-orange-500 p-10 text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 h-40 w-40 bg-white/5 blur-3xl rounded-full translate-x-20 -translate-y-20" />
                    <h3 className="text-2xl font-black mb-6 flex items-center gap-4">
                      <Sparkles /> Rekomendasi Tindakan
                    </h3>
                    <p className="text-xl font-medium leading-relaxed text-white/90">
                      {result.rekomendasi}
                    </p>
                    <div className="mt-10 border-t border-white/20 pt-8 flex items-center justify-between">
                      <button onClick={() => setView("dashboard")} className="bg-black text-white px-8 py-4 rounded-full font-black hover:bg-slate-900 transition-all">Analisis Loker Lain</button>
                      <button onClick={() => window.print()} className="text-white/80 font-bold hover:text-white transition-all underline underline-offset-4">Cetak Laporan</button>
                    </div>
                  </div>

                  <div className="rounded-[40px] bg-indigo-900 p-10 text-white flex flex-col items-center text-center gap-6">
                    <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center">
                      <ShieldCheck size={32} />
                    </div>
                    <h3 className="text-2xl font-black leading-tight italic-selection">Ingin Hasil Cocoklogi <br /> Lebih Akurat & Personal?</h3>
                    <p className="text-indigo-200 font-medium">Sesuaikan bidang pekerjaan, pengalaman, dan skill Anda pada Profil Karier agar AI memberi penilaian yang presisi.</p>
                    <button
                      onClick={() => setShowProfileForm(true)}
                      className="w-full bg-white text-indigo-900 py-5 rounded-full font-black text-lg active:scale-95 transition-all hover:bg-indigo-50"
                    >
                      {profile ? "Perbarui Profil Karier" : "Atur Profil Karier"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-24 border-t border-slate-100 py-12">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50 grayscale hover:grayscale-0 transition-all cursor-default">
            <img src="/logo.png" alt="Kerjamin Logo" className="h-10 w-10 object-contain drop-shadow-sm" />
            <span className="text-lg font-bold tracking-tight text-slate-900">KERJAMIN</span>
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            © 2026 KERJAMIN -KERJA AMAN & TERJAMIN
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-xs font-bold text-slate-400 hover:text-slate-600">Kebijakan Privasi</a>
            <a href="#" className="text-xs font-bold text-slate-400 hover:text-slate-600">Syarat Ketentuan</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Taruh fungsi ini di paling bawah file App.tsx Anda
function CaraKerjaSection() {
  const langkahLangkah = [
    {
      no: "01",
      judul: "Tempel Kontrak / Loker",
      deskripsi: "Salin teks lowongan kerja atau unggah dokumen kerja (PDF/TXT) yang ingin Anda periksa.",
      icon: <FileText size={24} className="text-orange-500" />,
      bgIcon: "bg-orange-50"
    },
    {
      no: "02",
      judul: "Analisis AI",
      deskripsi: "Kecerdasan buatan kami akan membedah kecocokan skill, hak hukum, hingga indikasi penipuan dalam hitungan detik.",
      icon: <Sparkles size={24} className="text-blue-500" />,
      bgIcon: "bg-blue-50"
    },
    {
      no: "03",
      judul: "Ambil Kendali",
      deskripsi: "Dapatkan skor keamanan, draf revisi pasal, dan skrip negosiasi siap pakai untuk diajukan ke HRD.",
      icon: <ShieldCheck size={24} className="text-emerald-500" />,
      bgIcon: "bg-emerald-50"
    }
  ];

  return (
    <section className="py-24 bg-slate-50/50 border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
            Alur Kerja Instan
          </span>
          <h2 className="text-4xl font-[900] tracking-tighter text-slate-900 mt-4 mb-3">
            Hanya 3 Langkah, Bebas dari Jebakan Loker.
          </h2>
          <p className="text-base text-slate-400 font-medium">
            Proses verifikasi mutakhir yang dirancang sesederhana mungkin untuk keamanan karier Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {langkahLangkah.map((item, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
              className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm hover:shadow-xl transition-all duration-300 relative group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className={`h-12 w-12 rounded-2xl ${item.bgIcon} flex items-center justify-center`}>
                    {item.icon}
                  </div>
                  <span className="text-4xl font-[1000] text-slate-100 tracking-tighter group-hover:text-orange-500/10 transition-colors duration-300">
                    {item.no}
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">{item.judul}</h3>
                <p className="text-sm font-medium text-slate-400 leading-relaxed">{item.deskripsi}</p>
              </div>
              <div className="w-12 h-1 bg-transparent group-hover:bg-orange-500 rounded-full mt-6 transition-all duration-300" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

const tickerItems = [
  { status: "✓ AMAN", color: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Loker Junior Web Developer di Jakarta — Terverifikasi Resmi" },
  { status: "🚨 DICEGAH", color: "bg-red-50 text-red-700 border-red-200", text: "Modus Penipuan Undangan Interview Travel Fiktif Luar Kota" },
  { status: "⚠️ DIREVISI", color: "bg-amber-50 text-amber-700 border-amber-200", text: "Klausul Denda Resign Rp50 Juta pada PKWT Tidak Sah" },
  { status: "🛡️ LEGAL", color: "bg-blue-50 text-blue-700 border-blue-200", text: "Kontrak Kerja Remote PT Teknologi Nusantara — Standar Kemnaker" },
  { status: "🚨 DICEGAH", color: "bg-red-50 text-red-700 border-red-200", text: "Lowongan Palsu Admin Medsos Minta Transfer Deposit Pelatihan" },
  { status: "⚠️ DIREVISI", color: "bg-amber-50 text-amber-700 border-amber-200", text: "Penahanan Ijazah 3 Tahun Tanpa Kompensasi Asuransi" },
  { status: "✓ AMAN", color: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Internship UI/UX Designer — Perusahaan Fintech Terdaftar OJK" },
];

function MarqueeTicker() {
  return (
    <section className="relative overflow-hidden border-y border-slate-100 bg-slate-50/80 py-4 my-2">
      {/* Left & Right Gradient Fade Masks */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-[#FDFCFB] to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-[#FDFCFB] to-transparent" />

      <div className="marquee-container flex overflow-hidden">
        {/* Track 1 */}
        <div className="animate-marquee shrink-0 flex items-center">
          {tickerItems.map((item, i) => (
            <div key={`track1-${i}`} className="flex items-center gap-3 mx-4 shrink-0">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider whitespace-nowrap ${item.color}`}>
                {item.status}
              </span>
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{item.text}</span>
              <span className="text-slate-300 mx-2 select-none">•</span>
            </div>
          ))}
        </div>

        {/* Track 2 (Seamless loop copy) */}
        <div className="animate-marquee shrink-0 flex items-center" aria-hidden="true">
          {tickerItems.map((item, i) => (
            <div key={`track2-${i}`} className="flex items-center gap-3 mx-4 shrink-0">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider whitespace-nowrap ${item.color}`}>
                {item.status}
              </span>
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{item.text}</span>
              <span className="text-slate-300 mx-2 select-none">•</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

