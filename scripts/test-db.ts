import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

// Locate service account key
const serviceAccountPath = path.join(process.cwd(), "project-vibe-coding-kerjamin-firebase-adminsdk-fbsvc-acda211b65.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ File service account Firebase tidak ditemukan!");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

const app = initializeApp({
  credential: cert(serviceAccount)
});

// Database ID khusus di project ini: ai-studio-57a39df3-2720-4c0c-a5aa-d8e33e5fa656
const DATABASE_ID = "ai-studio-57a39df3-2720-4c0c-a5aa-d8e33e5fa656";
console.log(" Menggunakan Database ID:", DATABASE_ID);

const db = getFirestore(app, DATABASE_ID);

async function testConnection() {
  console.log("⏳ Sedang mencoba menghubungkan ke Cloud Firestore...");
  try {
    const testDocRef = db.collection("_connection_test").doc("ping");
    
    // 1. Tulis data uji coba
    await testDocRef.set({
      message: "Koneksi Firebase Cloud Firestore Berhasil!",
      timestamp: FieldValue.serverTimestamp(),
      app: "Kerjamin"
    });
    console.log("✅ [1/3] Berhasil MENULIS data uji coba ke Cloud Firestore.");

    // 2. Baca data kembali
    const docSnap = await testDocRef.get();
    if (docSnap.exists) {
      console.log("✅ [2/3] Berhasil MEMBACA data:", docSnap.data()?.message);
    } else {
      throw new Error("Dokumen tidak ditemukan setelah ditulis.");
    }

    // 3. Hapus data uji coba (cleanup)
    await testDocRef.delete();
    console.log("✅ [3/3] Berhasil MENGHAPUS data uji coba (cleanup).");

    console.log("\n==================================================");
    console.log("🎉 SEMPURNA! Firestore terhubung & siap digunakan.");
    console.log("==================================================\n");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Gagal menyambung ke Firestore:", error.message);
    if (error.code) {
      console.error("Kode Error:", error.code);
    }
    process.exit(1);
  }
}

testConnection();
