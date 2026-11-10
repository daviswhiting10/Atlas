export default function Loading() {
  return (
    <div className="fade-in" aria-busy="true" aria-label="Loading workout">
      <div className="skeleton h-12 w-full" />
      <div className="mt-4 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-11 w-36 shrink-0" />
        ))}
      </div>
      <div className="skeleton mt-5 h-10 w-56" />
      <div className="skeleton mt-4 h-28 w-full !rounded-[22px]" />
      <div className="skeleton mt-4 h-60 w-full !rounded-[22px]" />
    </div>
  );
}
