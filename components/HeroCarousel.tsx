'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import Link from 'next/link';

export type CarouselItem = {
  id: number | string;
  title: string;
  coverUrl: string; // /banners/2.jpg из public
  href: string;     // ссылка на тайтл
};

type Props = { items: CarouselItem[] };

export function HeroCarousel({ items }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  useEffect(() => {
    if (isHovered || items.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isHovered, items.length]);

  const goToPrevious = () => setCurrentIndex((p) => (p - 1 + items.length) % items.length);
  const goToNext = () => setCurrentIndex((p) => (p + 1) % items.length);

  // touch swipe
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.targetTouches[0].clientX);
  const handleTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > 50) goToNext();
    if (distance < -50) goToPrevious();
    setTouchStart(0);
    setTouchEnd(0);
  };

  if (!items?.length) return null;

  return (
    <div
      className="relative w-full h-[400px] md:h-[500px] rounded-2xl overflow-hidden group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          {/* фон */}
          <div
            className="w-full h-full bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${items[currentIndex].coverUrl})` }}
          />

          {/* градиенты */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />

          {/* контент слева */}
          <div className="absolute inset-0 flex items-center">
            <div className="px-8 md:px-12 lg:px-16 max-w-2xl">
              <motion.h2
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 line-clamp-2"
              >
                {items[currentIndex].title}
              </motion.h2>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
              >
                <Link
                  href={items[currentIndex].href || '#'}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-300"
                >
                  <BookOpen className="w-5 h-5" />
                  Читать
                </Link>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* стрелки снизу по центру */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={goToPrevious}
          className="p-3 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full border border-white/20 transition-colors"
          aria-label="Предыдущий слайд"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={goToNext}
          className="p-3 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full border border-white/20 transition-colors"
          aria-label="Следующий слайд"
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </motion.button>
      </div>

      {/* точки справа снизу */}
      <div className="absolute bottom-6 right-6 flex gap-2">
        {items.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentIndex ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'
            }`}
            aria-label={`Слайд ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default HeroCarousel;
