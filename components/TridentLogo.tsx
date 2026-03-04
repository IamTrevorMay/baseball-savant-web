export default function TridentLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="263 364 497 695" className={className} aria-hidden="true">
      <defs>
        <filter id="trident-recolor" color-interpolation-filters="sRGB">
          <feColorMatrix type="luminanceToAlpha" result="luma" />
          <feComponentTransfer in="luma" result="mask">
            <feFuncA type="discrete" tableValues="1 1 1 0 0 0 0 0" />
          </feComponentTransfer>
          <feFlood flood-color="currentColor" result="fill" />
          <feComposite in="fill" in2="mask" operator="in" />
        </filter>
      </defs>
      <image href="/trident-logo.png" width="1024" height="1536" filter="url(#trident-recolor)" />
    </svg>
  )
}
