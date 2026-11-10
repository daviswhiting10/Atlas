export default function Loading() {
  return (
    <div className="fade-in" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-3 h-10 w-64" />
      <div className="skeleton mt-7 h-56 w-full !rounded-[26px]" />
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
      </div>
      <div className="skeleton mt-4 h-72 w-full !rounded-[22px]" />
    </div>
  );
}
