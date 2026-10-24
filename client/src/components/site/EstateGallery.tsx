"use client";

import { useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { A11y, Keyboard, Navigation, Pagination, Zoom } from "swiper/modules";
import { LuExpand, LuImages, LuX } from "react-icons/lu";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/zoom";
import type { MediaImage } from "@/lib/site-data";

function srcSet(img: MediaImage) {
  const v = img.variants ?? {};
  return [v.sm && `${v.sm} 480w`, v.md && `${v.md} 960w`, v.lg && `${v.lg} 1600w`].filter(Boolean).join(", ") || undefined;
}

/** Swipeable estate photo gallery with a fullscreen, pinch-zoom viewer. */
export function EstateGallery({ images, name }: { images: MediaImage[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  if (!images.length) {
    return <div className="aspect-[16/9] rounded-3xl bg-gradient-to-br from-[var(--brand)] to-[var(--accent)]" role="img" aria-label={name} />;
  }

  return (
    <>
      <div className="estate-gallery group relative overflow-hidden rounded-3xl bg-gray-100 shadow-[var(--shadow-soft)]">
        <Swiper
          modules={[Navigation, Pagination, Keyboard, A11y]}
          navigation
          pagination={{ clickable: true, dynamicBullets: images.length > 6 }}
          keyboard={{ enabled: true }}
          a11y={{ prevSlideMessage: "Previous photo", nextSlideMessage: "Next photo" }}
          onSlideChange={(s) => setActive(s.realIndex)}
          className="aspect-[4/3] sm:aspect-[16/9]"
        >
          {images.map((img, i) => (
            <SwiperSlide key={img.url}>
              <button type="button" onClick={() => setOpen(i)} className="block h-full w-full cursor-zoom-in" aria-label={`View photo ${i + 1} of ${images.length} full screen`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.variants?.md ?? img.url} srcSet={srcSet(img)} sizes="(min-width: 1024px) 66vw, 100vw" alt={img.alt || `${name} photo ${i + 1}`}
                  width={img.width ?? 1600} height={img.height ?? 1000} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} decoding="async"
                  className="h-full w-full object-cover" />
              </button>
            </SwiperSlide>
          ))}
        </Swiper>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="pointer-events-none absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">
          <LuImages /> {active + 1} / {images.length}
        </div>
        <button type="button" onClick={() => setOpen(active)} className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-900 shadow backdrop-blur transition hover:bg-white">
          <LuExpand /> View all
        </button>
      </div>

      <dialog ref={dialog} onClose={() => setOpen(null)} className="estate-gallery m-0 h-full max-h-none w-full max-w-none bg-black/95 p-0 backdrop:bg-black">
        {open !== null && (
          <div className="relative flex h-full flex-col">
            <button type="button" onClick={() => setOpen(null)} className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2.5 text-xl text-white ring-1 ring-white/20 hover:bg-white/20" aria-label="Close gallery"><LuX /></button>
            <Swiper modules={[Navigation, Pagination, Keyboard, Zoom, A11y]} initialSlide={open} navigation pagination={{ type: "fraction" }} keyboard={{ enabled: true }} zoom className="h-full w-full">
              {images.map((img, i) => (
                <SwiperSlide key={img.url} className="flex items-center justify-center">
                  <div className="swiper-zoom-container">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.variants?.lg ?? img.url} alt={img.alt || `${name} photo ${i + 1}`} loading="lazy" className="max-h-[88vh] max-w-full object-contain" />
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        )}
      </dialog>
    </>
  );
}
