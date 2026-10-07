import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#090d16] text-white flex flex-col items-center justify-center p-4">
      <h2 className="text-2xl font-bold">Page Not Found</h2>
      <p className="text-sm text-slate-400 mt-2">Could not find requested resource</p>
      <Link
        href="/dashboard"
        className="mt-4 px-4 py-2 bg-emerald-500 text-slate-950 font-semibold rounded-lg text-xs"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
