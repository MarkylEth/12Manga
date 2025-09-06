// app/data/titles.ts
// Небольшой мок-датасет (на случай, если нужно показать список без БД)
// Можно удалить позже, когда всё будет приходить из /api/catalog.

export type TitleShort = {
  id: number;
  title: string;
  cover_url?: string | null;
  year?: number | null;
  rating?: number | null;
};

export const TITLES_MOCK: TitleShort[] = [
  { id: 101, title: 'Пример тайтла A', cover_url: '', year: 2022, rating: 8.4 },
  { id: 102, title: 'Пример тайтла B', cover_url: '', year: 2021, rating: 7.9 },
  { id: 103, title: 'Пример тайтла C', cover_url: '', year: 2023, rating: 9.1 },
];
