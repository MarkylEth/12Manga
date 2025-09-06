'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check, Upload } from 'lucide-react';
import { useTheme } from '@/lib/theme/context';

/* ===== utils ===== */
function slugify(s: string) {
  const map: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',
    к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
    х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
  };
  return s.toLowerCase().split('').map(ch => map[ch] ?? ch).join('')
    .replace(/[^a-z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/(^-|-$)/g, '');
}

const TAG_PRESETS = ['Манга', 'Новеллы', 'Манхва'] as const;
const LANG_PRESETS = ['EN→RU', 'JP→RU', 'KR→RU', 'ZH→RU'] as const;

/* ===== small UI helpers ===== */
function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const Pill: React.FC<{
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  themeMode: 'light' | 'dark';
}> = ({ active, children, onClick, themeMode }) => {
  const base =
    themeMode === 'light'
      ? 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
      : 'bg-slate-700/50 text-slate-300 border border-slate-600/50 hover:bg-slate-600/50';
  const act =
    'bg-blue-600 text-white border-blue-600 shadow-md hover:bg-blue-700';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
        active ? act : base
      )}
    >
      {children}
      {active && <Check className="w-4 h-4" />}
    </button>
  );
};

const Switch: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-medium">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
        )}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={cx(
            'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </button>
    </label>
  );
};

