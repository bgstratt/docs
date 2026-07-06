import logoMark from "./assets/logo-mark.png";

interface SiteBrandProps {
  href: string;
}

// Links back to the marketing site since these apps have no in-app way home.
export function SiteBrand({ href }: SiteBrandProps) {
  return (
    <a className="nm-site-brand" href={href} target="_blank" rel="noreferrer">
      <img className="nm-site-brand-mark" src={logoMark} alt="" width={128} height={128} />
      <span className="nm-site-brand-word">NodalMerge</span>
    </a>
  );
}
