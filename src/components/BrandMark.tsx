type BrandMarkProps = {
  className?: string;
};

const BRAND_LOGO_URL = 'https://connektly.in/logo.svg';

export default function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <img
      src={BRAND_LOGO_URL}
      alt="Connektly"
      className={`object-contain ${className}`.trim()}
      decoding="async"
      draggable={false}
    />
  );
}
