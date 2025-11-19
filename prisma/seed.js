import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function extractShortAnswers(template) {
  // ambil isi di dalam tanda [ ... ]
  const matches = (template || '').match(/\[([^\]]*)\]/g) || []
  // bersihkan tanda [ ]
  return matches.map(m => m.replace(/^\[|\]$/g, '').trim())
}

async function main() {
  console.log('🌱 Seeding question domain (categories, packages, pages, questions) ...')

  // Clean ONLY question domain tables (safe order)
  await prisma.mediaAsset.deleteMany().catch(() => {})
  await prisma.questionItem.deleteMany().catch(() => {})
  await prisma.questionPage.deleteMany().catch(() => {})
  await prisma.questionPackage.deleteMany().catch(() => {})
  await prisma.questionCategory.deleteMany().catch(() => {})

  // ===== Datasets from user =====
  // 1) Multiple Choice Questions (27)
  const MCQ = [
    { q: 'Ibukota Indonesia adalah …', A: 'Kuala Lumpur', B: 'Jakarta', C: 'Manila', D: 'Bangkok', ans: 'B' },
    { q: '2 + 3 = …', A: '4', B: '5', C: '6', D: '7', ans: 'B' },
    { q: 'Warna langit saat cerah biasanya …', A: 'Merah', B: 'Biru', C: 'Hijau', D: 'Kuning', ans: 'B' },
    { q: 'Hewan yang bisa terbang adalah …', A: 'Ikan', B: 'Burung', C: 'Kucing', D: 'Ular', ans: 'B' },
    { q: 'Hari setelah Senin adalah …', A: 'Rabu', B: 'Kamis', C: 'Selasa', D: 'Jumat', ans: 'C' },
    { q: 'Alat untuk menulis di papan tulis adalah …', A: 'Pensil', B: 'Kapur', C: 'Penghapus', D: 'Pulpen', ans: 'B' },
    { q: '10 × 2 = …', A: '12', B: '15', C: '20', D: '25', ans: 'C' },
    { q: 'Air mendidih pada suhu … °C', A: '0', B: '50', C: '75', D: '100', ans: 'D' },
    { q: 'Planet yang paling dekat dengan Matahari adalah …', A: 'Mars', B: 'Venus', C: 'Merkurius', D: 'Jupiter', ans: 'C' },
    { q: 'Bahasa resmi Indonesia adalah …', A: 'Inggris', B: 'Jawa', C: 'Indonesia', D: 'Melayu', ans: 'C' },
    { q: 'Hasil dari 9 − 4 adalah …', A: '3', B: '4', C: '5', D: '6', ans: 'C' },
    { q: 'Hewan pemakan tumbuhan disebut …', A: 'Karnivora', B: 'Omnivora', C: 'Herbivora', D: 'Predator', ans: 'C' },
    { q: 'Segitiga memiliki … sisi', A: '2', B: '3', C: '4', D: '5', ans: 'B' },
    { q: 'Ibukota Jepang adalah …', A: 'Seoul', B: 'Tokyo', C: 'Beijing', D: 'Osaka', ans: 'B' },
    { q: '15 ÷ 3 = …', A: '3', B: '4', C: '5', D: '6', ans: 'C' },
    { q: 'Benda cair contohnya adalah …', A: 'Batu', B: 'Minyak', C: 'Kaca', D: 'Kayu', ans: 'B' },
    { q: 'Warna daun biasanya …', A: 'Hijau', B: 'Putih', C: 'Hitam', D: 'Ungu', ans: 'A' },
    { q: 'Matahari terbit dari arah …', A: 'Barat', B: 'Timur', C: 'Utara', D: 'Selatan', ans: 'B' },
    { q: 'Hewan yang hidup di air adalah …', A: 'Kuda', B: 'Ikan', C: 'Ayam', D: 'Kucing', ans: 'B' },
    { q: 'Alat untuk melihat waktu adalah …', A: 'Kompas', B: 'Jam', C: 'Termometer', D: 'Penggaris', ans: 'B' },
    { q: '8 + 7 = …', A: '14', B: '15', C: '16', D: '17', ans: 'B' },
    { q: 'Warna bendera Indonesia adalah …', A: 'Merah-Putih', B: 'Putih-Merah-Biru', C: 'Hijau-Kuning', D: 'Biru-Merah', ans: 'A' },
    { q: 'Ibu kota Malaysia adalah …', A: 'Bangkok', B: 'Manila', C: 'Kuala Lumpur', D: 'Hanoi', ans: 'C' },
    { q: 'Bahasa Inggris dari “Buku” adalah …', A: 'Pen', B: 'Book', C: 'Paper', D: 'Table', ans: 'B' },
    { q: '6 × 6 = …', A: '30', B: '32', C: '35', D: '36', ans: 'D' },
    { q: 'Bulan setelah Desember adalah …', A: 'Januari', B: 'Februari', C: 'November', D: 'Maret', ans: 'A' },
    { q: 'Jumlah hari dalam satu minggu adalah …', A: '5', B: '6', C: '7', D: '8', ans: 'C' },
  ]

  // 2) True / False / Not Given (27)
  const TFNG = [
    ['Matahari berputar mengelilingi Bumi.', 'F'],
    ['Jakarta adalah ibu kota Indonesia.', 'T'],
    ['Air laut berwarna hijau.', 'NG'],
    ['Anjing bisa terbang.', 'F'],
    ['Hujan berasal dari proses penguapan air.', 'T'],
    ['Ada 12 bulan dalam satu tahun.', 'T'],
    ['Manusia bisa hidup tanpa oksigen.', 'F'],
    ['Warna apel selalu kuning.', 'NG'],
    ['Gajah adalah hewan terkecil di dunia.', 'F'],
    ['Bumi berbentuk bulat.', 'T'],
    ['Semua kucing berwarna hitam.', 'NG'],
    ['2 + 2 = 5.', 'F'],
    ['Air membeku pada 0°C.', 'T'],
    ['Mobil bisa berjalan tanpa bensin.', 'F'],
    ['Hujan turun karena adanya awan.', 'T'],
    ['Matahari terbit dari barat.', 'F'],
    ['Ayam bertelur.', 'T'],
    ['Ada tujuh benua di dunia.', 'T'],
    ['Semua burung bisa berenang.', 'F'],
    ['Gunung adalah tempat yang datar.', 'F'],
    ['Bulan lebih besar dari Matahari.', 'F'],
    ['Ular tidak memiliki kaki.', 'T'],
    ['Semua ikan hidup di laut.', 'NG'],
    ['Air termasuk benda cair.', 'T'],
    ['Semua orang suka makan nasi.', 'NG'],
    ['Pesawat terbang di udara.', 'T'],
    ['Air asin bisa diminum dengan aman.', 'F'],
  ]

  // 3) Short Answer templates (27)
  const SHORT = [
    'Namaku adalah [Dikha], aku tinggal di [Bekasi]',
    'Bendera Indonesia berwarna [Merah] dan [Putih]',
    '5 + 5 = [10], dan 2 + 3 = [5]',
    'Hewan yang bisa terbang adalah [Burung], dan yang hidup di air adalah [Ikan]',
    'Ibukota Indonesia adalah [Jakarta], dan bahasa resminya adalah [Bahasa Indonesia]',
    'Bahasa Inggris dari “meja” adalah [Table], sedangkan “buku” adalah [Book]',
    'Ada [7] hari dalam satu minggu, dan [12] bulan dalam satu tahun',
    'Air berwujud [Cair], dan es berwujud [Padat]',
    'Penemu listrik adalah [Benjamin Franklin], sedangkan penemu bola lampu adalah [Thomas Edison]',
    'Lawan kata dari “panas” adalah [Dingin], dan lawan kata dari “besar” adalah [Kecil]',
    'Benda yang bisa mengapung di air adalah [Kayu], sedangkan benda yang tenggelam adalah [Batu]',
    'Hewan yang memiliki belalai panjang adalah [Gajah], dan hewan yang bisa melompat jauh adalah [Kangguru]',
    'Warna daun adalah [Hijau], sedangkan warna batang pohon adalah [Cokelat]',
    '9 × 2 = [18], dan 8 ÷ 2 = [4]',
    'Alat untuk melihat waktu adalah [Jam], dan alat untuk melihat arah adalah [Kompas]',
    'Presiden pertama Indonesia adalah [Soekarno], dan wakil presidennya adalah [Mohammad Hatta]',
    'Bentuk roda adalah [Bulat], dan bentuk bendera Indonesia adalah [Persegi Panjang]',
    'Buah berwarna kuning adalah [Pisang], dan buah berwarna merah adalah [Apel]',
    'Hewan yang hidup di air adalah [Ikan], dan yang hidup di darat adalah [Kucing]',
    '20 ÷ 5 = [4], dan 12 − 4 = [8]',
    'Warna langit saat siang hari adalah [Biru], sedangkan saat malam adalah [Hitam]',
    'Bulan setelah Juni adalah [Juli], dan sebelum Juni adalah [Mei]',
    'Satu tahun terdiri dari [12] bulan, dan satu bulan terdiri dari sekitar [30] hari',
    'Alat untuk menulis di kertas adalah [Pensil], dan untuk menghapus tulisan pensil adalah [Penghapus]',
    'Ibukota Jepang adalah [Tokyo], dan mata uangnya adalah [Yen]',
    'Warna bendera Malaysia adalah [Merah] dan [Putih]',
    'Hari sebelum Rabu adalah [Selasa], dan hari setelah Jumat adalah [Sabtu]',
  ]

  // Create 3 categories
  const categories = await prisma.$transaction([
    prisma.questionCategory.create({ data: { name: 'General Knowledge' } }),
    prisma.questionCategory.create({ data: { name: 'True/False/NG' } }),
    prisma.questionCategory.create({ data: { name: 'Short Answer' } }),
  ])

  // We need 9 packages total (3 categories * 3 packages each)
  const PACKAGES_PER_CATEGORY = 3
  const PAGES_PER_PACKAGE = 3

  // Prepare chunks so each package gets 3 items of each type
  // total packages = categories.length * PACKAGES_PER_CATEGORY = 9
  const totalPackages = categories.length * PACKAGES_PER_CATEGORY

  // each package should get exactly PAGES_PER_PACKAGE items of each type (3)
  const mcqChunks = chunkArray(MCQ, PAGES_PER_PACKAGE) // 27 / 3 = 9 chunks of length 3
  const tfngChunks = chunkArray(TFNG, PAGES_PER_PACKAGE)
  const shortChunks = chunkArray(SHORT, PAGES_PER_PACKAGE)

  // Sanity check
  if (mcqChunks.length !== totalPackages || tfngChunks.length !== totalPackages || shortChunks.length !== totalPackages) {
    throw new Error(`Data length mismatch: expected ${totalPackages} chunks, got mcq:${mcqChunks.length} tfng:${tfngChunks.length} short:${shortChunks.length}`)
  }

  // Helper to create one package with PAGES_PER_PACKAGE pages; each page gets 1 MCQ,1 TFNG,1 SHORT.
  async function createPackageForCategory(category, title, packageIndex) {
    const pkg = await prisma.questionPackage.create({
      data: {
        categoryId: category.id,
        title,
        durationMinutes: 30,
        status: 'DRAFT',
      },
    })

    let globalItemOrder = 1

    // for pageIndex 0..2 create a page and add three items
    for (let pageIndex = 0; pageIndex < PAGES_PER_PACKAGE; pageIndex++) {
      const page = await prisma.questionPage.create({
        data: {
          packageId: pkg.id,
          pageOrder: pageIndex + 1,
          storyPassage: null,
          instructions: null,
        },
      })

      // fetch corresponding items for this package and page
      const mcq = mcqChunks[packageIndex][pageIndex] // object
      const tfng = tfngChunks[packageIndex][pageIndex] // [q, ans]
      const shortTpl = shortChunks[packageIndex][pageIndex] // template string

      // create MCQ
      if (mcq) {
        await prisma.questionItem.create({
          data: {
            pageId: page.id,
            itemOrder: globalItemOrder++,
            type: 'MULTIPLE_CHOICE',
            question: mcq.q,
            choicesJson: [
              { key: 'A', text: mcq.A },
              { key: 'B', text: mcq.B },
              { key: 'C', text: mcq.C },
              { key: 'D', text: mcq.D },
            ],
            correctKey: mcq.ans,
          },
        })
      }

      // create TFNG
      if (tfng) {
        const [q, ans] = tfng
        await prisma.questionItem.create({
          data: {
            pageId: page.id,
            itemOrder: globalItemOrder++,
            type: 'TRUE_FALSE_NOT_GIVEN',
            question: q,
            choicesJson: [
              { key: 'T', text: 'True' },
              { key: 'F', text: 'False' },
              { key: 'NG', text: 'Not Given' },
            ],
            correctKey: ans,
          },
        })
      }

      // create SHORT
      if (shortTpl) {
        const answers = extractShortAnswers(shortTpl) // array
        await prisma.questionItem.create({
          data: {
            pageId: page.id,
            itemOrder: globalItemOrder++,
            type: 'SHORT_ANSWER',
            question: shortTpl,
            answerText: answers, // simpan sebagai array JSON
            correctKey: null,
          },
        })
      }
    }

    // After pages & items created, compute totalQuestions
    const savedItems = await prisma.questionItem.findMany({
      where: { page: { packageId: pkg.id } },
      select: { type: true, question: true },
    })

    const totalQuestions = savedItems.reduce((sum, x) => {
      if (x.type === 'SHORT_ANSWER') {
        const m = (x.question || '').match(/\[[^\]]*\]/g) || []
        return sum + (m.length > 0 ? m.length : 1)
      }
      return sum + 1
    }, 0)

    await prisma.questionPackage.update({
      where: { id: pkg.id },
      data: { totalQuestions },
    })

    return pkg
  }

  // Create packages: for each category produce PACKAGES_PER_CATEGORY packages
  // mapping packageIndex from 0..totalPackages-1
  let packageCounter = 0
  for (let catIndex = 0; catIndex < categories.length; catIndex++) {
    const category = categories[catIndex]
    for (let p = 0; p < PACKAGES_PER_CATEGORY; p++) {
      const packageIndex = packageCounter // 0..8 across all categories
      const title = `${category.name.toLowerCase().replace(/\s+/g, '-').slice(0, 20)}-pkg${String(p + 1).padStart(3, '0')}`
      await createPackageForCategory(category, title, packageIndex)
      packageCounter++
    }
  }

  console.log('🎉 Seed completed successfully')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })