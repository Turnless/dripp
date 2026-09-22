// OBS browser source: the page itself must be fully transparent so only the
// alert card shows over the stream.
export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html, body { background: transparent !important; }`}</style>
      {children}
    </>
  );
}
