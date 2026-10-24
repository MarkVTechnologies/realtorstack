import Link from "next/link";

export default function SiteNotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-gray-900">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-gray-600">The property may have been sold out or the link has changed.</p>
      <Link href="/" className="mt-6 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white">Go home</Link>
    </main>
  );
}
