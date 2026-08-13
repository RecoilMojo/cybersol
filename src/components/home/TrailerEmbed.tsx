import { LINKS } from "@/lib/links";

type Props = {
  className?: string;
};

/** Muted autoplay — browsers block unmuted autoplay. */
export function TrailerEmbed({ className }: Props) {
  return (
    <div className={className ?? "trailer-frame"}>
      <iframe
        src={LINKS.trailerEmbed}
        title="Cybersoul 2 gameplay trailer"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