export default function CreateTeamDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { theme } = useTheme(); // 'light' | 'dark'

  // form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [bio, setBio] = useState('');

  const [tags, setTags] = useState<string[]>(['Манга']);
  const [langs, setLangs] = useState<string[]>(['EN→RU']);

  // socials + toggles
  const [discord, setDiscord] = useState('');
  const [boosty, setBoosty] = useState('');
  const [telegram, setTelegram] = useState('');
  const [vk, setVk] = useState('');

  const [discordOn, setDiscordOn] = useState(false);
  const [boostyOn, setBoostyOn] = useState(false);
  const [telegramOn, setTelegramOn] = useState(false);
  const [vkOn, setVkOn] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugDirty) setSlug(slugify(name));
  }, [name, slugDirty]);

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleLang = (l: string) =>
    setLangs((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const inputCls = cx(
    'w-full rounded-2xl px-4 py-3 text-sm shadow-sm focus:ring-2 transition',
    theme === 'light'
      ? 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-500/20'
      : 'bg-slate-800/50 border-0 text-white placeholder-slate-400 focus:bg-slate-800/80 focus:ring-blue-500/20'
  );

  const cardBorder =
    theme === 'light' ? 'border-gray-200' : 'border-slate-700/50';
  const panelBg =
    theme === 'light' ? 'bg-white' : 'bg-slate-900/95';
  const headBg =
    theme === 'light'
      ? 'bg-gray-50'
      : 'bg-gradient-to-r from-slate-800/50 to-slate-900/50';
  const headText = theme === 'light' ? 'text-gray-900' : 'text-white';
  const subText = theme === 'light' ? 'text-gray-500' : 'text-slate-300';
  const labelText = theme === 'light' ? 'text-gray-700' : 'text-slate-100';

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          bio,
          langs,
          tags,
          discord_url: discordOn && discord.trim() ? discord.trim() : null,
          boosty_url: boostyOn && boosty.trim() ? boosty.trim() : null,
          telegram_url: telegramOn && telegram.trim() ? telegram.trim() : null,
          vk_url: vkOn && vk.trim() ? vk.trim() : null,
        }),
      });

      const js = await res.json().catch(() => ({}));
      if (!res.ok || !js?.ok) {
        const msg =
          js?.error === 'unauthorized'
            ? 'Вы не авторизованы'
            : js?.error === 'slug_exists'
            ? 'Такой slug уже занят'
            : js?.error === 'name_required'
            ? 'Введите название'
            : js?.error === 'slug_required'
            ? 'Введите slug'
            : js?.detail || js?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      onClose();
      router.push(`/team/${js.team?.slug || slug}`);
    } catch (err: any) {
      setError(err?.message ?? 'Неизвестная ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div
        className={cx(
          'relative w-full max-w-6xl rounded-3xl shadow-2xl border backdrop-blur-xl',
          panelBg,
          cardBorder
        )}
      >
        {/* Header */}
        <div className={cx('px-8 py-6 border-b rounded-t-3xl', headBg, cardBorder)}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={cx('text-2xl font-bold', headText)}>
                Создать команду переводчиков
              </h2>
              <p className={cx('text-sm mt-2', subText)}>
                Заполните информацию о команде для регистрации
              </p>
            </div>
            <button
              onClick={onClose}
              className={cx(
                'group p-3 rounded-2xl transition-all hover:opacity-80',
                theme === 'light' ? 'text-gray-600 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-800'
              )}
              aria-label="Закрыть"
            >
              <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={onSubmit}>
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 p-8">
              {/* Left Column - Main Info */}
              <div className="lg:col-span-3 space-y-8">
                {/* Name and Slug */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={cx('block text-sm font-semibold mb-3', labelText)}>
                      Название команды <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Например: Стальной алхимик"
                      className={inputCls}
                      required
                    />
                  </div>

                  <div>
                    <label className={cx('block text-sm font-semibold mb-3', labelText)}>
                      Ссылка команды <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={slug}
                      onChange={(e) => {
                        setSlug(e.target.value);
                        setSlugDirty(true);
                      }}
                      placeholder="steel-alchemist"
                      className={inputCls}
                      required
                    />
                    <p className={cx('text-sm mt-2', subText)}>
                      Будет в URL: /team/{slug || 'your-slug'}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className={cx('block text-sm font-semibold mb-3', labelText)}>
                    Описание команды
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    placeholder="Краткое описание команды..."
                    className={cx(inputCls, 'resize-vertical')}
                  />
                </div>

                {/* Categories (NO search, just pills) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <label className={cx('block text-sm font-semibold mb-3', labelText)}>
                      Что переводите
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {TAG_PRESETS.map((t) => (
                        <Pill
                          key={t}
                          active={tags.includes(t)}
                          onClick={() => toggleTag(t)}
                          themeMode={theme}
                        >
                          {t}
                        </Pill>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className={cx('block text-sm font-semibold mb-3', labelText)}>
                      Направления перевода
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {LANG_PRESETS.map((l) => (
                        <Pill
                          key={l}
                          active={langs.includes(l)}
                          onClick={() => toggleLang(l)}
                          themeMode={theme}
                        >
                          {l}
                        </Pill>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Social Links with toggles */}
                <div>
                  <h3 className={cx('text-lg font-semibold mb-4', labelText)}>
                    Ссылки на социальные сети
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Switch checked={discordOn} onChange={setDiscordOn} label="Discord" />
                      <input
                        value={discord}
                        onChange={(e) => setDiscord(e.target.value)}
                        placeholder="https://discord.gg/..."
                        className={inputCls}
                        disabled={!discordOn}
                      />
                    </div>

                    <div className="space-y-2">
                      <Switch checked={boostyOn} onChange={setBoostyOn} label="Boosty" />
                      <input
                        value={boosty}
                        onChange={(e) => setBoosty(e.target.value)}
                        placeholder="https://boosty.to/..."
                        className={inputCls}
                        disabled={!boostyOn}
                      />
                    </div>

                    <div className="space-y-2">
                      <Switch checked={telegramOn} onChange={setTelegramOn} label="Telegram" />
                      <input
                        value={telegram}
                        onChange={(e) => setTelegram(e.target.value)}
                        placeholder="https://t.me/..."
                        className={inputCls}
                        disabled={!telegramOn}
                      />
                    </div>

                    <div className="space-y-2">
                      <Switch checked={vkOn} onChange={setVkOn} label="VK" />
                      <input
                        value={vk}
                        onChange={(e) => setVk(e.target.value)}
                        placeholder="https://vk.com/..."
                        className={inputCls}
                        disabled={!vkOn}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Avatar (визуальный блок, тоже реагирует на тему) */}
              <div className="lg:col-span-2 space-y-8">
                <div>
                  <label className={cx('block text-sm font-semibold mb-3', labelText)}>
                    Аватар команды
                  </label>
                  <div
                    className={cx(
                      'relative h-80 w-full rounded-3xl border-2 border-dashed transition-all cursor-pointer group',
                      theme === 'light'
                        ? 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                        : 'border-slate-600/50 bg-gradient-to-br from-slate-800/30 to-slate-900/30 hover:from-slate-700/50 hover:to-slate-800/50'
                    )}
                  >
                    <div className="flex h-full w-full flex-col items-center justify-center text-center p-8">
                      <div
                        className={cx(
                          'rounded-full p-6 mb-4 transition-all group-hover:scale-110',
                          theme === 'light' ? 'bg-gray-200' : 'bg-slate-700'
                        )}
                      >
                        <Upload className={cx('w-8 h-8', theme === 'light' ? 'text-blue-600' : 'text-blue-400')} />
                      </div>
                      <h3 className={cx('font-semibold mb-2', headText)}>Загрузить аватар</h3>
                      <p className={cx('text-sm', subText)}>Перетащите изображение или нажмите для выбора</p>
                      <p className={cx('text-xs mt-2', subText)}>JPG, PNG до 10MB</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className={cx('text-xs font-medium mb-2 block', subText)}>
                      Или укажите ссылку на изображение
                    </label>
                    <input
                      placeholder="https://example.com/avatar.jpg"
                      className={inputCls}
                    />
                  </div>
                </div>

                {error && (
                  <div
                    className={cx(
                      'rounded-2xl p-6',
                      theme === 'light'
                        ? 'border border-red-200 bg-red-50 text-red-700'
                        : 'border border-red-800/50 bg-gradient-to-r from-red-900/20 to-rose-900/20 text-red-200'
                    )}
                  >
                    <div className="font-semibold mb-1">Ошибка создания команды</div>
                    <div className="text-sm">{error}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={cx('px-8 py-6 border-t rounded-b-3xl flex items-center justify-between', cardBorder,
            theme === 'light' ? 'bg-gray-50' : 'bg-gradient-to-r from-slate-800/30 to-slate-900/50'
          )}>
            <div className={cx('text-sm', subText)}>
              <span className="text-red-500">*</span> - обязательные поля для заполнения
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onClose}
                className={cx(
                  'px-6 py-3 rounded-2xl font-medium text-sm transition',
                  theme === 'light'
                    ? 'text-gray-700 border border-gray-300 hover:bg-gray-100'
                    : 'text-slate-300 border border-slate-600 hover:bg-slate-800'
                )}
                disabled={saving}
              >
                Отмена
              </button>
              <button
                type="submit"
                className={cx(
                  'group relative inline-flex items-center gap-3 px-8 py-3 rounded-2xl font-semibold text-sm text-white shadow-lg transition-all',
                  saving
                    ? 'bg-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-purple-700 hover:from-blue-700 hover:to-purple-800'
                )}
                disabled={saving}
              >
                <span>{saving ? 'Создание...' : 'Создать команду'}</span>
                {!saving && (
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}