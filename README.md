# Belajar Sejarah

Aplikasi web untuk belajar Sejarah Indonesia dengan AI yang berjalan lokal. Guru mengunggah materi PDF, lalu AI menyusun rencana pembelajaran (lesson plan) dan soal. Siswa membaca materi dengan suara (text-to-speech) dan sorotan kata, lalu mengerjakan kuis yang dinilai otomatis.

## Fitur

**Guru (admin)**
- Unggah materi PDF dan atur urutannya.
- Buat lesson plan otomatis: teks dibagi per sub-bab, lalu tiap lesson memuat ringkasan, poin penting, penjelasan, dan istilah kunci. Hasilnya bisa disunting, dan sistem memberi tanda "Perlu ditinjau" bila menemukan angka atau tanggal yang tidak ada di sumber.
- Buat soal otomatis (Isian Singkat dan Benar/Salah) per lesson dan soal challenge per materi. Setiap soal divalidasi dan diuji jawab balik sebelum disimpan.
- Pratinjau dan sunting petunjuk berjenjang serta penjelasan setiap soal.

**Siswa**
- Membaca lesson dengan text-to-speech per bagian dan sorotan kata yang sedang dibacakan.
- Kuis per lesson, satu soal demi satu soal, dengan tiga petunjuk berjenjang yang disusun dari kutipan buku (RAG). Lulus bila skor ≥ 80.
- Challenge per materi, terbuka setelah semua kuis lesson pada materi itu lulus.
- Menjawab dengan mengetik atau dengan suara (speech-to-text).
- Penilaian Isian Singkat yang toleran terhadap ejaan lama, transliterasi, gelar, dan salah ketik kecil. Jawaban yang tidak bisa diputuskan oleh aturan dinilai oleh model bahasa.

## Teknologi

| Bagian | Teknologi |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Basis data | PostgreSQL + pgvector, Prisma 5 |
| Autentikasi | NextAuth v5 (email & kata sandi) |
| Model bahasa | [Ollama](https://ollama.com): `qwen3:8b` (generate & penilaian), `nomic-embed-text` (embedding) |
| Text-to-speech | Piper (lokal, utama) dan Edge TTS (daring, opsional) |
| Speech-to-text | whisper.cpp (model `small`) melalui `nodejs-whisper` |

## Prasyarat

- Node.js 20+
- PostgreSQL 15+ dengan ekstensi [pgvector](https://github.com/pgvector/pgvector)
- Ollama dengan dua model:
  ```bash
  ollama pull qwen3:8b
  ollama pull nomic-embed-text
  ```
- Python 3.10+ (untuk Piper)
- `ffmpeg` dan alat build C++ (`cmake`, compiler) untuk whisper.cpp. Di macOS: `brew install ffmpeg cmake`.

## Instalasi

1. **Pasang dependensi**
   ```bash
   npm install
   ```

2. **Siapkan basis data.** Buat database, lalu aktifkan pgvector:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. **Buat file `.env`** di folder project:
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/belajar_sejarah"
   AUTH_SECRET="isi-dengan-string-acak"       # buat dengan: npx auth secret
   OLLAMA_URL="http://localhost:11434"
   QWEN_MODEL="qwen3:8b"
   EMBED_MODEL="nomic-embed-text"
   ```

4. **Sinkronkan skema dan buat akun admin**
   ```bash
   npx prisma db push
   npm run seed
   ```
   Akun admin awal: `admin@sejarah.id`. Kata sandi bawaannya ada di `prisma/seed.ts`; ganti sebelum aplikasi dipakai di luar komputer lokal.

5. **Pasang Piper (text-to-speech lokal)**
   ```bash
   python3 -m venv piper/venv
   piper/venv/bin/pip install piper-tts
   mkdir -p piper/models
   ```
   Unduh model suara bahasa Indonesia `id_ID-news_tts-medium` dari [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/id/id_ID/news_tts/medium). Simpan dua file, `.onnx` dan `.onnx.json`, di `piper/models/`.

6. **Siapkan whisper.cpp (speech-to-text)**
   ```bash
   npx nodejs-whisper download
   ```
   Pilih model **small** saat diminta. Binari dan model tersimpan di `node_modules/nodejs-whisper/cpp/whisper.cpp/`.

7. **Jalankan**
   ```bash
   npm run dev
   ```
   Buka http://localhost:3000. Siswa mendaftar sendiri lewat halaman Daftar, sedangkan akun guru dibuat lewat seed.

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` / `npm start` | Build dan jalankan versi produksi |
| `npm run seed` | Membuat akun admin |
| `npm run reindex [-- <materialId>]` | Membuat ulang potongan teks dan embedding materi |
| `npm run prepare-feedback [-- --force]` | Menyiapkan petunjuk dan penjelasan soal yang belum ada (`--force`: semua soal) |
| `npm run export-materi [-- <materialId>]` | Mengekspor lesson ke PDF (memerlukan Google Chrome) |
| `npm run export-soal` | Mengekspor soal beserta petunjuknya ke PDF |

## Struktur folder

```
app/            halaman & API (admin/, student/, api/)
components/     komponen UI (admin/, student/, auth/, ui/)
hooks/          hook React (text-to-speech, warna sorotan)
lib/            logika inti: pemrosesan PDF, lesson plan, soal, RAG, penilaian, TTS/STT
prisma/         skema basis data & seed
scripts/        skrip baris perintah (reindex, persiapan umpan balik, ekspor PDF)
uploads/        PDF yang diunggah guru (tidak ikut repo)
piper/          venv & model Piper (tidak ikut repo)
```

## Catatan

- Semua pemrosesan AI berjalan lokal melalui Ollama. Pembuatan lesson plan dan soal memerlukan beberapa menit per materi, tergantung perangkat keras.
- Edge TTS memakai layanan daring tidak resmi yang kadang menolak koneksi. Bila gagal, aplikasi otomatis beralih ke Piper.
- Bahasa antarmuka, prompt, dan konten adalah Bahasa Indonesia.
