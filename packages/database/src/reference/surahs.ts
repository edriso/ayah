// Surah reference table: number, Arabic name, Latin transliteration, and
// revelation place for all 114 surahs.
//
// IMPORTANT: this table does NOT carry ayah counts. The number of ayat in
// each surah is taken from the verified Tanzil text at seed time, so the
// count can never disagree with the actual text we store.
//
// The revelation place uses the standard Madinah-mushaf classification
// (the same one Quran.com exposes as "revelation_place"). A small number of
// surahs have scholarly differences of opinion; this field is informational
// only and nothing in the daily-send logic depends on it.

export interface SurahMeta {
  number: number;
  nameAr: string;
  nameEn: string;
  revelation: 'meccan' | 'medinan';
}

export const SURAHS: readonly SurahMeta[] = [
  { number: 1, nameAr: 'الفاتحة', nameEn: 'Al-Fatihah', revelation: 'meccan' },
  { number: 2, nameAr: 'البقرة', nameEn: 'Al-Baqarah', revelation: 'medinan' },
  { number: 3, nameAr: 'آل عمران', nameEn: 'Aal-E-Imran', revelation: 'medinan' },
  { number: 4, nameAr: 'النساء', nameEn: 'An-Nisa', revelation: 'medinan' },
  { number: 5, nameAr: 'المائدة', nameEn: 'Al-Maidah', revelation: 'medinan' },
  { number: 6, nameAr: 'الأنعام', nameEn: 'Al-Anam', revelation: 'meccan' },
  { number: 7, nameAr: 'الأعراف', nameEn: 'Al-Araf', revelation: 'meccan' },
  { number: 8, nameAr: 'الأنفال', nameEn: 'Al-Anfal', revelation: 'medinan' },
  { number: 9, nameAr: 'التوبة', nameEn: 'At-Tawbah', revelation: 'medinan' },
  { number: 10, nameAr: 'يونس', nameEn: 'Yunus', revelation: 'meccan' },
  { number: 11, nameAr: 'هود', nameEn: 'Hud', revelation: 'meccan' },
  { number: 12, nameAr: 'يوسف', nameEn: 'Yusuf', revelation: 'meccan' },
  { number: 13, nameAr: 'الرعد', nameEn: 'Ar-Rad', revelation: 'medinan' },
  { number: 14, nameAr: 'إبراهيم', nameEn: 'Ibrahim', revelation: 'meccan' },
  { number: 15, nameAr: 'الحجر', nameEn: 'Al-Hijr', revelation: 'meccan' },
  { number: 16, nameAr: 'النحل', nameEn: 'An-Nahl', revelation: 'meccan' },
  { number: 17, nameAr: 'الإسراء', nameEn: 'Al-Isra', revelation: 'meccan' },
  { number: 18, nameAr: 'الكهف', nameEn: 'Al-Kahf', revelation: 'meccan' },
  { number: 19, nameAr: 'مريم', nameEn: 'Maryam', revelation: 'meccan' },
  { number: 20, nameAr: 'طه', nameEn: 'Ta-Ha', revelation: 'meccan' },
  { number: 21, nameAr: 'الأنبياء', nameEn: 'Al-Anbiya', revelation: 'meccan' },
  { number: 22, nameAr: 'الحج', nameEn: 'Al-Hajj', revelation: 'medinan' },
  { number: 23, nameAr: 'المؤمنون', nameEn: 'Al-Muminun', revelation: 'meccan' },
  { number: 24, nameAr: 'النور', nameEn: 'An-Nur', revelation: 'medinan' },
  { number: 25, nameAr: 'الفرقان', nameEn: 'Al-Furqan', revelation: 'meccan' },
  { number: 26, nameAr: 'الشعراء', nameEn: 'Ash-Shuara', revelation: 'meccan' },
  { number: 27, nameAr: 'النمل', nameEn: 'An-Naml', revelation: 'meccan' },
  { number: 28, nameAr: 'القصص', nameEn: 'Al-Qasas', revelation: 'meccan' },
  { number: 29, nameAr: 'العنكبوت', nameEn: 'Al-Ankabut', revelation: 'meccan' },
  { number: 30, nameAr: 'الروم', nameEn: 'Ar-Rum', revelation: 'meccan' },
  { number: 31, nameAr: 'لقمان', nameEn: 'Luqman', revelation: 'meccan' },
  { number: 32, nameAr: 'السجدة', nameEn: 'As-Sajdah', revelation: 'meccan' },
  { number: 33, nameAr: 'الأحزاب', nameEn: 'Al-Ahzab', revelation: 'medinan' },
  { number: 34, nameAr: 'سبأ', nameEn: 'Saba', revelation: 'meccan' },
  { number: 35, nameAr: 'فاطر', nameEn: 'Fatir', revelation: 'meccan' },
  { number: 36, nameAr: 'يس', nameEn: 'Ya-Sin', revelation: 'meccan' },
  { number: 37, nameAr: 'الصافات', nameEn: 'As-Saffat', revelation: 'meccan' },
  { number: 38, nameAr: 'ص', nameEn: 'Sad', revelation: 'meccan' },
  { number: 39, nameAr: 'الزمر', nameEn: 'Az-Zumar', revelation: 'meccan' },
  { number: 40, nameAr: 'غافر', nameEn: 'Ghafir', revelation: 'meccan' },
  { number: 41, nameAr: 'فصلت', nameEn: 'Fussilat', revelation: 'meccan' },
  { number: 42, nameAr: 'الشورى', nameEn: 'Ash-Shura', revelation: 'meccan' },
  { number: 43, nameAr: 'الزخرف', nameEn: 'Az-Zukhruf', revelation: 'meccan' },
  { number: 44, nameAr: 'الدخان', nameEn: 'Ad-Dukhan', revelation: 'meccan' },
  { number: 45, nameAr: 'الجاثية', nameEn: 'Al-Jathiyah', revelation: 'meccan' },
  { number: 46, nameAr: 'الأحقاف', nameEn: 'Al-Ahqaf', revelation: 'meccan' },
  { number: 47, nameAr: 'محمد', nameEn: 'Muhammad', revelation: 'medinan' },
  { number: 48, nameAr: 'الفتح', nameEn: 'Al-Fath', revelation: 'medinan' },
  { number: 49, nameAr: 'الحجرات', nameEn: 'Al-Hujurat', revelation: 'medinan' },
  { number: 50, nameAr: 'ق', nameEn: 'Qaf', revelation: 'meccan' },
  { number: 51, nameAr: 'الذاريات', nameEn: 'Adh-Dhariyat', revelation: 'meccan' },
  { number: 52, nameAr: 'الطور', nameEn: 'At-Tur', revelation: 'meccan' },
  { number: 53, nameAr: 'النجم', nameEn: 'An-Najm', revelation: 'meccan' },
  { number: 54, nameAr: 'القمر', nameEn: 'Al-Qamar', revelation: 'meccan' },
  { number: 55, nameAr: 'الرحمن', nameEn: 'Ar-Rahman', revelation: 'medinan' },
  { number: 56, nameAr: 'الواقعة', nameEn: 'Al-Waqiah', revelation: 'meccan' },
  { number: 57, nameAr: 'الحديد', nameEn: 'Al-Hadid', revelation: 'medinan' },
  { number: 58, nameAr: 'المجادلة', nameEn: 'Al-Mujadila', revelation: 'medinan' },
  { number: 59, nameAr: 'الحشر', nameEn: 'Al-Hashr', revelation: 'medinan' },
  { number: 60, nameAr: 'الممتحنة', nameEn: 'Al-Mumtahanah', revelation: 'medinan' },
  { number: 61, nameAr: 'الصف', nameEn: 'As-Saff', revelation: 'medinan' },
  { number: 62, nameAr: 'الجمعة', nameEn: 'Al-Jumuah', revelation: 'medinan' },
  { number: 63, nameAr: 'المنافقون', nameEn: 'Al-Munafiqun', revelation: 'medinan' },
  { number: 64, nameAr: 'التغابن', nameEn: 'At-Taghabun', revelation: 'medinan' },
  { number: 65, nameAr: 'الطلاق', nameEn: 'At-Talaq', revelation: 'medinan' },
  { number: 66, nameAr: 'التحريم', nameEn: 'At-Tahrim', revelation: 'medinan' },
  { number: 67, nameAr: 'الملك', nameEn: 'Al-Mulk', revelation: 'meccan' },
  { number: 68, nameAr: 'القلم', nameEn: 'Al-Qalam', revelation: 'meccan' },
  { number: 69, nameAr: 'الحاقة', nameEn: 'Al-Haqqah', revelation: 'meccan' },
  { number: 70, nameAr: 'المعارج', nameEn: 'Al-Maarij', revelation: 'meccan' },
  { number: 71, nameAr: 'نوح', nameEn: 'Nuh', revelation: 'meccan' },
  { number: 72, nameAr: 'الجن', nameEn: 'Al-Jinn', revelation: 'meccan' },
  { number: 73, nameAr: 'المزمل', nameEn: 'Al-Muzzammil', revelation: 'meccan' },
  { number: 74, nameAr: 'المدثر', nameEn: 'Al-Muddaththir', revelation: 'meccan' },
  { number: 75, nameAr: 'القيامة', nameEn: 'Al-Qiyamah', revelation: 'meccan' },
  { number: 76, nameAr: 'الإنسان', nameEn: 'Al-Insan', revelation: 'medinan' },
  { number: 77, nameAr: 'المرسلات', nameEn: 'Al-Mursalat', revelation: 'meccan' },
  { number: 78, nameAr: 'النبأ', nameEn: 'An-Naba', revelation: 'meccan' },
  { number: 79, nameAr: 'النازعات', nameEn: 'An-Naziat', revelation: 'meccan' },
  { number: 80, nameAr: 'عبس', nameEn: 'Abasa', revelation: 'meccan' },
  { number: 81, nameAr: 'التكوير', nameEn: 'At-Takwir', revelation: 'meccan' },
  { number: 82, nameAr: 'الانفطار', nameEn: 'Al-Infitar', revelation: 'meccan' },
  { number: 83, nameAr: 'المطففين', nameEn: 'Al-Mutaffifin', revelation: 'meccan' },
  { number: 84, nameAr: 'الانشقاق', nameEn: 'Al-Inshiqaq', revelation: 'meccan' },
  { number: 85, nameAr: 'البروج', nameEn: 'Al-Buruj', revelation: 'meccan' },
  { number: 86, nameAr: 'الطارق', nameEn: 'At-Tariq', revelation: 'meccan' },
  { number: 87, nameAr: 'الأعلى', nameEn: 'Al-Ala', revelation: 'meccan' },
  { number: 88, nameAr: 'الغاشية', nameEn: 'Al-Ghashiyah', revelation: 'meccan' },
  { number: 89, nameAr: 'الفجر', nameEn: 'Al-Fajr', revelation: 'meccan' },
  { number: 90, nameAr: 'البلد', nameEn: 'Al-Balad', revelation: 'meccan' },
  { number: 91, nameAr: 'الشمس', nameEn: 'Ash-Shams', revelation: 'meccan' },
  { number: 92, nameAr: 'الليل', nameEn: 'Al-Layl', revelation: 'meccan' },
  { number: 93, nameAr: 'الضحى', nameEn: 'Ad-Duha', revelation: 'meccan' },
  { number: 94, nameAr: 'الشرح', nameEn: 'Ash-Sharh', revelation: 'meccan' },
  { number: 95, nameAr: 'التين', nameEn: 'At-Tin', revelation: 'meccan' },
  { number: 96, nameAr: 'العلق', nameEn: 'Al-Alaq', revelation: 'meccan' },
  { number: 97, nameAr: 'القدر', nameEn: 'Al-Qadr', revelation: 'meccan' },
  { number: 98, nameAr: 'البينة', nameEn: 'Al-Bayyinah', revelation: 'medinan' },
  { number: 99, nameAr: 'الزلزلة', nameEn: 'Az-Zalzalah', revelation: 'medinan' },
  { number: 100, nameAr: 'العاديات', nameEn: 'Al-Adiyat', revelation: 'meccan' },
  { number: 101, nameAr: 'القارعة', nameEn: 'Al-Qariah', revelation: 'meccan' },
  { number: 102, nameAr: 'التكاثر', nameEn: 'At-Takathur', revelation: 'meccan' },
  { number: 103, nameAr: 'العصر', nameEn: 'Al-Asr', revelation: 'meccan' },
  { number: 104, nameAr: 'الهمزة', nameEn: 'Al-Humazah', revelation: 'meccan' },
  { number: 105, nameAr: 'الفيل', nameEn: 'Al-Fil', revelation: 'meccan' },
  { number: 106, nameAr: 'قريش', nameEn: 'Quraysh', revelation: 'meccan' },
  { number: 107, nameAr: 'الماعون', nameEn: 'Al-Maun', revelation: 'meccan' },
  { number: 108, nameAr: 'الكوثر', nameEn: 'Al-Kawthar', revelation: 'meccan' },
  { number: 109, nameAr: 'الكافرون', nameEn: 'Al-Kafirun', revelation: 'meccan' },
  { number: 110, nameAr: 'النصر', nameEn: 'An-Nasr', revelation: 'medinan' },
  { number: 111, nameAr: 'المسد', nameEn: 'Al-Masad', revelation: 'meccan' },
  { number: 112, nameAr: 'الإخلاص', nameEn: 'Al-Ikhlas', revelation: 'meccan' },
  { number: 113, nameAr: 'الفلق', nameEn: 'Al-Falaq', revelation: 'meccan' },
  { number: 114, nameAr: 'الناس', nameEn: 'An-Nas', revelation: 'meccan' },
] as const;

/** Look up one surah's metadata by its number (1-114). */
export function surahMeta(number: number): SurahMeta {
  const found = SURAHS.find((s) => s.number === number);
  if (!found) throw new Error(`No surah metadata for number ${number}`);
  return found;
}
