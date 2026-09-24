/**
 * Placeholder in the shape of the app (header, page content, tab bar) shown
 * while the account loads the first time -- so opening dripp looks like the
 * app arriving, not a separate loading screen. Mirrors AppShell's layout.
 */
export function AppSkeleton() {
  return (
    <div className="bg-field min-h-dvh" aria-busy="true" aria-label="Loading">
      {/* Desktop header */}
      <div className="fixed inset-x-0 top-4 hidden justify-center px-6 lg:flex">
        <div className="glass flex h-14 w-full max-w-[1040px] items-center justify-between rounded-full px-5">
          <Bone className="h-5 w-20" />
          <div className="flex gap-2">
            <Bone className="h-9 w-24 rounded-full" />
            <Bone className="h-9 w-24 rounded-full" />
            <Bone className="h-9 w-24 rounded-full" />
          </div>
          <Bone className="h-10 w-10 rounded-full" />
        </div>
      </div>

      {/* Mobile header */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] lg:hidden">
        <Bone className="h-5 w-20" />
        <Bone className="h-10 w-10 rounded-full" />
      </div>

      <main className="px-4 pb-36 pt-4 lg:px-8 lg:pb-16 lg:pt-32">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
          <Bone className="h-8 w-40" />
          <div className="glass rounded-card p-6">
            <Bone className="h-4 w-24" />
            <Bone className="mt-4 h-12 w-48" />
            <div className="mt-6 flex gap-3">
              <Bone className="h-11 flex-1 rounded-full" />
              <Bone className="h-11 flex-1 rounded-full" />
            </div>
          </div>
          <div className="glass flex flex-col gap-4 rounded-card p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="h-10 w-10 rounded-2xl" />
                <div className="flex-1">
                  <Bone className="h-4 w-1/2" />
                  <Bone className="mt-2 h-3 w-1/3" />
                </div>
                <Bone className="h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Mobile tab bar */}
      <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="glass flex h-16 items-center justify-around rounded-full px-4">
          <Bone className="h-6 w-6 rounded-full" />
          <Bone className="h-6 w-6 rounded-full" />
          <Bone className="h-12 w-12 rounded-full" />
          <Bone className="h-6 w-6 rounded-full" />
          <Bone className="h-6 w-6 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function Bone({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-lg bg-deep/[0.07] ${className}`} aria-hidden />;
}
