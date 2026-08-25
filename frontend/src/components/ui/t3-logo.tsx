/** T3 (Türkiye Teknoloji Takımı) amblemi — siyah/beyaz, üç kollu döner
 *  simetride birbirine kenetlenen "bayrak" formları ve ortada altıgen
 *  boşluk. Gerçek marka varlığı elde edilene kadar görselden elle
 *  yaklaştırılmıştır; rengini `currentColor`'dan alır. */
export function T3Logo({ size = 18, className }: { size?: number; className?: string }) {
  const blade = "M50,7 L67,33 L57,33 L50,45 L43,33 L33,33 Z";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      aria-label="T3"
      role="img"
    >
      <g transform="rotate(0 50 50)">
        <path d={blade} />
      </g>
      <g transform="rotate(120 50 50)">
        <path d={blade} />
      </g>
      <g transform="rotate(240 50 50)">
        <path d={blade} />
      </g>
    </svg>
  );
}

export default T3Logo;
