/** Progress's frame, shown the instant the tab is tapped while the charts load: the lift line, the chart, the history. */
export default function Loading() {
  return (
    <div className="fade-in pt-4" aria-busy="true" aria-label="Loading progress">
      <div className="skeleton h-11 w-40" />
      <div className="skeleton mt-3 h-14 w-48" />
      <div className="skeleton mt-5 h-52 w-full !rounded-[22px]" />
      <div className="skeleton mt-10 h-40 w-full !rounded-[22px]" />
    </div>
  );
}
