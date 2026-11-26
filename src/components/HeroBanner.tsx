import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BannerSlide, Department } from '../types/store';
import { ResilientImage } from './ResilientImage';

interface HeroBannerProps {
  banners: BannerSlide[];
  mobileBannerUrl: string;
  accentColor: string;
  onSelectDepartment: (dept: Department) => void;
}

export function HeroBanner({
  banners,
  mobileBannerUrl,
  accentColor,
  onSelectDepartment,
}: HeroBannerProps) {
  const activeSlides = banners.filter((b) => b.active);
  const slides = activeSlides.length > 0 ? activeSlides : banners.slice(0, 1);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const safeIndex = index % Math.max(1, slides.length);
  const current = slides[safeIndex];
  if (!current) return null;

  const mobileSrc =
    current.mobileImageUrl?.trim() ||
    (safeIndex === 0 && mobileBannerUrl ? mobileBannerUrl : current.imageUrl);
  const customLink = current.linkUrl?.trim();

  return (
    <section className="max-w-[1360px] mx-auto px-3 sm:px-6 pt-4">
      <div className="relative w-full h-[220px] sm:h-[290px] lg:h-[320px] rounded-md overflow-hidden border border-[#272D38] bg-[#161A20]">
        {/* Desktop Image */}
        <div className="hidden sm:block w-full h-full">
          <ResilientImage
            src={current.imageUrl}
            alt={current.title}
            className="w-full h-full object-cover object-center"
          />
        </div>

        {/* Mobile Image (per-slide mobileImageUrl or fallback) */}
        <div className="sm:hidden w-full h-full">
          <ResilientImage
            src={mobileSrc}
            alt={current.title}
            className="w-full h-full object-cover object-center"
          />
        </div>

        {/* Contrast Scrim */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0D10]/95 via-[#0B0D10]/70 to-transparent" />

        {/* Banner Content */}
        <div className="absolute inset-0 flex flex-col justify-center px-5 sm:px-10 lg:px-14 max-w-2xl">
          <h1 className="font-display font-extrabold text-2xl sm:text-4xl lg:text-[42px] leading-[1.05] tracking-wide text-white uppercase text-balance">
            {current.title}
          </h1>
          <p className="mt-2 sm:mt-3 text-xs sm:text-sm md:text-base text-slate-200 line-clamp-2 max-w-xl">
            {current.subtitle}
          </p>
          <div className="mt-4 sm:mt-5 flex items-center gap-3">
            {customLink ? (
              <a
                href={customLink}
                target={customLink.startsWith('http') ? '_blank' : undefined}
                rel={customLink.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="px-5 py-2.5 rounded font-display font-bold text-sm sm:text-base tracking-wider uppercase text-white transition-transform active:scale-[0.98] whitespace-nowrap inline-flex items-center"
                style={{ backgroundColor: accentColor }}
              >
                {current.ctaLabel || 'CONFIRA AGORA'}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onSelectDepartment(current.targetDepartment)}
                className="px-5 py-2.5 rounded font-display font-bold text-sm sm:text-base tracking-wider uppercase text-white transition-transform active:scale-[0.98] whitespace-nowrap"
                style={{ backgroundColor: accentColor }}
              >
                {current.ctaLabel || 'CONFIRA AGORA'}
              </button>
            )}
          </div>
        </div>

        {/* Slide Controls */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev - 1 + slides.length) % slides.length)}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded bg-[#0B0D10]/70 hover:bg-[#0B0D10] border border-[#272D38] items-center justify-center text-white transition-colors"
              aria-label="Banner anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((prev) => (prev + 1) % slides.length)}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded bg-[#0B0D10]/70 hover:bg-[#0B0D10] border border-[#272D38] items-center justify-center text-white transition-colors"
              aria-label="Próximo banner"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {slides.map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setIndex(idx)}
                  aria-label={`Ir para slide ${idx + 1}`}
                  className={`h-2 rounded-sm transition-all ${
                    idx === safeIndex ? 'w-7' : 'w-2.5 bg-white/40 hover:bg-white/70'
                  }`}
                  style={idx === safeIndex ? { backgroundColor: accentColor } : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
