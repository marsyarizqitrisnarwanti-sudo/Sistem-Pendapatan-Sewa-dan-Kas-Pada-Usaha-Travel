# Sistem Akuntansi Pendapatan Sewa dan Kas Travel

Web app Shabil Trans untuk mengelola pelanggan, driver, perjalanan, penerimaan pelanggan, uang jalan, bukti biaya operasional, dan penyelesaian bersih komisi driver. Aplikasi memakai empat tabel inti Supabase: `customers`, `drivers`, `trips`, dan `cash_transactions`.

Demo Web: https://marsyarizqitrisnarwanti-sudo.github.io/Sistem-Pendapatan-Sewa-dan-Kas-Pada-Travel/

## Menjalankan

1. Buat proyek Supabase, lalu jalankan isi [backend/schema.sql](backend/schema.sql) melalui SQL Editor.
2. Atur environment variable `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` di PowerShell sebelum mulai server. Gunakan secret/service-role key server-side (bukan publishable/anon key); jangan menaruh key pada frontend/source code atau membagikannya:
   ```powershell
   $env:SUPABASE_URL = "https://<project-ref>.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "<secret-key-server-side>"
   node backend\app.js
   ```
3. Dengan Node.js 18 atau lebih baru, jalankan `node backend/app.js` dari folder proyek.
4. Buka `http://127.0.0.1:3000`.

Tidak diperlukan `package.json` atau dependensi eksternal. Backend sengaja hanya mendengarkan di loopback lokal.
Jika tampilan masih polos setelah perubahan frontend, hentikan dan jalankan kembali backend agar versi terbaru aktif, lalu lakukan hard refresh di Chrome dengan `Ctrl+Shift+R`. Buka alamat `http://127.0.0.1:3000` pada laptop yang menjalankan backend.

### Membuka `frontend/index.html` langsung

File tersebut juga dapat dibuka dengan klik ganda di File Explorer. Mode ini menyimpan pelanggan, driver, perjalanan, dan transaksi di browser yang sama; data tidak tersinkron ke Supabase atau browser/perangkat lain. Panel kiri menandai mode lokal. Untuk menyimpan data ke Supabase, gunakan `http://127.0.0.1:3000`.

## Pembayaran, edit, dan hapus

- Pembayaran pelanggan memiliki jenis **DP** (nominal manual) dan **Lunas** (sisa tagihan dihitung otomatis); catatan pembayaran dihubungkan langsung ke perjalanan.
- Dari baris perjalanan, tombol **Pembayaran** dan **Biaya** membuka formulir yang sudah memilih perjalanan terkait.
- Kontak, perjalanan yang belum selesai, serta transaksi dapat diedit. Penghapusan kontak yang sudah dipakai, perjalanan yang memiliki transaksi, atau catatan penyelesaian driver ditolak untuk menjaga hubungan data dan jejak keuangan.
- Perjalanan aktif dapat **dibatalkan**. Pembatalan mempertahankan perjalanan beserta jurnal yang sudah terkait; tidak ada transaksi baru pada perjalanan yang sudah dibatalkan. Hapus permanen hanya tersedia jika belum ada transaksi.
- Pada proyek Supabase yang sudah menjalankan schema sebelumnya, jalankan [backend/update_payments.sql](backend/update_payments.sql) satu kali di SQL Editor sebelum menggunakan kategori DP/Lunas.

## Aturan pencatatan

- Komisi default 10% dari sewa bruto; nilai perjalanan dapat menimpa persentase tersebut tanpa mengubah default.
- Pendapatan sewa diakui dari perjalanan berstatus selesai. Pembayaran pelanggan dicatat pada kanal kas tunai atau bank.
- Uang jalan adalah arus kas keluar. Bukti bensin, tol, parkir, makan, dan biaya lain dicatat per perjalanan; biaya baru masuk ringkasan biaya setelah divalidasi admin. Baris bukti biaya tidak dihitung sebagai arus kas kedua karena kas keluar sudah dicatat pada uang jalan.
- Penyelesaian driver mensyaratkan perjalanan selesai dan seluruh biaya tervalidasi. Backend menghitung komisi bruto dikurangi uang jalan yang belum dipertanggungjawabkan, disesuaikan dengan penggantian/retur yang sudah dicatat. Hasil positif adalah pembayaran bersih kepada driver; hasil negatif dicatat sebagai pelunasan piutang driver. Kanal kas/bank dipilih saat penyelesaian.

## Aset foto banner

Foto Toyota HiAce Premio untuk banner disimpan lokal di `frontend/images/` agar tetap tampil tanpa mengambil gambar dari server eksternal saat aplikasi dibuka:

- `hiace.jpg` — foto Toyota HiAce Premio oleh Sulthan Naufal, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), [sumber Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Toyota_HiAce_Premio_in_Melasti_Beach,_Bali_(25-03-2026).jpg).

Foto ditampilkan dengan lapisan warna hijau toska transparan. Kredit dan tautan lisensi juga tersedia di banner.

## Batas penggunaan

Versi awal ini untuk satu operator lokal dan belum menyediakan login/otorisasi pengguna. Jangan mengekspos backend ke internet: server menggunakan service-role key yang memiliki akses database penuh. Sebelum penggunaan multi-user/produksi, tambahkan autentikasi, otorisasi admin, pencatatan identitas validator, dan kebijakan RLS yang sesuai.
