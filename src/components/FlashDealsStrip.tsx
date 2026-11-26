import { useEffect, useState } from 'react';
import { Clock, Zap } from 'lucide-react';

interface FlashDealsStripProps {
  enabled: boolean;
  title: string;
  endTimeIso: string;
  accentColor: string;
  onFilterFlash: () => void;
  isFlashFiltered: boolean;
}

function getRemainingTime(endTimeIso: string) {
  const target = new Date(endTimeIso).getTime();
  const diff = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    expired: diff === 0,
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

export function FlashDealsStrip({
  enabled,
  title,
  endTimeIso,
  accentColor,
  onFilterFlash,
  isFlashFiltered,
}: FlashDealsStripProps) {
  const [timeLeft, setTimeLeft] = useState(() => getRemainingTime(endTimeIso));

  useEffect(() => {
    setTimeLeft(getRemainingTime(endTimeIso));
    const interval = setInterval(() => {
      setTimeLeft(getRemainingTime(endTimeIso));
    }, 1000);
    return () => clearInterval(interval);
  }, [endTimeIso]);

  if (!enabled) return null;

  return (
    <section className="max-w-[1360px] mx-auto px-3 sm:px-6 pt-4">
      <div className="w-full rounded-md bg-[#161A20] border border-[#272D38] px-4 py-3 sm:px-6 sm:py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded flex items-center justify-center shrink-0 text-white"
            style={{ backgroundColor: accentColor }}
          >
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display font-extrabold text-lg sm:text-2xl tracking-wider text-white uppercase leading-none">
              {title || 'OFERTAS RELÂMPAGO BTHTECH'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Preços especiais à vista no PIX enquanto durar o estoque
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 ml-auto">
          <div className="flex items-center gap-2 bg-[#0B0D10] border border-[#272D38] px-3 py-1.5 rounded">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-slate-400 hidden sm:inline">
              Termina em
            </span>
            <span
              className="font-mono-num font-bold text-sm sm:text-base tracking-wider"
              style={{ color: accentColor }}
            >
              {timeLeft.expired
                ? '00:00:00'
                : `${timeLeft.hours}:${timeLeft.minutes}:${timeLeft.seconds}`}
            </span>
          </div>

          <button
            type="button"
            onClick={onFilterFlash}
            className="px-3.5 py-2 rounded border text-xs font-display font-bold tracking-wider uppercase transition-colors whitespace-nowrap"
            style={
              isFlashFiltered
                ? { backgroundColor: accentColor, borderColor: accentColor, color: '#FFFFFF' }
                : { borderColor: '#272D38', color: '#FFFFFF' }
            }
          >
            {isFlashFiltered ? 'VER TODOS' : 'FILTRAR OFERTAS'}
          </button>
        </div>
      </div>
    </section>
  );
}
