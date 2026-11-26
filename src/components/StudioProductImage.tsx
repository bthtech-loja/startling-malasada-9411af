import { ResilientImage } from './ResilientImage';

interface StudioProductImageProps {
  src?: string;
  alt: string;
  fallbackLabel?: string;
  hoverZoom?: boolean;
  className?: string;
}

export function StudioProductImage({
  src,
  alt,
  fallbackLabel,
  hoverZoom = false,
  className = '',
}: StudioProductImageProps) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none bg-[#14171C] ${className}`}
    >
      {/* Parede de Fundo (75% superior): Gradiente vertical #23272F -> #14171C */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[75%]"
        style={{
          background: 'linear-gradient(180deg, #23272F 0%, #14171C 100%)',
        }}
        aria-hidden="true"
      />

      {/* Luz radial sutil atrás do centro do produto */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.08), transparent 65%)',
        }}
        aria-hidden="true"
      />

      {/* Superfície / Mesa (25% inferior): Bancada escura fosca #181B20 com linha de horizonte */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[25%] bg-[#181B20] border-t border-white/10"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(0,0,0,0.32) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Sombra de contato realista abaixo do produto sobre a mesa */}
      {src && (
        <div
          className="pointer-events-none absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[56%] h-4 rounded-full bg-black/80 blur-md"
          aria-hidden="true"
        />
      )}

      {/* Produto centralizado (altura 80% do contêiner) apoiado visualmente sobre a bancada */}
      <div className="pointer-events-none relative z-10 w-full h-full">
        <div className="absolute inset-x-4 bottom-[12%] h-[80%] flex items-end justify-center">
          <ResilientImage
            src={src}
            alt={alt}
            fallbackLabel={fallbackLabel}
            className={`max-h-full max-w-full h-full w-auto object-contain object-bottom drop-shadow-[0_12px_16px_rgba(0,0,0,0.75)] ${
              hoverZoom
                ? 'transition-transform duration-200 group-hover:scale-[1.04]'
                : ''
            }`}
          />
        </div>
      </div>
    </div>
  );
}
