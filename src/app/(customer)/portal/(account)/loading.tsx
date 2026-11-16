export default function PortalLoading() {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-6 motion-reduce:animate-none">
      <div className="flex flex-col gap-2">
        <div className="h-5 w-32 rounded-full bg-paper-deep" />
        <div className="h-9 w-56 max-w-full rounded-full bg-paper-deep" />
      </div>
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6">
        <div className="h-4 w-36 rounded-full bg-paper-deep" />
        <div className="h-10 w-44 rounded-full bg-paper-deep" />
        <div className="h-2 w-full rounded-full bg-paper-deep" />
        <div className="h-28 rounded-field bg-paper-deep" />
      </div>
      <div className="h-44 rounded-card border border-line bg-surface p-5" />
      <div className="h-52 rounded-card border border-line bg-surface p-5" />
    </div>
  );
}
