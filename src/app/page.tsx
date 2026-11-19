import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <span className="text-2xl font-black tracking-tight text-emerald-300">FoodBridge</span>
        <div className="flex gap-3">
          <Link href="/login" className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold hover:bg-slate-800">Log in</Link>
          <Link href="/register" className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300">Register</Link>
        </div>
      </nav>
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-20 sm:pt-28">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">Food Waste Redistribution & Resource Allocation</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-black leading-tight tracking-tight sm:text-7xl">Good food deserves <span className="text-emerald-300">a second destination.</span></h1>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-300">Connecting donors with NGOs to redistribute surplus food efficiently. Track donations, requests, allocations, and pickups in one place.</p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Link href="/register" className="rounded-xl bg-emerald-400 px-6 py-3 font-bold text-slate-950 hover:bg-emerald-300">Get started</Link>
          <Link href="/login" className="rounded-xl border border-slate-600 px-6 py-3 font-bold hover:bg-slate-800">I have an account</Link>
        </div>
        <div className="mt-20 grid max-w-4xl gap-4 sm:grid-cols-3">
          {[
            ["01", "List surplus food", "Donors register available food and quantities."],
            ["02", "Match NGO needs", "Food requirements and donations are compared for suitable allocation."],
            ["03", "Track pickups", "Follow allocations through collection and delivery."],
          ].map(([number, title, description]) => (
            <div key={number} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm font-black text-emerald-300">{number}</p>
              <h2 className="mt-4 text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
