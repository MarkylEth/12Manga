'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { X, Upload, Loader2, Search, Plus, Check } from 'lucide-react';
import { useTheme } from '@/lib/theme/context';
import { GENRES, TAGS } from '@/lib/taxonomy';


const cx = (...cls: Array<string | false | null | undefined>) => cls.filter(Boolean).join(' ');
const clampYear = (n: number) => Math.min(Math.max(n || new Date().getFullYear(), 1900), new Date().getFullYear() + 1);

function ModernMultiSelect({
  items, value, onChange, placeholder = 'Найти и добавить...', disabled = false, label
}: {
  items: readonly string[]; 
  value: string[]; 
  onChange: (next: string[]) => void; 
  placeholder?: string; 
  disabled?: boolean;
  label: string;
}) {
  const { theme } = useTheme();
  const [q, setQ] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [...items];
    return [...items].filter((i) => i.toLowerCase().includes(s));
  }, [q, items]);

  const toggle = (name: string) => {
    const set = new Set(value);
    set.has(name) ? set.delete(name) : set.add(name);
    onChange([...set]);
  };

  // Генерация цвета на основе хеша строки
  const getItemColor = (item: string) => {
    let hash = 0;
    for (let i = 0; i < item.length; i++) {
      hash = item.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'bg-gradient-to-r from-blue-500 to-cyan-500',
      'bg-gradient-to-r from-purple-500 to-pink-500',
      'bg-gradient-to-r from-emerald-500 to-teal-500',
      'bg-gradient-to-r from-orange-500 to-red-500',
      'bg-gradient-to-r from-indigo-500 to-purple-500',
      'bg-gradient-to-r from-pink-500 to-rose-500',
      'bg-gradient-to-r from-yellow-500 to-orange-500',
      'bg-gradient-to-r from-teal-500 to-green-500',
      'bg-gradient-to-r from-sky-500 to-blue-500',
      'bg-gradient-to-r from-violet-500 to-purple-500',
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const containerClass = theme === 'light'
    ? 'bg-white border border-gray-200/80 rounded-2xl shadow-sm'
    : 'bg-slate-800/80 border border-slate-600/50 rounded-2xl shadow-sm';

  const searchClass = theme === 'light'
    ? 'w-full bg-gray-50/50 border-0 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all'
    : 'w-full bg-slate-700/50 border-0 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-400 focus:bg-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all';

  const dropdownClass = theme === 'light'
    ? 'absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-gray-200/80 rounded-2xl shadow-xl backdrop-blur-sm max-h-72 overflow-auto'
    : 'absolute top-full left-0 right-0 z-50 mt-2 bg-slate-800/95 border border-slate-600/50 rounded-2xl shadow-xl backdrop-blur-sm max-h-72 overflow-auto';

  const itemButtonClass = (selected: boolean) => {
    const base = 'w-full px-4 py-3 text-left text-sm transition-all duration-200 flex items-center justify-between group';
    if (theme === 'light') {
      return `${base} text-gray-900 hover:bg-blue-50/50 ${selected ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-800' : ''}`;
    } else {
      return `${base} text-white hover:bg-slate-700/50 ${selected ? 'bg-gradient-to-r from-green-900/20 to-emerald-900/20 text-green-300' : ''}`;
    }
  };

  const displayLimit = 6;
  const displayedItems = showAll ? value : value.slice(0, displayLimit);
  const hasMore = value.length > displayLimit;

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <div className={containerClass}>
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className={`${searchClass} pl-10`}
                placeholder={placeholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setIsOpen(true)}
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        {/* Dropdown */}
        {isOpen && q.trim() && (
          <>
            <div className={dropdownClass}>
              {filtered.length > 0 ? (
                <div className="p-2">
                  {filtered.slice(0, 8).map((name) => {
                    const selected = value.includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          toggle(name);
                          setQ('');
                          setIsOpen(false);
                        }}
                        className={itemButtonClass(selected)}
                      >
                        <span className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full transition-all ${selected ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                          {name}
                        </span>
                        {selected && <Check className="w-4 h-4 text-green-600" />}
                      </button>
                    );
                  })}
                  {filtered.length > 8 && (
                    <div className={`px-4 py-2 text-xs text-center ${theme === 'light' ? 'text-gray-500' : 'text-slate-400'}`}>
                      Показано первые 8 из {filtered.length} результатов
                    </div>
                  )}
                </div>
              ) : (
                <div className={`px-4 py-8 text-sm text-center ${theme === 'light' ? 'text-gray-500' : 'text-slate-400'}`}>
                  <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  Ничего не найдено
                </div>
              )}
            </div>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          </>
        )}
      </div>

      {/* Selected Items */}
      {value.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-200'}`}>
              {label}: {value.length}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  theme === 'light'
                    ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                    : 'text-blue-400 bg-blue-900/20 hover:bg-blue-900/30'
                }`}
              >
                {showAll ? 'Скрыть' : `+${value.length - displayLimit} еще`}
              </button>
            )}
          </div>
          
          <div className="flex flex-wrap gap-2">
            {displayedItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => toggle(item)}
                className={`group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 ${getItemColor(item)}`}
              >
                <span className="relative z-10">{item}</span>
                <div className="relative z-10 w-4 h-4 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <X className="w-3 h-3" />
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AddTitleModalProps {
  trigger?: React.ReactNode;
  showDefaultTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

interface TeamLite { id: number; name: string; slug: string | null; }

export default function AddTitleModal({
  trigger, showDefaultTrigger = false, open: controlledOpen, onOpenChange, onSuccess,
}: AddTitleModalProps) {
  const { theme } = useTheme();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpenState = (v: boolean) => (isControlled ? onOpenChange?.(v) : setUncontrolledOpen(v));

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title_ru: '', title_original: '', author: '', artist: '', description: '',
    status: 'ongoing', translation_status: 'продолжается', age_rating: '16+',
    release_year: new Date().getFullYear(), type: 'манга',
    genres: [] as string[], tags: [] as string[], cover_url: '', source_links: '', comment: '',
  });
  const handleInput = (key: keyof typeof formData, v: any) => setFormData((p) => ({ ...p, [key]: v }));

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const onCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setCoverFile(f); const reader = new FileReader();
    reader.onload = () => setCoverPreview(String(reader.result || '')); reader.readAsDataURL(f);
  };

  // выбор команд переводчиков (поиск по REST)
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [teamQuery, setTeamQuery] = useState('');
  const [teamResults, setTeamResults] = useState<TeamLite[]>([]);
  const [teamSearching, setTeamSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = teamQuery.trim();
    if (!q) { setTeamResults([]); setTeamSearching(false); abortRef.current?.abort(); return; }
    setTeamSearching(true);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/teams/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const js = await res.json();
        setTeamResults(Array.isArray(js?.items) ? js.items : []);
      } finally { setTeamSearching(false); }
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [teamQuery]);

  const addTeam = (t: TeamLite) => {
    setTeams((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
    setTeamQuery(''); setTeamResults([]);
  };
  const removeTeam = (id: number) => setTeams((prev) => prev.filter((t) => t.id !== id));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleSubmit = async () => {
    if (!formData.title_ru.trim()) { alert('Укажите название тайтла'); return; }

    setSubmitting(true); setError(null); setOk(false);
    try {
      // 1) upload cover if present
      let coverUrl = formData.cover_url.trim();
      if (coverFile) {
        const fd = new FormData();
        fd.append('file', coverFile);
        fd.append('type', 'cover');
        const up = await fetch('/api/upload', { method: 'POST', body: fd });
        const txt = await up.text();
        const js = (() => { try { return JSON.parse(txt); } catch { return null; } })();
        if (!up.ok || !js?.ok || !js?.url) throw new Error(js?.error || 'Ошибка загрузки обложки');
        coverUrl = js.url;
      }

      // 2) POST title submission
      const body = {
        type: formData.type,
        source_links: formData.source_links.split('\n').map((s) => s.trim()).filter(Boolean),
        genres: formData.genres,
        tags: formData.tags,
        author_comment: formData.comment,
        payload: {
          title: formData.title_ru,
          title_ru: formData.title_ru,
          original_title: formData.title_original,
          cover_url: coverUrl,
          author: formData.author,
          artist: formData.artist,
          description: formData.description,
          status: formData.status,
          translation_status: formData.translation_status,
          age_rating: formData.age_rating,
          release_year: clampYear(Number(formData.release_year)),
          type: formData.type,
          genres: formData.genres,
          tags: formData.tags,
          translator_team_id: teams[0]?.id ?? null,
          translators: teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
        },
      };

      const res = await fetch('/api/title-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok || !js?.ok) throw new Error(js?.error || `HTTP ${res.status}`);

      setOk(true); setTimeout(() => setOk(false), 3000);

      setFormData((p) => ({
        ...p,
        title_ru: '', title_original: '', author: '', artist: '', description: '',
        genres: [], tags: [], cover_url: '', source_links: '', comment: '',
      }));
      setCoverFile(null); setCoverPreview(''); setTeams([]); setTeamQuery('');
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message || 'Не удалось отправить заявку');
    } finally {
      setSubmitting(false);
    }
  };

  // Современные стили
  const overlayClass = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md';
  
  const modalClass = theme === 'light'
    ? 'relative w-full max-w-7xl bg-white rounded-3xl shadow-2xl border border-gray-100'
    : 'relative w-full max-w-7xl bg-slate-900/95 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-xl';

  const headerClass = theme === 'light'
    ? 'px-8 py-6 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-purple-50/50 rounded-t-3xl'
    : 'px-8 py-6 border-b border-slate-700/50 bg-gradient-to-r from-slate-800/50 to-slate-900/50 rounded-t-3xl';

  const inputClass = theme === 'light'
    ? 'w-full rounded-2xl border-0 bg-gray-50/50 px-4 py-4 text-sm text-gray-900 placeholder-gray-500 shadow-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:shadow-md transition-all duration-200'
    : 'w-full rounded-2xl border-0 bg-slate-800/50 px-4 py-4 text-sm text-white placeholder-slate-400 shadow-sm focus:bg-slate-800/80 focus:ring-2 focus:ring-blue-500/20 focus:shadow-md transition-all duration-200';

  const textareaClass = theme === 'light'
    ? 'w-full rounded-2xl border-0 bg-gray-50/50 px-4 py-4 text-sm text-gray-900 placeholder-gray-500 shadow-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:shadow-md transition-all duration-200 resize-vertical min-h-[120px]'
    : 'w-full rounded-2xl border-0 bg-slate-800/50 px-4 py-4 text-sm text-white placeholder-slate-400 shadow-sm focus:bg-slate-800/80 focus:ring-2 focus:ring-blue-500/20 focus:shadow-md transition-all duration-200 resize-vertical min-h-[120px]';

  const selectClass = theme === 'light'
    ? 'w-full rounded-2xl border-0 bg-gray-50/50 px-4 py-4 text-sm text-gray-900 shadow-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:shadow-md transition-all duration-200 cursor-pointer'
    : 'w-full rounded-2xl border-0 bg-slate-800/50 px-4 py-4 text-sm text-white shadow-sm focus:bg-slate-800/80 focus:ring-2 focus:ring-blue-500/20 focus:shadow-md transition-all duration-200 cursor-pointer';

  const labelClass = theme === 'light' 
    ? 'block text-sm font-semibold text-gray-800 mb-3' 
    : 'block text-sm font-semibold text-gray-100 mb-3';

  const dropzoneClass = theme === 'light'
    ? 'relative h-80 w-full rounded-3xl border-2 border-dashed border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100/50 hover:from-blue-50 hover:to-purple-50/50 hover:border-blue-300 transition-all duration-300 cursor-pointer group'
    : 'relative h-80 w-full rounded-3xl border-2 border-dashed border-slate-600/50 bg-gradient-to-br from-slate-800/30 to-slate-900/30 hover:from-slate-700/50 hover:to-slate-800/50 hover:border-slate-500 transition-all duration-300 cursor-pointer group';

  const footerClass = theme === 'light'
    ? 'px-8 py-6 border-t border-gray-100 bg-gradient-to-r from-gray-50/50 to-blue-50/30 rounded-b-3xl'
    : 'px-8 py-6 border-t border-slate-700/50 bg-gradient-to-r from-slate-800/30 to-slate-900/50 rounded-b-3xl';

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpenState(true)} className="inline-block cursor-pointer">
          {trigger}
        </span>
      ) : showDefaultTrigger ? (
        <button
          type="button"
          onClick={() => setOpenState(true)}
          className={`group relative inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-medium text-sm transition-all duration-300 transform hover:scale-105 ${
            theme === 'light'
              ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg hover:shadow-xl'
              : 'bg-gradient-to-r from-blue-600 to-purple-700 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          <Plus className="w-4 h-4" />
          Добавить тайтл
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 rounded-2xl transition-colors" />
        </button>
      ) : null}

      {open && (
        <div className={overlayClass} role="dialog" aria-modal="true">
          <div className={modalClass}>
            {/* Header */}
            <div className={headerClass}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className={`text-2xl font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                    Предложить новый тайтл
                  </h2>
                  <p className={`text-sm mt-2 ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>
                    Заполните информацию о манге для отправки на модерацию
                  </p>
                </div>
                <button 
                  onClick={() => setOpenState(false)}
                  className={`group p-3 rounded-2xl transition-all duration-200 ${
                    theme === 'light'
                      ? 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                      : 'hover:bg-slate-800 text-gray-400 hover:text-gray-200'
                  }`}
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5 transition-transform group-hover:rotate-90" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 p-8">
                {/* Left Column - Main Info */}
                <div className="lg:col-span-3 space-y-8">
                  {/* Title Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClass}>
                        Название (русское) <span className="text-red-500">*</span>
                      </label>
                      <input
                        className={inputClass}
                        value={formData.title_ru}
                        onChange={(e) => handleInput('title_ru', e.target.value)}
                        placeholder="Например: Стальной алхимик"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Оригинальное название</label>
                      <input
                        className={inputClass}
                        value={formData.title_original}
                        onChange={(e) => handleInput('title_original', e.target.value)}
                        placeholder="Fullmetal Alchemist"
                      />
                    </div>
                  </div>

                  {/* Author Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClass}>Автор</label>
                      <input
                        className={inputClass}
                        value={formData.author}
                        onChange={(e) => handleInput('author', e.target.value)}
                        placeholder="Имя автора"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Художник</label>
                      <input
                        className={inputClass}
                        value={formData.artist}
                        onChange={(e) => handleInput('artist', e.target.value)}
                        placeholder="Имя художника"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className={labelClass}>Описание</label>
                    <textarea
                      className={textareaClass}
                      value={formData.description}
                      onChange={(e) => handleInput('description', e.target.value)}
                      placeholder="Краткое описание сюжета и основных персонажей..."
                    />
                  </div>

                  {/* Status Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className={labelClass}>Статус</label>
                      <select className={selectClass} value={formData.status} onChange={(e) => handleInput('status', e.target.value)}>
                        <option value="ongoing">Онгоинг</option>
                        <option value="completed">Завершён</option>
                        <option value="paused">Пауза</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Статус перевода</label>
                      <select className={selectClass} value={formData.translation_status} onChange={(e) => handleInput('translation_status', e.target.value)}>
                        <option value="продолжается">Продолжается</option>
                        <option value="завершён">Завершён</option>
                        <option value="заброшен">Заброшен</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Возрастной рейтинг</label>
                      <select className={selectClass} value={formData.age_rating} onChange={(e) => handleInput('age_rating', e.target.value)}>
                        <option value="0+">0+</option>
                        <option value="12+">12+</option>
                        <option value="16+">16+</option>
                        <option value="18+">18+</option>
                      </select>
                    </div>
                  </div>

                  {/* Year and Type */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelClass}>Год выпуска</label>
                      <input
                        type="number"
                        className={inputClass}
                        value={formData.release_year}
                        onChange={(e) => handleInput('release_year', clampYear(Number(e.target.value)))}
                        min="1900"
                        max={new Date().getFullYear() + 1}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Тип</label>
                      <select className={selectClass} value={formData.type} onChange={(e) => handleInput('type', e.target.value)}>
                        <option value="манга">Манга</option>
                        <option value="манхва">Манхва</option>
                        <option value="маньхуа">Маньхуа</option>
                      </select>
                    </div>
                  </div>

                  {/* Genres and Tags */}
                  <div className="space-y-8">
                    <ModernMultiSelect
                      items={GENRES}
                      value={formData.genres}
                      onChange={(v) => handleInput('genres', v)}
                      placeholder="Найти и добавить жанры..."
                      label="Жанры"
                    />
                    
                    <ModernMultiSelect
                      items={TAGS}
                      value={formData.tags}
                      onChange={(v) => handleInput('tags', v)}
                      placeholder="Найти и добавить теги..."
                      label="Теги"
                    />
                  </div>

                  {/* Source Links */}
                  <div>
                    <label className={labelClass}>Ссылки на источники</label>
                    <textarea
                      className={textareaClass}
                      value={formData.source_links}
                      onChange={(e) => handleInput('source_links', e.target.value)}
                      placeholder="https://example.com/manga&#10;https://another-site.com/title&#10;&#10;Укажите ссылки на оригинальные источники (по одной в строке)"
                      style={{ minHeight: '100px' }}
                    />
                  </div>

                  {/* Comment */}
                  <div>
                    <label className={labelClass}>Комментарий для модераторов</label>
                    <textarea
                      className={textareaClass}
                      value={formData.comment}
                      onChange={(e) => handleInput('comment', e.target.value)}
                      placeholder="Дополнительная информация, примечания или особенности, которые важно знать модераторам..."
                      style={{ minHeight: '100px' }}
                    />
                  </div>
                </div>

                {/* Right Column - Cover & Teams */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Cover Upload */}
                  <div>
                    <label className={labelClass}>Обложка тайтла</label>
                    <div className={dropzoneClass} onClick={() => fileInputRef.current?.click()}>
                      {coverPreview || formData.cover_url ? (
                        <div className="relative h-full w-full">
                          <img 
                            src={coverPreview || formData.cover_url} 
                            alt="Обложка" 
                            className="h-full w-full object-cover rounded-3xl" 
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-3xl transition-all duration-300 flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-900/90 rounded-2xl p-3">
                              <Upload className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center text-center p-8">
                          <div className={`rounded-full p-6 mb-4 transition-all duration-300 group-hover:scale-110 ${
                            theme === 'light' ? 'bg-blue-100 group-hover:bg-blue-200' : 'bg-slate-700 group-hover:bg-slate-600'
                          }`}>
                            <Upload className={`w-8 h-8 ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`} />
                          </div>
                          <h3 className={`font-semibold mb-2 ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                            Загрузить обложку
                          </h3>
                          <p className={`text-sm ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                            Перетащите изображение или нажмите для выбора
                          </p>
                          <p className={`text-xs mt-2 ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>
                            JPG, PNG до 10MB
                          </p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={onCover}
                      />
                    </div>

                    <div className="mt-4">
                      <label className={`text-xs font-medium ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'} mb-2 block`}>
                        Или укажите ссылку на изображение
                      </label>
                      <input
                        className={inputClass}
                        value={formData.cover_url}
                        onChange={(e) => handleInput('cover_url', e.target.value)}
                        placeholder="https://example.com/cover.jpg"
                      />
                    </div>
                  </div>

                  {/* Team Search */}
                  <div>
                    <label className={labelClass}>Команда переводчиков</label>
                    <div className={theme === 'light' ? 'bg-white border border-gray-200/80 rounded-2xl shadow-sm' : 'bg-slate-800/80 border border-slate-600/50 rounded-2xl shadow-sm'}>
                      <div className="p-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            className={`w-full bg-gray-50/50 dark:bg-slate-700/50 border-0 rounded-xl px-4 py-3 pl-10 text-sm placeholder-gray-500 dark:placeholder-slate-400 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}
                            value={teamQuery}
                            onChange={(e) => setTeamQuery(e.target.value)}
                            placeholder="Поиск команды переводчиков..."
                          />
                        </div>

                        {teamSearching && (
                          <div className={`flex items-center gap-2 text-sm mt-3 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Поиск команд...
                          </div>
                        )}

                        {teamResults.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {teamResults.slice(0, 5).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => addTeam(t)}
                                className={`w-full p-3 text-left rounded-xl transition-all duration-200 ${
                                  theme === 'light'
                                    ? 'hover:bg-blue-50 text-gray-900'
                                    : 'hover:bg-slate-700/50 text-white'
                                }`}
                              >
                                <div className="font-medium">{t.name}</div>
                                {t.slug && (
                                  <div className={`text-xs mt-1 ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                                    @{t.slug}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {teams.length > 0 && (
                      <div className="mt-4">
                        <div className={`text-sm font-medium mb-3 ${theme === 'light' ? 'text-gray-700' : 'text-gray-200'}`}>
                          Выбранные команды:
                        </div>
                        <div className="space-y-2">
                          {teams.map((t) => (
                            <div
                              key={t.id}
                              className={`flex items-center justify-between p-4 rounded-2xl ${
                                theme === 'light'
                                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200'
                                  : 'bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-800/30'
                              }`}
                            >
                              <div>
                                <div className={`font-medium ${theme === 'light' ? 'text-green-800' : 'text-green-300'}`}>
                                  {t.name}
                                </div>
                                {t.slug && (
                                  <div className={`text-xs ${theme === 'light' ? 'text-green-600' : 'text-green-400'}`}>
                                    @{t.slug}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => removeTeam(t.id)}
                                className={`p-2 rounded-xl transition-all duration-200 ${
                                  theme === 'light'
                                    ? 'hover:bg-red-100 text-red-600'
                                    : 'hover:bg-red-900/20 text-red-400'
                                }`}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status Messages */}
                  {error && (
                    <div className={`rounded-2xl border p-6 ${
                      theme === 'light'
                        ? 'border-red-200 bg-gradient-to-r from-red-50 to-rose-50 text-red-800'
                        : 'border-red-800/50 bg-gradient-to-r from-red-900/20 to-rose-900/20 text-red-200'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full mt-0.5 ${
                          theme === 'light' ? 'bg-red-500' : 'bg-red-400'
                        }`} />
                        <div>
                          <div className="font-semibold mb-1">Ошибка отправки</div>
                          <div className="text-sm">{error}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {ok && (
                    <div className={`rounded-2xl border p-6 ${
                      theme === 'light'
                        ? 'border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 text-green-800'
                        : 'border-green-800/50 bg-gradient-to-r from-green-900/20 to-emerald-900/20 text-green-200'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full mt-0.5 ${
                          theme === 'light' ? 'bg-green-500' : 'bg-green-400'
                        }`} />
                        <div>
                          <div className="font-semibold mb-1">Успешно отправлено!</div>
                          <div className="text-sm">Заявка отправлена на модерацию. Спасибо за ваш вклад!</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={footerClass}>
              <div className="flex items-center justify-between">
                <div className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                  <span className="text-red-500">*</span> - обязательные поля для заполнения
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setOpenState(false)}
                    className={`px-6 py-3 rounded-2xl font-medium text-sm transition-all duration-200 ${
                      theme === 'light'
                        ? 'text-gray-700 hover:bg-gray-100 border border-gray-200'
                        : 'text-gray-300 hover:bg-slate-800 border border-slate-600'
                    }`}
                    disabled={submitting}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className={`group relative inline-flex items-center gap-3 px-8 py-3 rounded-2xl font-semibold text-sm text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                      submitting
                        ? 'bg-gray-400'
                        : 'bg-gradient-to-r from-blue-600 to-purple-700 hover:from-blue-700 hover:to-purple-800'
                    }`}
                    disabled={submitting}
                  >
                    {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                    <span>{submitting ? 'Отправляется...' : 'Отправить на модерацию'}</span>
                    {!submitting && (
                      <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 rounded-2xl transition-colors" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}